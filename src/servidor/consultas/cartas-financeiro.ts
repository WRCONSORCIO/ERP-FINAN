import { prisma } from '@/lib/db';
import { somar } from '@/lib/dinheiro';
import { paraTransacao, type TipoTransacaoCarta } from '@/dominio/cartas';
import { exigir, type Sessao } from '../contexto';
import { param, type Params } from './comum';

const TIPOS_TRANSACAO: readonly TipoTransacaoCarta[] = ['COMPRA', 'VENDA', 'INTERMEDIACAO', 'TRANSFERIDA'];

export interface FiltroFinanceiroCartas {
  busca: string;
  tipo: 'todos' | TipoTransacaoCarta;
  mes: string; // '01'..'12' ou ''
  ano: string;
}

export function lerFiltroFinanceiroCartas(p: Params): FiltroFinanceiroCartas {
  const tipoBruto = param(p, 'tipo');
  return {
    busca: param(p, 'busca'),
    tipo: (TIPOS_TRANSACAO as readonly string[]).includes(tipoBruto) ? (tipoBruto as TipoTransacaoCarta) : 'todos',
    mes: param(p, 'mes'),
    ano: param(p, 'ano'),
  };
}

/**
 * Ledger financeiro: uma linha por carta (compra e venda no mesmo registro), igual ao
 * app de referência. Carrega tudo em memória — o volume de cartas contempladas é pequeno
 * perto de uma importação de carteira, e é a única forma de reaproveitar paraTransacao().
 */
export async function financeiroCartas(s: Sessao, p: Params) {
  exigir(s, 'cartas');
  const f = lerFiltroFinanceiroCartas(p);
  const cartas = await prisma.carta.findMany({
    include: { administradora: true, vendedorCarta: true, clienteVendedor: true, clienteComprador: true },
    take: 5000,
  });
  const todas = cartas.map((carta) => ({ carta, transacao: paraTransacao(carta) }));
  const anosDisponiveis = Array.from(new Set(todas.map((t) => String(t.transacao.data.getUTCFullYear())))).sort((a, b) => b.localeCompare(a));

  const filtradas = todas
    .filter(({ carta, transacao }) => {
      if (f.tipo !== 'todos' && transacao.tipo !== f.tipo) return false;
      if (f.ano && String(transacao.data.getUTCFullYear()) !== f.ano) return false;
      if (f.mes && String(transacao.data.getUTCMonth() + 1).padStart(2, '0') !== f.mes) return false;
      if (f.busca) {
        const termo = f.busca.trim().toLowerCase();
        const alvo = [carta.codigo, carta.administradora.nome, carta.clienteVendedor.nome, carta.clienteComprador?.nome, carta.vendedorCarta?.nome]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    })
    .sort((a, b) => b.transacao.data.getTime() - a.transacao.data.getTime());

  const totais = {
    entradas: somar(filtradas.map((t) => t.transacao.entrada)),
    saidas: somar(filtradas.map((t) => t.transacao.saida)),
    resultado: somar(filtradas.map((t) => t.transacao.resultado)),
  };
  return { filtro: f, linhas: filtradas, totais, anosDisponiveis };
}
