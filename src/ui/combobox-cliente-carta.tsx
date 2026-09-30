'use client';

import { useId, useState } from 'react';
import { formatarDocumento } from '@/lib/documento';

export interface ClienteCartaOpcao {
  id: string;
  nome: string;
  documento: string;
}

function rotulo(c: ClienteCartaOpcao): string {
  return `${c.nome} — ${formatarDocumento(c.documento)}`;
}

/**
 * Busca de cliente (dono atual / comprador) via <input list> + <datalist> nativos — sem
 * Radix/cmdk, que este ERP não usa. O texto digitado é casado contra "Nome — documento";
 * ao casar, o id do cliente vai pro hidden input que o formulário de fato envia.
 */
export function ComboboxClienteCarta({
  nome, opcoes, valorInicial, rotuloCampo, obrigatorio = true, className,
}: {
  nome: string;
  opcoes: ClienteCartaOpcao[];
  valorInicial?: string | undefined;
  rotuloCampo: string;
  obrigatorio?: boolean;
  className?: string | undefined;
}) {
  const listId = useId();
  const inicial = opcoes.find((o) => o.id === valorInicial);
  const [texto, setTexto] = useState(inicial ? rotulo(inicial) : '');
  const [id, setId] = useState(valorInicial ?? '');

  function aoDigitar(v: string) {
    setTexto(v);
    const achado = opcoes.find((o) => rotulo(o) === v);
    setId(achado ? achado.id : '');
  }

  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <input type="hidden" name={nome} value={id} />
      <input
        list={listId}
        className="campo"
        placeholder="Buscar por nome ou CPF/CNPJ…"
        value={texto}
        onChange={(e) => aoDigitar(e.target.value)}
        aria-label={rotuloCampo}
        autoComplete="off"
        required={obrigatorio}
      />
      <datalist id={listId}>
        {opcoes.map((o) => <option key={o.id} value={rotulo(o)} />)}
      </datalist>
      {texto.trim() !== '' && id === '' ? (
        <p className="mt-1 text-[11px] text-wr-ambar">Nenhum cliente encontrado com este nome/documento exatos — cadastre-o em &quot;Novo cliente&quot;, abaixo, e volte aqui pra escolher.</p>
      ) : null}
    </div>
  );
}
