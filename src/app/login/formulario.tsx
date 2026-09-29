'use client';

import { startTransition, useActionState, useState, type FormEvent, type KeyboardEvent } from 'react';
import { entrar, type EstadoLogin } from '../sessao/acoes';
import { Icone } from '@/ui/icones';

const CAMPO =
  'block h-12 w-full rounded-xl border border-wr-borda-forte bg-white px-4 text-[15px] text-wr-texto shadow-[0_1px_2px_rgba(16,24,20,.04)] outline-none transition ' +
  'placeholder:text-wr-texto-3 hover:border-wr-texto-3 focus:border-wr-acao focus:ring-4 focus:ring-wr-acao/15';

export function FormularioLogin({ expirada }: { expirada: boolean }) {
  const [estado, enviar, pending] = useActionState<EstadoLogin, FormData>(entrar, { mensagem: expirada ? 'Sua sessão terminou. Entre novamente.' : null });
  const [verSenha, setVerSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const aoEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => enviar(fd));
  };
  const conferirCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <form onSubmit={aoEnviar} className="space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="mb-2 block text-[13px] font-semibold text-wr-texto">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" placeholder="seu@email.com" required autoFocus className={CAMPO} />
      </div>
      <div>
        <label htmlFor="senha" className="mb-2 block text-[13px] font-semibold text-wr-texto">Senha</label>
        <div className="relative">
          <input
            id="senha" name="senha" type={verSenha ? 'text' : 'password'} autoComplete="current-password" required minLength={10}
            placeholder="Sua senha" onKeyUp={conferirCaps} onKeyDown={conferirCaps} className={`${CAMPO} pr-20`}
          />
          <button
            type="button" onClick={() => setVerSenha((v) => !v)} aria-pressed={verSenha} aria-controls="senha"
            className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2.5 text-[12px] font-semibold text-wr-texto-2 hover:bg-wr-fundo hover:text-wr-texto"
          >
            {verSenha ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {capsLock ? <p className="mt-2 text-[12px] font-medium text-wr-ambar">Caps Lock está ligado.</p> : null}
      </div>

      {estado.mensagem ? (
        <div role="alert" className="flex gap-2.5 rounded-xl border border-wr-vermelho/20 bg-wr-vermelho-claro px-4 py-3 text-[13px] leading-relaxed text-wr-vermelho">
          <Icone nome="alerta" tamanho={17} className="mt-px shrink-0" />
          <p>{estado.mensagem}</p>
        </div>
      ) : null}

      <button
        type="submit" disabled={pending} aria-busy={pending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-wr-acao text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(8,147,93,.7)] transition hover:bg-wr-acao-escuro focus-visible:ring-4 focus-visible:ring-wr-acao/30 disabled:cursor-wait disabled:opacity-80"
      >
        {pending ? <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />Entrando…</> : 'Entrar'}
      </button>

      <p className="flex items-start gap-2 pt-1 text-[12.5px] leading-relaxed text-wr-texto-2">
        <Icone nome="cadeado" tamanho={15} className="mt-px shrink-0 text-wr-acao" />
        <span>Acesso restrito à equipe WR Consórcio. Esqueceu a senha? Peça ao administrador.</span>
      </p>
    </form>
  );
}
