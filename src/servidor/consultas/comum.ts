/** Parâmetros GET normalizados (o filtro vive na URL: sobrevive ao F5 e pode ser compartilhado). */
export type Params = Record<string, string | string[] | undefined>;

export function param(p: Params, chave: string): string {
  const v = p[chave];
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? '').trim().slice(0, 200);
}

export function paginaDe(p: Params): number {
  const n = Number.parseInt(param(p, 'pagina'), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

export const POR_PAGINA = 50;
