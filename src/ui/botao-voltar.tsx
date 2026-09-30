'use client';

import { useRouter } from 'next/navigation';
import { classeBotao } from './base';
import { Icone } from './icones';

/** Volta para a tela anterior; se a ficha foi aberta direto (link colado), vai para a lista. */
export function BotaoVoltar({ destino, rotulo = 'Voltar' }: { destino: string; rotulo?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`${classeBotao('secundario')} gap-1.5`}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(destino))}
    >
      <Icone nome="esquerda" tamanho={16} />
      {rotulo}
    </button>
  );
}
