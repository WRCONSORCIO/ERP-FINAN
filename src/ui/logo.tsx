/**
 * Monograma WR: anel com W e R ligados (o último traço do W é a haste do R).
 * Desenho vetorial provisório no espírito da marca; troque pelo arquivo oficial quando houver.
 */
export function LogoWR({ tamanho = 48, tom = 'verde', className }: { tamanho?: number; tom?: 'verde' | 'branco'; className?: string }) {
  const cor = tom === 'branco' ? '#ffffff' : 'var(--color-wr-acao)';
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" fill="none" role="img" aria-label="WR Consórcio" className={className}>
      <circle cx="32" cy="32" r="28.5" stroke={cor} strokeWidth="5" />
      <path d="M13.5 22.5 19.5 42 25.5 28.5 31.5 42 37.5 22.5V42" stroke={cor} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37.5 22.5h6.2a5.4 5.4 0 0 1 0 10.8h-6.2M42.8 33.3 49.5 42" stroke={cor} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
