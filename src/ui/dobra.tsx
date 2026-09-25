'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Bloco que abre e fecha com <details> nativo (teclado, leitor de tela e Ctrl+F de graça).
 * Guarda o estado por chave no localStorage, lido em useEffect para não quebrar a hidratação.
 */
export function Dobra({ chave, titulo, resumo, aberta = false, children }: { chave: string; titulo: ReactNode; resumo?: ReactNode; aberta?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(`dobra:${chave}`);
      if (salvo !== null && ref.current) ref.current.open = salvo === '1';
    } catch {
      /* armazenamento indisponível: fica o padrão */
    }
  }, [chave]);
  return (
    <details
      ref={ref}
      open={aberta}
      className="group cartao"
      onToggle={(e) => {
        try {
          window.localStorage.setItem(`dobra:${chave}`, (e.currentTarget as HTMLDetailsElement).open ? '1' : '0');
        } catch {
          /* ignora */
        }
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-wr-texto-3 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
          {titulo}
        </span>
        {resumo ? <span className="text-[12px] font-normal text-wr-texto-2">{resumo}</span> : null}
      </summary>
      <div className="border-t border-wr-borda">{children}</div>
    </details>
  );
}
