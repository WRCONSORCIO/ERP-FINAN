import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dec } from '@/lib/dinheiro';
import { fimExclusivo, type Periodo } from '@/lib/datas';
import { escopoBonus, exigir, type Sessao } from '../contexto';
import { POR_PAGINA } from './comum';

export function whereBonus(s: Sessao, p: Periodo, semVinculo: boolean): Prisma.BonusIncentivoWhereInput {
  const fim = fimExclusivo(p);
  return {
    AND: [
      escopoBonus(s),
      { OR: [{ dataReferencia: { gte: p.de, lt: fim } }, { dataReferencia: null, criadoEm: { gte: p.de, lt: fim } }] },
      ...(semVinculo ? [{ cotaId: null }] : []),
    ],
  };
}

export async function listarBonus(s: Sessao, p: Periodo, semVinculo: boolean, pagina: number) {
  exigir(s, 'bonus');
  const where = whereBonus(s, p, semVinculo);
  const todos = whereBonus(s, p, false);
  const [total, recebido, atribuido, semVinc, itens, porGerencia] = await Promise.all([
    prisma.bonusIncentivo.count({ where }),
    prisma.bonusIncentivo.aggregate({ where: todos, _sum: { valorBonus: true }, _count: true }),
    prisma.bonusIncentivo.aggregate({ where: { AND: [todos, { gerenciaId: { not: null } }] }, _sum: { valorBonus: true } }),
    prisma.bonusIncentivo.aggregate({ where: { AND: [todos, { cotaId: null }] }, _sum: { valorBonus: true }, _count: true }),
    prisma.bonusIncentivo.findMany({ where, include: { equipe: true, gerencia: true }, orderBy: [{ dataReferencia: 'desc' }, { criadoEm: 'desc' }], skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    prisma.bonusIncentivo.groupBy({ by: ['gerenciaId'], where: todos, _sum: { valorBonus: true }, _count: true }),
  ]);
  const gerencias = await prisma.gerencia.findMany({ where: { id: { in: porGerencia.map((g) => g.gerenciaId).filter((x): x is string => x !== null) } } });
  return {
    total, itens,
    recebido: dec(recebido._sum.valorBonus ?? 0), quantidade: recebido._count,
    atribuido: dec(atribuido._sum.valorBonus ?? 0),
    semVinculo: { valor: dec(semVinc._sum.valorBonus ?? 0), quantidade: semVinc._count },
    porGerencia: porGerencia.map((g) => ({ nome: gerencias.find((x) => x.id === g.gerenciaId)?.nome ?? 'Sem gerência atribuída', valor: dec(g._sum.valorBonus ?? 0), quantidade: g._count })),
  };
}
