import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dec, ZERO, type Dec } from '@/lib/dinheiro';
import { fimExclusivo, type Periodo } from '@/lib/datas';
import { escopoCotas, escopoEstornos, exigir, type Sessao } from '../contexto';

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

/**
 * Cancelamentos que a administradora debitou da WR no relatório de comissão (CV056E), lado a lado com o
 * estorno que o sistema calculou para o vendedor (regras do sistema) — ou o motivo de não haver.
 */
export async function cancelamentosDoRelatorio(s: Sessao, p: Periodo) {
  exigir(s, 'estornos');
  const lancamentos = await prisma.lancamentoAdministradora.findMany({
    where: {
      tipo: 'CANCELAMENTO', dataReferencia: { gte: p.de, lt: fimExclusivo(p) },
      ...(s.perfil === 'ADMINISTRADOR' || s.perfil === 'FINANCEIRO' || s.perfil === 'CADASTRO' ? {} : { cotaRef: escopoCotas(s) }),
    },
    include: {
      cotaRef: {
        select: {
          id: true, clienteNome: true, parcelasPagas: true, snapRecuperacao: true,
          snapVendedor: { select: { nome: true } }, snapCategoria: { select: { nome: true } },
          estornos: { where: { status: { not: 'INVALIDADO' } }, select: { destino: true, valor: true, tipo: true } },
          pendencias: { where: { resolvidaEm: null, tipo: { in: ['ESTORNO_SEM_CONFIGURACAO', 'ESTORNO_SEM_REGRA', 'ESTORNO_SEM_TITULAR'] } }, select: { descricao: true } },
        },
      },
    },
    orderBy: { dataReferencia: 'desc' },
    take: 2000,
  });
  const itens = lancamentos.map((l) => {
    const c = l.cotaRef;
    const estornoVendedor = c ? c.estornos.reduce((t, e) => t.plus(dec(e.valor)), ZERO) : ZERO;
    let situacao: string;
    if (!c) situacao = 'Venda não encontrada na carteira: importe a base de clientes para avaliar o estorno do vendedor';
    else if (c.estornos.length > 0) situacao = c.estornos.map((e) => `${e.destino === 'EXPERT' ? 'Expert' : e.destino === 'VENDEDOR' ? 'Vendedor' : e.destino.toLowerCase()} · ${e.tipo === 'RECUPERACAO' ? 'recuperação' : 'cancelamento'}`).join(' + ');
    else if (!c.snapVendedor) situacao = 'Vendedor não cadastrado no sistema: cadastre o vendedor (pelo CPF/CNPJ) para avaliar o estorno dele'
    else if (c.pendencias.length > 0) situacao = c.pendencias.map((x) => x.descricao).join(' · ');
    else situacao = `Sem estorno do vendedor pelas regras (${c.snapCategoria?.nome ?? 'sem categoria'} · ${c.parcelasPagas} parcela(s) paga(s)${c.snapRecuperacao ? ' · recuperação' : ''})`;
    return {
      id: l.id, cotaId: c?.id ?? null, grupo: l.grupo, cota: l.cota, cliente: c?.clienteNome ?? l.consorciado ?? '—',
      vendedor: c?.snapVendedor?.nome ?? null, categoria: c?.snapCategoria?.nome ?? null, parcelasPagas: c?.parcelasPagas ?? null,
      data: l.dataReferencia, estornoWr: dec(l.valor).abs(), estornoVendedor, temEstorno: (c?.estornos.length ?? 0) > 0, situacao,
    };
  });
  return {
    itens,
    totalWr: itens.reduce((t, i) => t.plus(i.estornoWr), ZERO),
    totalVendedor: itens.reduce((t, i) => t.plus(i.estornoVendedor), ZERO),
  };
}
