import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dec, ZERO, type Dec } from '@/lib/dinheiro';
import { fimExclusivo, type Periodo } from '@/lib/datas';
import { escopoEstornos, exigir, type Sessao } from '../contexto';

export function whereEstornos(s: Sessao, p: Periodo, abertos: boolean): Prisma.EstornoWhereInput {
  return {
    AND: [
      escopoEstornos(s),
      { status: { not: 'INVALIDADO' } },
      abertos ? { status: { in: ['A_COBRAR', 'EM_COBRANCA'] } } : { dataEvento: { gte: p.de, lt: fimExclusivo(p) } },
    ],
  };
}

export async function listarEstornos(s: Sessao, p: Periodo, abertos: boolean) {
  exigir(s, 'estornos');
  const estornos = await prisma.estorno.findMany({
    where: whereEstornos(s, p, abertos),
    include: {
      titularPessoa: true,
      cota: { select: { id: true, clienteNome: true, grupo: true, cota: true, credito: true } },
      movimentos: { orderBy: { criadoEm: 'desc' }, take: 1 },
    },
    orderBy: [{ dataEvento: 'desc' }],
    take: 3000,
  });
  const grupos = new Map<string, { chave: string; nome: string; pessoaId: string | null; cobrancas: number; recuperacao: Dec; cancelamento: Dec; total: Dec; itens: typeof estornos }>();
  for (const e of estornos) {
    const chave = e.titularPessoaId ?? 'SEM_TITULAR';
    const g = grupos.get(chave) ?? { chave, nome: e.titularPessoa?.nome ?? 'SEM TITULAR', pessoaId: e.titularPessoaId, cobrancas: 0, recuperacao: ZERO, cancelamento: ZERO, total: ZERO, itens: [] };
    const v = dec(e.valor);
    g.cobrancas++;
    if (e.tipo === 'RECUPERACAO') g.recuperacao = g.recuperacao.plus(v);
    else g.cancelamento = g.cancelamento.plus(v);
    g.total = g.total.plus(v);
    g.itens.push(e);
    grupos.set(chave, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.total.comparedTo(a.total));
  const tot = (k: 'recuperacao' | 'cancelamento' | 'total') => lista.reduce((t, g) => t.plus(g[k]), ZERO);
  return { grupos: lista, totais: { recuperacao: tot('recuperacao'), cancelamento: tot('cancelamento'), total: tot('total'), cobrancas: estornos.length } };
}
