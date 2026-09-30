import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dec, somar, type Dec } from '@/lib/dinheiro';
import { competenciaDe, deslocarCompetencia, hoje } from '@/lib/datas';
import { emEstoque } from '@/dominio/cartas';
import { exigir, type Sessao } from '../contexto';

async function serieLucro6Meses(competenciaAtual: string): Promise<Array<{ competencia: string; valor: Dec }>> {
  const inicio = deslocarCompetencia(competenciaAtual, -5);
  const linhas = await prisma.$queryRaw<Array<{ mes: string; v: Prisma.Decimal }>>`
    SELECT to_char("dataVenda", 'YYYY-MM') AS mes, SUM("lucro") AS v FROM "carta"
     WHERE "status" = 'VENDIDA' AND "dataVenda" IS NOT NULL AND to_char("dataVenda", 'YYYY-MM') >= ${inicio}
     GROUP BY 1`;
  return Array.from({ length: 6 }, (_, i) => {
    const m = deslocarCompetencia(competenciaAtual, i - 5);
    return { competencia: m, valor: dec(linhas.find((x) => x.mes === m)?.v ?? 0) };
  });
}

/** Cartões + série de 6 meses + últimas cartas cadastradas (visão geral do módulo). */
export async function painelCartas(s: Sessao) {
  exigir(s, 'cartas');
  const competenciaAtual = competenciaDe(hoje());
  const [todas, vendidasAgg, ultimas, serie] = await Promise.all([
    prisma.carta.findMany({ select: { status: true, tipoNegociacao: true, valorCompra: true } }),
    prisma.carta.aggregate({ where: { status: 'VENDIDA' }, _sum: { lucro: true }, _count: true }),
    prisma.carta.findMany({ orderBy: { criadoEm: 'desc' }, take: 5, include: { administradora: true, clienteVendedor: true } }),
    serieLucro6Meses(competenciaAtual),
  ]);
  const emEstoqueCartas = todas.filter((c) => emEstoque(c));
  const intermediacoes = todas.filter((c) => c.tipoNegociacao === 'INTERMEDIACAO');
  return {
    lucroTotal: dec(vendidasAgg._sum.lucro ?? 0),
    totalNegociadas: todas.length,
    emEstoqueQtd: emEstoqueCartas.length,
    valorEmEstoque: somar(emEstoqueCartas.map((c) => c.valorCompra)),
    vendidasQtd: vendidasAgg._count,
    intermediacoesQtd: intermediacoes.length,
    serie,
    competenciaAtual,
    ultimas,
  };
}
