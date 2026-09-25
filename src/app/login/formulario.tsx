'use client';

import { startTransition, useActionState, type FormEvent } from 'react';
import { entrar, type EstadoLogin } from '../sessao/acoes';
import { classeBotao } from '@/ui/base';
import { Icone } from '@/ui/icones';

function Botao({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className={`${classeBotao('primario')} min-h-11 w-full text-[14px]`}>
      {pending ? 'Conferindo…' : 'Entrar'}
    </button>
  );
}

export function FormularioLogin({ expirada }: { expirada: boolean }) {
  const [estado, enviar, pending] = useActionState<EstadoLogin, FormData>(entrar, { mensagem: expirada ? 'Sua sessão terminou. Entre novamente.' : null });
  const aoEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => enviar(fd));
  };
  return (
    <form onSubmit={aoEnviar} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-[12px] font-semibold text-wr-texto">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="campo min-h-11 text-[14px]" />
      </div>
      <div>
        <label htmlFor="senha" className="mb-1 block text-[12px] font-semibold text-wr-texto">Senha</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required minLength={10} className="campo min-h-11 text-[14px]" />
      </div>
      {estado.mensagem ? (
        <p role="alert" className="rounded-lg bg-wr-vermelho-claro px-3 py-2 text-[13px] font-semibold text-wr-vermelho">{estado.mensagem}</p>
      ) : null}
      <Botao pending={pending} />
      <p className="flex items-center gap-1.5 text-[12px] text-wr-texto-2">
        <Icone nome="cadeado" tamanho={14} className="text-wr-verde" />
        Acesso restrito à equipe WR Consórcio. Esqueceu a senha? Peça ao administrador.
      </p>
    </form>
  );
}
