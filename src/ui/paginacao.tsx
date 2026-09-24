import Link from 'next/link';

/** Paginação por GET: mantém todos os filtros da URL. */
export function Paginacao({ caminho, params, pagina, total, porPagina }: { caminho: string; params: Record<string, string | string[] | undefined>; pagina: number; total: number; porPagina: number }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  const href = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === 'pagina' || v === undefined) continue;
      for (const item of Array.isArray(v) ? v : [v]) if (item !== '') p.append(k, item);
    }
    p.set('pagina', String(n));
    return `${caminho}?${p.toString()}`;
  };
  const classe = 'rounded-lg border border-wr-borda px-3 py-1.5 text-[13px] no-underline hover:bg-wr-fundo';
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2 border-t border-wr-borda px-4 py-3 text-[13px]">
      <span className="numero text-wr-texto-2">Página {pagina} de {paginas} · {total.toLocaleString('pt-BR')} registro(s)</span>
      <div className="flex gap-2">
        {pagina > 1 ? <Link className={classe} href={href(1)}>« Primeira</Link> : null}
        {pagina > 1 ? <Link className={classe} href={href(pagina - 1)} rel="prev">‹ Anterior</Link> : null}
        {pagina < paginas ? <Link className={classe} href={href(pagina + 1)} rel="next">Próxima ›</Link> : null}
      </div>
    </nav>
  );
}

/** Monta a query string atual (para links de exportação e atalhos). */
export function queryDe(params: Record<string, string | string[] | undefined>, mudar: Record<string, string | null> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || k in mudar) continue;
    for (const item of Array.isArray(v) ? v : [v]) if (item !== '') p.append(k, item);
  }
  for (const [k, v] of Object.entries(mudar)) if (v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
