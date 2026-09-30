import { ZERO, dec, moeda, somar, type Dec, type EntradaDecimal } from '@/lib/dinheiro';

export type TipoTransacaoCarta = 'COMPRA' | 'VENDA' | 'INTERMEDIACAO' | 'TRANSFERIDA';

export interface CartaParaCalculo {
  status: 'ESTOQUE' | 'VENDIDA' | 'TRANSFERIDA';
  tipoNegociacao: 'COMPRA_VENDA' | 'INTERMEDIACAO';
  valorCompra: EntradaDecimal;
  valorVenda: EntradaDecimal | null;
  comissaoVendedor: EntradaDecimal;
  dataCompra: Date;
  dataVenda: Date | null;
  dataTransferencia: Date | null;
}

export interface TransacaoCarta {
  tipo: TipoTransacaoCarta;
  data: Date;
  entrada: Dec;
  saida: Dec;
  resultado: Dec;
}

/** lucro = valor de venda − valor de compra − comissão do vendedor (só faz sentido para carta vendida). */
export function calcularLucro(valorVenda: EntradaDecimal, valorCompra: EntradaDecimal, comissaoVendedor: EntradaDecimal): Dec {
  return moeda(dec(valorVenda).minus(dec(valorCompra)).minus(dec(comissaoVendedor)));
}

/**
 * "Em estoque" só conta carta que a empresa realmente comprou (compra e venda) e ainda não
 * repassou. Intermediação nunca passa pelo caixa/estoque da empresa — é ponta a ponta entre
 * o cliente vendedor e o comprador, então nunca conta como estoque, mesmo com status ESTOQUE.
 */
export function emEstoque(c: Pick<CartaParaCalculo, 'status' | 'tipoNegociacao'>): boolean {
  return c.status === 'ESTOQUE' && c.tipoNegociacao === 'COMPRA_VENDA';
}

/**
 * Uma linha do ledger financeiro por carta (não uma por evento): compra e venda ficam no
 * mesmo registro, então entrada − saída sempre bate com o resultado.
 */
export function paraTransacao(c: CartaParaCalculo): TransacaoCarta {
  const vendida = c.status === 'VENDIDA';
  const transferida = c.status === 'TRANSFERIDA';
  const intermediacao = c.tipoNegociacao === 'INTERMEDIACAO';
  const tipo: TipoTransacaoCarta = vendida ? (intermediacao ? 'INTERMEDIACAO' : 'VENDA') : transferida ? 'TRANSFERIDA' : 'COMPRA';
  const entrada = vendida && c.valorVenda !== null ? moeda(c.valorVenda) : ZERO;
  const saida = vendida ? somar([c.valorCompra, c.comissaoVendedor]) : moeda(c.valorCompra);
  const data = vendida && c.dataVenda ? c.dataVenda : transferida && c.dataTransferencia ? c.dataTransferencia : c.dataCompra;
  return { tipo, data, entrada, saida, resultado: entrada.minus(saida) };
}

export const ROTULO_TIPO_TRANSACAO_CARTA: Record<TipoTransacaoCarta, string> = {
  COMPRA: 'Compra',
  VENDA: 'Venda',
  INTERMEDIACAO: 'Intermediação',
  TRANSFERIDA: 'Transferida',
};
