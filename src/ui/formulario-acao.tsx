'use client';

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Resultado } from '@/servidor/acao';
import { classeBotao } from './base';

type Acao = (anterior: Resultado<unknown> | null, fd: FormData) => Promise<Resultado<unknown>>;

function BotaoEnviar({ rotulo, perigo, pending }: { rotulo: string; perigo: boolean; pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className={classeBotao(perigo ? 'perigo' : 'primario')} aria-busy={pending}>
      {pending ? 'Gravando…' : rotulo}
    </button>
  );
}

function DadosDoResultado({ dados }: { dados: unknown }) {
  if (!dados || typeof dados !== 'object') return null;
  const d = dados as Record<string, unknown>;
  if (typeof d.senhaProvisoria === 'string') {
    return (
      <div className="mt-2 rounded-lg border border-wr-ambar/30 bg-wr-ambar-claro p-3">
        <p className="text-[12px] font-semibold text-wr-ambar">Senha provisória — aparece uma única vez. Entregue em mãos.</p>
        <p className="numero mt-1 select-all text-[18px] font-bold text-wr-texto">{d.senhaProvisoria}</p>
      </div>
    );
  }
  return null;
}

/**
 * Formulário de alteração com resposta ao lado (FormularioDeRegra da especificação).
 * Envio manual; só é limpo quando dá certo. Tom perigo exige segundo clique de confirmação
 * dentro da própria tela (nunca confirm() do navegador), explicando o impacto.
 */
export function FormularioAcao({
  acao, children, rotulo = 'Salvar', perigo = false, confirmacao, className, emLinha = false,
}: {
  acao: Acao;
  children?: ReactNode;
  rotulo?: string;
  perigo?: boolean;
  confirmacao?: string;
  className?: string;
  emLinha?: boolean;
}) {
  const [resultado, enviar, pending] = useActionState<Resultado<unknown> | null, FormData>(acao, null);
  const [confirmando, setConfirmando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (resultado?.ok) {
      formRef.current?.reset();
      setConfirmando(false);
      router.refresh();
    }
  }, [resultado, router]);

  const exigeConfirmacao = perigo || Boolean(confirmacao);
  // Envio manual (sem action= no <form>): o React não limpa os campos quando a gravação falha.
  const aoEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (exigeConfirmacao && !confirmando) {
      setConfirmando(true);
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(() => enviar(fd));
  };
  const campos = resultado && !resultado.ok ? resultado.campos : undefined;

  return (
    <form ref={formRef} onSubmit={aoEnviar} className={className} noValidate>
      <div className={emLinha ? 'flex flex-wrap items-end gap-2' : 'space-y-3'}>
        {children}
        <div className="flex flex-wrap items-center gap-2">
          {exigeConfirmacao && !confirmando ? (
            <button type="button" className={classeBotao(perigo ? 'perigo' : 'primario')} onClick={() => setConfirmando(true)}>
              {rotulo}
            </button>
          ) : (
            <BotaoEnviar rotulo={exigeConfirmacao ? `Confirmar: ${rotulo.toLowerCase()}` : rotulo} perigo={perigo} pending={pending} />
          )}
          {confirmando ? (
            <button type="button" className={classeBotao('fantasma')} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          ) : null}
        </div>
      </div>
      {confirmando && confirmacao ? (
        <p className="mt-2 rounded-lg border border-wr-ambar/30 bg-wr-ambar-claro px-3 py-2 text-[12px] text-wr-texto" role="alert">
          {confirmacao}
        </p>
      ) : null}
      <div aria-live="polite">
        {resultado ? (
          <div className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${resultado.ok ? 'bg-wr-verde-claro text-wr-verde' : 'bg-wr-vermelho-claro text-wr-vermelho'}`}>
            <p className="font-semibold">{resultado.mensagem}</p>
            {campos ? (
              <ul className="mt-1 list-inside list-disc">
                {Object.entries(campos).map(([k, v]) => (
                  <li key={k}>{k === '_' ? v : `${k}: ${v}`}</li>
                ))}
              </ul>
            ) : null}
            {resultado.ok ? <DadosDoResultado dados={resultado.dados} /> : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
