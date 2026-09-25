import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dec, type Dec } from '@/lib/dinheiro';
import { deslocarCompetencia, fimExclusivo, periodoDoMes, type Periodo } from '@/lib/datas';
import { escopoComissoes, escopoCotas, escopoEstornos, exigir, type Sessao } from '../contexto';
import { escopoSql } from './carteira';
import { PENDENCIAS_DE_SNAPSHOT } from '../servicos/cotas';

export interface ResumoPeriodo {
  producao: Dec;
  cotas: number;
  comissaoPrevista: Dec;
}

async function resumoDoPeriodo(s: Sessao, p: Periodo): Promise<ResumoPeriodo> {
  const cotaNoPeriodo: Prisma.CotaWhereInput = { AND: [escopoCotas(s), { dataVenda: { gte: p.de, lt: fimExclusivo(p) } }] };
  const [prod, prev] = await Promise.all([
    prisma.cota.aggregate({ where: cotaNoPeriodo, _sum: { credito: true }, _count: true }),
    prisma.comissaoApurada.aggregate({ where: { status: { not: 'CANCELADA' }, pagaPelaWr: true, cota: cotaNoPeriodo }, _sum: { valor: true } }),
  ]);
  return { producao: dec(prod._sum.credito ?? 0), cotas: prod._count, comissaoPrevista: dec(prev._sum.valor ?? 0) };
}

export async function painel(s: Sessao, p: Periodo) {
  exigir(s, 'dashboard');
  const fim = fimExclusivo(p);
  const escopo = escopoCotas(s);
  const [atual, liberado, cancel, estornos, pendencias, ativa, porGerencia, comissaoPorGerencia] = await Promise.all([
    resumoDoPeriodo(s, p),
    prisma.comissaoApurada.aggregate({ where: { AND: [escopoComissoes(s), { status: { in: ['LIBERADA', 'EM_FOLHA', 'PAGA'] }, pagaPelaWr: true, liberadaEm: { gte: p.de, lt: fim } }] }, _sum: { valor: true } }),
    prisma.cota.aggregate({ where: { AND: [escopo, { cancelada: true, dataCancelamento: { gte: p.de, lt: fim } }] }, _sum: { credito: true }, _count: true }),
    prisma.estorno.aggregate({ where: { AND: [escopoEstornos(s), { status: { in: ['A_COBRAR', 'EM_COBRANCA'] } }] }, _sum: { valor: true }, _count: true }),
    prisma.pendencia.findMany({ where: { resolvidaEm: null, tipo: { in: [...PENDENCIAS_DE_SNAPSHOT] }, cota: escopo }, distinct: ['cotaId'], select: { cotaId: true } }),
    prisma.cota.aggregate({ where: { AND: [escopo, { cancelada: false }] }, _sum: { credito: true }, _count: true }),
    prisma.cota.groupBy({ by: ['snapGerenciaId'], where: { AND: [escopo, { dataVenda: { gte: p.de, lt: fim } }] }, _sum: { credito: true }, _count: true }),
    prisma.$queryRaw<Array<{ gerenciaId: string | null; valor: Prisma.Decimal }>>`
      SELECT q."snapGerenciaId" AS "gerenciaId", COALESCE(SUM(c."valor"), 0) AS valor
        FROM "comissao_apurada" c JOIN "cota" q ON q."id" = c."cotaId"
       WHERE c."status" <> 'CANCELADA' AND c."pagaPelaWr" AND q."dataVenda" >= ${p.de} AND q."dataVenda" < ${fim} AND ${escopoSqlQ(s)}
       GROUP BY 1`,
  ]);
  const gerencias = await prisma.gerencia.findMany({ where: { id: { in: porGerencia.map((g) => g.snapGerenciaId).filter((x): x is string => x !== null) } } });
  const tabela = porGerencia
    .map((g) => ({
      gerenciaId: g.snapGerenciaId,
      nome: gerencias.find((x) => x.id === g.snapGerenciaId)?.nome ?? 'Sem gerência (vendedor sem equipe)',
      cotas: g._count,
      producao: dec(g._sum.credito ?? 0),
      comissao: dec(comissaoPorGerencia.find((c) => c.gerenciaId === g.snapGerenciaId)?.valor ?? 0),
    }))
    .sort((a, b) => b.producao.comparedTo(a.producao));

  let comparativos: null | { anterior: ResumoPeriodo; anoAnterior: ResumoPeriodo; acumuladoAno: ResumoPeriodo; serie: Array<{ competencia: string; producao: Dec; comissao: Dec }> } = null;
  if (p.competencia) {
    const c = p.competencia;
    const ano = c.slice(0, 4);
    const inicioAno = periodoDoMes(`${ano}-01`) as Periodo;
    const [anterior, anoAnterior, acumuladoAno, serie] = await Promise.all([
      resumoDoPeriodo(s, periodoDoMes(deslocarCompetencia(c, -1)) as Periodo),
      resumoDoPeriodo(s, periodoDoMes(deslocarCompetencia(c, -12)) as Periodo),
      resumoDoPeriodo(s, { de: inicioAno.de, ate: p.ate, rotulo: '', competencia: null }),
      serie12(s, c),
    ]);
    comparativos = { anterior, anoAnterior, acumuladoAno, serie };
  }
  return {
    atual,
    liberado: dec(liberado._sum.valor ?? 0),
    cancelamentos: { quantidade: cancel._count, credito: dec(cancel._sum.credito ?? 0) },
    estornoACobrar: { valor: dec(estornos._sum.valor ?? 0), quantidade: estornos._count },
    pendenciasCadastro: pendencias.length,
    carteiraAtiva: { quantidade: ativa._count, credito: dec(ativa._sum.credito ?? 0) },
    tabela,
    comparativos,
  };
}

