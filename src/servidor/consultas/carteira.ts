import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { periodoDoMes, somarDias } from '@/lib/datas';
import { somenteDigitos } from '@/lib/documento';
import { escopoCotas, exigir, type Sessao } from '../contexto';
import { param, paginaDe, POR_PAGINA, type Params } from './comum';
import { registrarLeituraDadoPessoal } from '../auditoria';

export interface FiltroCarteira {
  busca: string;
  mes: string;
  vendedor: string;
  situacao: string;
  gerencia: string;
  semVendedor: boolean;
  semCategoria: boolean;
  pessoa: string;
}

export function lerFiltroCarteira(p: Params): FiltroCarteira {
  return {
    busca: param(p, 'busca'), mes: param(p, 'mes'), vendedor: param(p, 'vendedor'), situacao: param(p, 'situacao'),
    gerencia: param(p, 'gerencia'), semVendedor: param(p, 'semVendedor') === '1', semCategoria: param(p, 'semCategoria') === '1', pessoa: param(p, 'pessoa'),
  };
}

/** Filtro da carteira SEMPRE combinado com o recorte de visibilidade (AND no SQL). */
export function whereCarteira(s: Sessao, f: FiltroCarteira, semSituacao = false): Prisma.CotaWhereInput {
  const e: Prisma.CotaWhereInput[] = [escopoCotas(s)];
  if (f.busca) {
    const dig = somenteDigitos(f.busca);
    const gc = /^\s*(\d+)\s*[/.\- ]\s*(\d+)\s*$/.exec(f.busca);
    e.push({
      OR: [
        { clienteNome: { contains: f.busca, mode: 'insensitive' } },
        ...(dig.length >= 3 ? [{ cpfCliente: { contains: dig } }, { contrato: { contains: dig } }, { grupo: dig }] : []),
        ...(gc ? [{ grupo: (gc[1] as string).replace(/^0+(?=\d)/, ''), cota: (gc[2] as string).replace(/^0+(?=\d)/, '') }] : []),
        { contrato: f.busca },
      ],
    });
  }
  const per = f.mes ? periodoDoMes(f.mes) : null;
  if (per) e.push({ dataVenda: { gte: per.de, lt: somarDias(per.ate, 1) } });
  if (f.vendedor) e.push({ snapVendedorId: f.vendedor });
  if (f.pessoa) e.push({ snapVendedor: { pessoaId: f.pessoa } });
  if (f.situacao && !semSituacao) e.push({ situacao: f.situacao });
  if (f.gerencia) e.push({ snapGerenciaId: f.gerencia });
  if (f.semVendedor) e.push({ snapVendedorId: null });
  if (f.semCategoria) e.push({ snapCategoriaId: null });
  return { AND: e };
}

