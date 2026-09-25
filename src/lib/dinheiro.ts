import Decimal from 'decimal.js';

/**
 * Dinheiro NUNCA é number. Toda aritmética monetária passa por aqui.
 * Arredondamento: ROUND_HALF_UP, 2 casas para valores, 4 para percentuais.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

/** Aceita string, Decimal (decimal.js ou Prisma.Decimal) ou inteiro exato. */
export type EntradaDecimal = string | Dec | { toString(): string } | bigint;

export function dec(v: EntradaDecimal): Dec {
  if (v instanceof D) return v;
  if (typeof v === 'bigint') return new D(v.toString());
  const s = typeof v === 'string' ? v : v.toString();
  return new D(s);
}

export const ZERO = new D(0);
export const CEM = new D(100);

export function moeda(v: EntradaDecimal): Dec {
  return dec(v).toDecimalPlaces(2, D.ROUND_HALF_UP);
}

export function percentual(v: EntradaDecimal): Dec {
  return dec(v).toDecimalPlaces(4, D.ROUND_HALF_UP);
}

/** valor × (pct / 100), arredondado a centavos. */
export function aplicarPercentual(valor: EntradaDecimal, pct: EntradaDecimal): Dec {
  return moeda(dec(valor).times(dec(pct)).dividedBy(CEM));
}

export function somar(valores: Iterable<EntradaDecimal>): Dec {
  let total = ZERO;
  for (const v of valores) total = total.plus(dec(v));
  return total;
}

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** R$ 1.234,56 — formatação sem passar por ponto flutuante. */
export function formatarMoeda(v: EntradaDecimal | null | undefined, opcoes: { semSimbolo?: boolean; casas?: number } = {}): string {
  if (v === null || v === undefined) return '—';
  const casas = opcoes.casas ?? 2;
  const d = dec(v).toDecimalPlaces(casas, D.ROUND_HALF_UP);
  const negativo = d.isNegative() && !d.isZero();
  const [inteiro = '0', frac] = d.abs().toFixed(casas).split('.');
  const corpo = agruparMilhar(inteiro) + (casas > 0 ? ',' + (frac ?? '') : '');
  const texto = (opcoes.semSimbolo ? '' : 'R$ ') + corpo;
  return negativo ? '-' + texto : texto;
}

/** 0,50% — recebe pontos percentuais (0.5 = 0,5%). */
export function formatarPercentual(v: EntradaDecimal | null | undefined, casas = 2): string {
  if (v === null || v === undefined) return '—';
  const d = dec(v).toDecimalPlaces(casas, D.ROUND_HALF_UP);
  const [inteiro = '0', frac] = d.abs().toFixed(casas).split('.');
  return (d.isNegative() && !d.isZero() ? '-' : '') + agruparMilhar(inteiro) + (casas > 0 ? ',' + (frac ?? '') : '') + '%';
}

/** Compacto para eixos de gráfico: 58,9 mi / 950 mil. Apenas exibição. */
export function formatarMoedaCompacta(v: EntradaDecimal): string {
  const d = dec(v);
  const abs = d.abs();
  if (abs.gte(1_000_000_000)) return 'R$ ' + formatarMoeda(d.dividedBy(1_000_000_000), { semSimbolo: true, casas: 1 }) + ' bi';
  if (abs.gte(1_000_000)) return 'R$ ' + formatarMoeda(d.dividedBy(1_000_000), { semSimbolo: true, casas: 1 }) + ' mi';
  if (abs.gte(1_000)) return 'R$ ' + formatarMoeda(d.dividedBy(1_000), { semSimbolo: true, casas: 0 }) + ' mil';
  return formatarMoeda(d);
}

/**
 * Converte texto monetário brasileiro ("1.234,56", "R$ 1.234,56", "1234.56", "-12,00") em Decimal.
 * Retorna null se o texto não for um número reconhecível — nunca "adivinha" zero.
 */
export function lerMoedaTexto(texto: string | null | undefined): Dec | null {
  if (texto === null || texto === undefined) return null;
  let s = texto.trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (s === '') return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negativo = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1); }
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) || /^\d+\.\d+$/.test(s)) {
    s = s.replace(/,/g, '');
  } else {
    return null;
  }
  const d = new D(s);
  return negativo ? d.negated() : d;
}

/** Percentual em texto ("0,5%", "50", "0.50") → pontos percentuais. */
export function lerPercentualTexto(texto: string | null | undefined): Dec | null {
  if (texto === null || texto === undefined) return null;
  return lerMoedaTexto(texto.replace('%', ''));
}

/** Serialização segura para JSON/props (string com ponto decimal). */
export function paraTexto(v: EntradaDecimal): string {
  return dec(v).toFixed();
}
