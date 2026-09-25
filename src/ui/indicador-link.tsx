'use client';

import { useLinkStatus } from 'next/link';

/**
 * Estado de carregamento da navegação: aparece dentro do link clicado enquanto a próxima tela é buscada.
 * (Substitui o loading.tsx de rota, que no Next 15.5 prendia as transições da mesma tela.)
 */
export function IndicadorLink({ claro = false }: { claro?: boolean }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span role="status" aria-label="Carregando" className={`ml-auto inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-t-transparent ${claro ? 'border-white/80' : 'border-wr-verde'}`} />
  );
}
