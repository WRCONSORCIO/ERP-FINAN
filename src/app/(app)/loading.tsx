export default function Carregando() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-6 w-56 animate-pulse rounded bg-wr-borda" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-wr-borda/60" />)}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-wr-borda/50" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