export async function listarCarteira(s: Sessao, p: Params) {
  exigir(s, 'cotas');
  const f = lerFiltroCarteira(p);
  const pagina = paginaDe(p);
  const where = whereCarteira(s, f);
  const escopo = escopoCotas(s);
  const [total, soma, semVendedor, cotas, situacoes, meses, vendedores, gerencias] = await Promise.all([
    prisma.cota.count({ where }),
    prisma.cota.aggregate({ where, _sum: { credito: true } }),
    prisma.cota.count({ where: { AND: [where, { snapVendedorId: null }] } }),
    prisma.cota.findMany({
      where, orderBy: [{ dataVenda: 'desc' }, { grupo: 'asc' }, { cota: 'asc' }], skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA,
      include: { snapVendedor: { include: { pessoa: true } }, snapCategoria: true, snapEquipe: true, snapGerencia: true },
    }),
    prisma.cota.groupBy({ by: ['situacao'], where: whereCarteira(s, f, true), _count: true, orderBy: { _count: { situacao: 'desc' } } }),
    prisma.$queryRaw<Array<{ mes: string; n: number }>>`
      SELECT to_char("dataVenda", 'YYYY-MM') AS mes, COUNT(*)::int AS n FROM "cota" WHERE ${escopoSql(s)} GROUP BY 1 ORDER BY 1 DESC`,
    prisma.vendedor.findMany({ where: { cotasSnapshot: { some: escopo } }, select: { id: true, nome: true, status: true, tipoDocumento: true }, orderBy: { nome: 'asc' } }),
    prisma.gerencia.findMany({ where: { cotasSnapshot: { some: escopo } }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  ]);
  return { filtro: f, pagina, total, creditoTotal: soma._sum.credito ?? new Prisma.Decimal(0), semVendedor, cotas, situacoes, meses, vendedores, gerencias };
}

/** Recorte em SQL cru (mesma regra de escopoCotas) para as consultas agregadas. */
export function escopoSql(s: Sessao): Prisma.Sql {
  const w = escopoCotas(s);
  if ('snapGerenciaId' in w) return Prisma.sql`"snapGerenciaId" = ${w.snapGerenciaId as string}`;
  if ('snapEquipeId' in w) return Prisma.sql`"snapEquipeId" = ${w.snapEquipeId as string}`;
  if ('id' in w) return Prisma.sql`FALSE`;
  return Prisma.sql`TRUE`;
}

export async function fichaDaCota(s: Sessao, id: string) {
  exigir(s, 'cotas');
  const cota = await prisma.cota.findFirst({
    where: { AND: [{ id }, escopoCotas(s)] },
    include: {
      administradora: true,
      snapVendedor: { include: { pessoa: true } }, vendedor: { include: { pessoa: true } },
      snapCategoria: true, snapSegmento: true, snapModalidadeFlex: true, snapEquipe: true, snapGerencia: true,
      comissoes: { include: { titularPessoa: true, titularVendedor: true, folha: true }, orderBy: [{ destino: 'asc' }, { parcela: 'asc' }, { criadoEm: 'asc' }] },
      estornos: { include: { titularPessoa: true, movimentos: { orderBy: { criadoEm: 'asc' } } }, orderBy: { criadoEm: 'asc' } },
      lancamentos: { orderBy: { criadoEm: 'asc' } },
      comissoesAdm: { orderBy: { criadoEm: 'asc' } },
      bonus: { include: { gerencia: true }, orderBy: { criadoEm: 'asc' } },
      transferencias: { orderBy: { criadoEm: 'asc' } },
      versoes: { orderBy: { criadoEm: 'desc' }, take: 20, include: { importacao: { select: { nomeArquivo: true } } } },
      pendencias: { where: { resolvidaEm: null } },
      divergencias: { orderBy: { criadoEm: 'desc' } },
    },
  });
  if (!cota) return null;
  const pessoasSnap = await prisma.pessoa.findMany({ where: { id: { in: [cota.snapSupervisorPessoaId, cota.snapGerentePessoaId].filter((x): x is string => x !== null) } } });
  const vendedoresTransf = await prisma.vendedor.findMany({
    where: { id: { in: cota.transferencias.flatMap((t) => [t.vendedorAnteriorId, t.vendedorNovoId]).filter((x): x is string => x !== null) } },
    select: { id: true, nome: true },
  });
  const auditoria = await prisma.auditLog.findMany({ where: { entidade: 'Cota', entidadeId: id }, orderBy: { criadoEm: 'desc' }, take: 30, include: { usuario: { select: { nome: true } } } });
  // LGPD: quem abriu a ficha de qual cliente.
  await registrarLeituraDadoPessoal(prisma, s, 'Cota', id, 'consulta da ficha da cota');
  return { cota, supervisor: pessoasSnap.find((p) => p.id === cota.snapSupervisorPessoaId) ?? null, gerente: pessoasSnap.find((p) => p.id === cota.snapGerentePessoaId) ?? null, vendedoresTransf, auditoria };
}
