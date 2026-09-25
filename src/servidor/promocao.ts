import { Prisma } from '@prisma/client';
import type { Db } from '@/lib/db';
import { dec, formatarMoeda, ZERO, type Dec } from '@/lib/dinheiro';
import { hoje, vigenteEm } from '@/lib/datas';
import { situacaoDePromocao, type MetaVigente, type SituacaoPromocao } from '@/dominio/promocao';
import { promocaoIncluiCanceladas } from './configuracao';
import { notificar } from './notificacoes';

export interface PromocaoDaPessoa {
  pessoaId: string;
  volume: Dec;
  categoriaAtual: { id: string; nome: string; ordem: number } | null;
  situacao: SituacaoPromocao;
}

/** Produção acumulada por pessoa: carteira completa, crédito TOTAL (flex não reduz), só categorias que contam para promoção. */
export async function producaoPorPessoa(db: Db, pessoaIds: readonly string[] | null): Promise<Map<string, Dec>> {
  const incluiCanceladas = await promocaoIncluiCanceladas(db);
  const filtroPessoas = pessoaIds === null ? Prisma.empty : Prisma.sql`AND v."pessoaId" IN (${Prisma.join(pessoaIds.length > 0 ? pessoaIds : ['__nenhuma__'])})`;
  const filtroCancel = incluiCanceladas ? Prisma.empty : Prisma.sql`AND NOT c."cancelada"`;
  const linhas = await db.$queryRaw<Array<{ pessoaId: string; volume: Prisma.Decimal }>>`
    SELECT v."pessoaId" AS "pessoaId", COALESCE(SUM(c."credito"), 0) AS volume
      FROM "cota" c
      JOIN "vendedor" v ON v."id" = c."snapVendedorId"
      LEFT JOIN "categoria_vendedor" k ON k."id" = c."snapCategoriaId"
     WHERE (k."id" IS NULL OR k."contaParaPromocao") ${filtroCancel} ${filtroPessoas}
     GROUP BY v."pessoaId"`;
  return new Map(linhas.map((l) => [l.pessoaId, dec(l.volume)]));
}

export async function metasVigentes(db: Db, data: Date): Promise<MetaVigente[]> {
  const metas = await db.metaPromocao.findMany({ include: { categoriaAlvo: true } });
  return metas
    .filter((m) => vigenteEm(data, m.vigenteDe, m.vigenteAte))
    .map((m) => ({
      categoriaOrigemId: m.categoriaOrigemId, categoriaAlvoId: m.categoriaAlvoId, categoriaAlvoNome: m.categoriaAlvo.nome,
      volumeMinimo: dec(m.volumeMinimo), alertaAoFaltar: dec(m.alertaAoFaltar), documentoExigido: m.documentoExigido,
    }));
}

/** Situação de promoção por pessoa: degrau atual = categoria vigente mais alta entre os documentos ATIVOS. */
export async function situacoesDePromocao(db: Db, pessoaIds: readonly string[] | null, data = hoje()): Promise<Map<string, PromocaoDaPessoa>> {
  const [volumes, metas, docs] = await Promise.all([
    producaoPorPessoa(db, pessoaIds),
    metasVigentes(db, data),
    db.vendedor.findMany({
      where: { status: 'ATIVO', ...(pessoaIds === null ? {} : { pessoaId: { in: [...pessoaIds] } }) },
      select: { pessoaId: true, categorias: { include: { categoria: true } } },
    }),
  ]);
  const atual = new Map<string, { id: string; nome: string; ordem: number }>();
  for (const d of docs) {
    const vig = d.categorias.find((c) => vigenteEm(data, c.vigenteDe, c.vigenteAte));
    if (!vig) continue;
    const a = atual.get(d.pessoaId);
    if (!a || vig.categoria.ordem > a.ordem) atual.set(d.pessoaId, { id: vig.categoria.id, nome: vig.categoria.nome, ordem: vig.categoria.ordem });
  }
  const ids = new Set<string>([...volumes.keys(), ...atual.keys(), ...(pessoaIds ?? [])]);
  const saida = new Map<string, PromocaoDaPessoa>();
  for (const id of ids) {
    const volume = volumes.get(id) ?? ZERO;
    const cat = atual.get(id) ?? null;
    saida.set(id, { pessoaId: id, volume, categoriaAtual: cat, situacao: situacaoDePromocao(volume, cat?.id ?? null, metas) });
  }
  return saida;
}

/** Notificações persistentes de meta (desligados ficam de fora: só pessoas com documento ativo têm degrau atual). */
export async function avaliarAlertasDePromocao(db: Db): Promise<{ aptos: number; proximos: number }> {
  const situacoes = await situacoesDePromocao(db, null);
  const pessoas = new Map((await db.pessoa.findMany({ where: { id: { in: [...situacoes.keys()] } }, select: { id: true, nome: true } })).map((p) => [p.id, p.nome]));
  let aptos = 0;
  let proximos = 0;
  for (const s of situacoes.values()) {
    if (!s.categoriaAtual || !s.situacao.proximaCategoria) continue;
    const nome = pessoas.get(s.pessoaId) ?? 'Vendedor';
    if (s.situacao.atingiu) {
      aptos++;
      await notificar(db, {
        tipo: 'APTO_A_PROMOCAO', severidade: 'ATENCAO', titulo: `${nome} atingiu a meta de ${s.situacao.proximaCategoria}`,
        mensagem: `Produção acumulada de ${formatarMoeda(s.volume)}. A promoção é um ato registrado: alguém precisa decidir na ficha do vendedor.`,
        link: `/vendedores/${s.pessoaId}`, chave: `apto-${s.pessoaId}-${s.categoriaAtual.id}`, perfis: ['ADMINISTRADOR', 'CADASTRO'],
      });
    } else if (s.situacao.proxima) {
      proximos++;
      await notificar(db, {
        tipo: 'PROXIMO_DA_META', severidade: 'INFO', titulo: `${nome} está perto de ${s.situacao.proximaCategoria}`,
        mensagem: `Faltam ${formatarMoeda(s.situacao.falta)} para a meta de ${formatarMoeda(s.situacao.meta)}.`,
        link: `/vendedores/${s.pessoaId}`, chave: `proximo-${s.pessoaId}-${s.categoriaAtual.id}`, perfis: ['ADMINISTRADOR', 'CADASTRO'],
      });
    }
  }
  return { aptos, proximos };
}