function escopoSqlQ(s: Sessao): Prisma.Sql {
  const w = escopoCotas(s);
  if ('snapGerenciaId' in w) return Prisma.sql`q."snapGerenciaId" = ${w.snapGerenciaId as string}`;
  if ('snapEquipeId' in w) return Prisma.sql`q."snapEquipeId" = ${w.snapEquipeId as string}`;
  if ('id' in w) return Prisma.sql`FALSE`;
  return Prisma.sql`TRUE`;
}

async function serie12(s: Sessao, competencia: string) {
  const inicio = periodoDoMes(deslocarCompetencia(competencia, -11)) as Periodo;
  const fim = fimExclusivo(periodoDoMes(competencia) as Periodo);
  const [prod, com] = await Promise.all([
    prisma.$queryRaw<Array<{ mes: string; v: Prisma.Decimal }>>`
      SELECT to_char("dataVenda", 'YYYY-MM') AS mes, SUM("credito") AS v FROM "cota"
       WHERE "dataVenda" >= ${inicio.de} AND "dataVenda" < ${fim} AND ${escopoSql(s)} GROUP BY 1`,
    prisma.$queryRaw<Array<{ mes: string; v: Prisma.Decimal }>>`
      SELECT to_char(q."dataVenda", 'YYYY-MM') AS mes, SUM(c."valor") AS v
        FROM "comissao_apurada" c JOIN "cota" q ON q."id" = c."cotaId"
       WHERE c."status" <> 'CANCELADA' AND c."pagaPelaWr" AND q."dataVenda" >= ${inicio.de} AND q."dataVenda" < ${fim} AND ${escopoSqlQ(s)} GROUP BY 1`,
  ]);
  return Array.from({ length: 12 }, (_, i) => {
    const m = deslocarCompetencia(competencia, i - 11);
    return { competencia: m, producao: dec(prod.find((x) => x.mes === m)?.v ?? 0), comissao: dec(com.find((x) => x.mes === m)?.v ?? 0) };
  });
}

export function variacao(atual: Dec, base: Dec): Dec | null {
  if (base.isZero()) return null;
  return atual.minus(base).times(100).dividedBy(base).toDecimalPlaces(1);
}

