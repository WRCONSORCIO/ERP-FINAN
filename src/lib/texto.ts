/** Normalização usada para casar nomes: sem acento, caixa alta, espaço simples. */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONECTIVOS = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'D']);

/** Iniciais para o Monograma: ignora conectivos e números iniciais ("63.893.682 LUCIANA RIBEIRO" → "LR"). */
export function iniciais(nome: string | null | undefined): string {
  const palavras = normalizarNome(nome)
    .split(' ')
    .filter((p) => p !== '' && !/^\d+$/.test(p) && !CONECTIVOS.has(p));
  if (palavras.length === 0) return '?';
  const primeira = palavras[0] as string;
  const ultima = palavras.length > 1 ? (palavras[palavras.length - 1] as string) : '';
  return (primeira.charAt(0) + ultima.charAt(0)).toUpperCase();
}

/** Hash estável (FNV-1a 32 bits) — usado para cor do monograma, não para segurança. */
export function hashEstavel(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function ouTraco(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s === '' || s === 'null' || s === 'undefined' || s === 'NaN' ? '—' : s;
}

export function pluralizar(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : plural}`;
}
