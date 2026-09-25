import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ZERO } from '@/lib/dinheiro';
import { hoje, vigenteEm } from '@/lib/datas';
import { somenteDigitos } from '@/lib/documento';
import { normalizarNome } from '@/lib/texto';
import { escopoVendedores, exigir, recorteDe, type Sessao } from '../contexto';
import { situacoesDePromocao } from '../promocao';

/** Desligada é a pessoa cujos documentos TODOS pararam. Sem documento não é desligada. */
export function pessoaDesligada(docs: ReadonlyArray<{ status: 'ATIVO' | 'DESLIGADO' }>): boolean {
  return docs.length > 0 && docs.every((d) => d.status === 'DESLIGADO');
}

export async function contarVendedoresSemCadastro(): Promise<number> {
  const r = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(DISTINCT COALESCE(NULLIF("vendedorDocImportado", ''), UPPER("vendedorNomeImportado")))::bigint AS n
      FROM "cota" WHERE "vendedorId" IS NULL AND ("vendedorNomeImportado" IS NOT NULL OR "vendedorDocImportado" IS NOT NULL)`;
  return Number(r[0]?.n ?? 0n);
}

export interface LinhaSemCadastro {
  nome: string | null;
  documento: string | null;
  cotas: number;
  credito: Prisma.Decimal;
  primeiraVenda: Date;
  ultimaVenda: Date;
}

export async function listarSemCadastro(s: Sessao): Promise<LinhaSemCadastro[]> {
  exigir(s, 'vendedores', 'editar');
  return prisma.$queryRaw<LinhaSemCadastro[]>`
    SELECT MIN("vendedorNomeImportado") AS nome, NULLIF("vendedorDocImportado", '') AS documento, COUNT(*)::int AS cotas,
           SUM("credito") AS credito, MIN("dataVenda") AS "primeiraVenda", MAX("dataVenda") AS "ultimaVenda"
      FROM "cota"
     WHERE "vendedorId" IS NULL AND ("vendedorNomeImportado" IS NOT NULL OR "vendedorDocImportado" IS NOT NULL)
     GROUP BY NULLIF("vendedorDocImportado", ''), CASE WHEN NULLIF("vendedorDocImportado", '') IS NULL THEN UPPER("vendedorNomeImportado") END
     ORDER BY SUM("credito") DESC
     LIMIT 500`;
}

export async function listarVigenciasFuturas(s: Sessao) {
  exigir(s, 'vendedores', 'editar');
  const d = hoje();
  const [categorias, alocacoes] = await Promise.all([
    prisma.vendedorCategoria.findMany({ where: { vigenteDe: { gt: d } }, include: { categoria: true, vendedor: { include: { pessoa: true } } }, orderBy: { vigenteDe: 'asc' } }),
    prisma.vendedorAlocacao.findMany({ where: { vigenteDe: { gt: d } }, include: { equipe: { include: { gerencia: true } }, vendedor: { include: { pessoa: true } } }, orderBy: { vigenteDe: 'asc' } }),
  ]);
  return { categorias, alocacoes };
}

export async function listarVendedores(s: Sessao, busca: string) {
  exigir(s, 'vendedores');
  const escopo = escopoVendedores(s);
  const d = hoje();
  const buscaNome = normalizarNome(busca);
  const buscaDoc = somenteDigitos(busca);
  const filtroBusca: Prisma.VendedorWhereInput = busca === '' ? {} : {
    OR: [
      ...(buscaNome !== '' ? [{ nomeNormalizado: { contains: buscaNome } }, { pessoa: { nomeNormalizado: { contains: buscaNome } } }] : []),
      ...(buscaDoc.length >= 3 ? [{ documento: { contains: buscaDoc } }] : []),
    ],
  };
  const docs = await prisma.vendedor.findMany({
    where: { AND: [escopo, filtroBusca] },
    include: {
      pessoa: true,
      categorias: { include: { categoria: true } },
      recuperacoes: { where: { canceladoEm: null } },
      _count: { select: { cotasSnapshot: true } },
    },
    orderBy: { pessoa: { nome: 'asc' } },
    take: 2000,
  });
  const porPessoa = new Map<string, { pessoa: (typeof docs)[number]['pessoa']; documentos: typeof docs }>();
  for (const doc of docs) {
    const p = porPessoa.get(doc.pessoaId) ?? { pessoa: doc.pessoa, documentos: [] };
    p.documentos.push(doc);
    porPessoa.set(doc.pessoaId, p);
  }
  const promocao = await situacoesDePromocao(prisma, [...porPessoa.keys()]);
  const linhas = [...porPessoa.values()].map(({ pessoa, documentos }) => ({
    pessoa,
    documentos: documentos.map((doc) => ({
      id: doc.id, tipo: doc.tipoDocumento, documento: doc.documento, status: doc.status,
      categoria: doc.categorias.find((c) => vigenteEm(d, c.vigenteDe, c.vigenteAte))?.categoria ?? null,
      emRecuperacao: doc.recuperacoes.some((r) => vigenteEm(d, r.inicio, r.fim)),
      cotas: doc._count.cotasSnapshot,
    })),
    desligada: pessoaDesligada(documentos),
    cotas: documentos.reduce((a, doc) => a + doc._count.cotasSnapshot, 0),
    promocao: promocao.get(pessoa.id) ?? null,
  }));
  const temVigenciaFutura = recorteDe(s).tipo === 'TOTAL'
    ? (await prisma.vendedorCategoria.count({ where: { vigenteDe: { gt: d } } })) + (await prisma.vendedorAlocacao.count({ where: { vigenteDe: { gt: d } } }))
    : 0;
  return {
    ativos: linhas.filter((l) => !l.desligada),
    desligados: linhas.filter((l) => l.desligada),
    temVigenciaFutura,
    volumeZero: ZERO,
  };
}

export async function fichaDaPessoa(s: Sessao, pessoaId: string) {
  exigir(s, 'vendedores');
  const pessoa = await prisma.pessoa.findUnique({ where: { id: pessoaId } });
  if (!pessoa) return null;
  const documentos = await prisma.vendedor.findMany({
    where: { AND: [{ pessoaId }, escopoVendedores(s)] },
    include: {
      categorias: { include: { categoria: true }, orderBy: { vigenteDe: 'desc' } },
      alocacoes: { include: { equipe: { include: { gerencia: true } } }, orderBy: { vigenteDe: 'desc' } },
      recuperacoes: { orderBy: { inicio: 'desc' } },
      aliases: true,
      _count: { select: { cotasSnapshot: true } },
    },
    orderBy: { criadoEm: 'asc' },
  });
  // Fora do recorte: nem a existência da pessoa é revelada.
  if (documentos.length === 0 && recorteDe(s).tipo !== 'TOTAL') return null;
  const promocao = (await situacoesDePromocao(prisma, [pessoaId])).get(pessoaId) ?? null;
  const producaoPorDoc = await prisma.cota.groupBy({ by: ['snapVendedorId'], where: { snapVendedorId: { in: documentos.map((doc) => doc.id) } }, _sum: { credito: true }, _count: true });
  const vinculos = await prisma.pessoaVinculo.findMany({ where: { pessoaId }, orderBy: { criadoEm: 'asc' } });
  return { pessoa, documentos, promocao, producaoPorDoc, vinculos, desligada: pessoaDesligada(documentos) };
}
