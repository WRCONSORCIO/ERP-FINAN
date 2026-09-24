'use client';

import { useEffect } from 'react';
import { classeBotao } from '@/ui/base';
import { Icone } from '@/ui/icones';

/** Erro inesperado: mensagem humana, sem pilha técnica. O detalhe fica no log do servidor (digest). */
export default function ErroDaTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('tela.erro', error.digest);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <Icone nome="alerta" tamanho={28} className="mx-auto text-wr-ambar" />
      <h1 className="mt-3 text-[18px] font-semibold">Não foi possível carregar esta tela</h1>
      <p className="mt-1 text-[13px] text-wr-texto-2">Nenhum dado foi alterado. Tente novamente; se persistir, informe ao administrador o código abaixo.</p>
      {error.digest ? <p className="numero mt-2 text-[12px] text-wr-texto-3">Código: {error.digest}</p> : null}
      <button type="button" onClick={reset} className={`${classeBotao('primario')} mt-4`}>Tentar novamente</button>
    </div>
  );
}
