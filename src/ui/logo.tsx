/**
 * Logo oficial da WR Consórcio (public/logo-wr.png, branco sobre transparente) usado como máscara:
 * a mesma arte sai branca no fundo escuro e verde no fundo claro, sem duas versões do arquivo.
 */
export function LogoWR({ tamanho = 48, tom = 'verde', className }: { tamanho?: number; tom?: 'verde' | 'branco'; className?: string }) {
  return (
    <span
      role="img"
      aria-label="WR Consórcio"
      className={`inline-block shrink-0 ${tom === 'branco' ? 'bg-white' : 'bg-wr-acao'} ${className ?? ''}`}
      style={{
        width: tamanho, height: tamanho,
        WebkitMask: 'url(/logo-wr.png) center / contain no-repeat',
        mask: 'url(/logo-wr.png) center / contain no-repeat',
      }}
    />
  );
}
