'use client';

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { formatarMoeda } from '@/lib/dinheiro';
import type { Resultado } from '@/servidor/acao';
import type { ResultadoSimulacao } from '@/servidor/servicos/regras';
import { classeBotao } from './base';

type Acao<T> = (anterior: Resultado<T> | null, fd: FormData) => Promise<Resultado<T>>;

function Botoes({ confirmando, setConfirmando, simular, pending }: { confirmando: boolean; setConfirmando: (v: boolean) => void; simular: () => void; pending: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={simular} disabled={pending} className={classeBotao('secundario')}>{pending ? 'Calculando…' : 'Simular impacto'}</button>
      {!confirmando ? (
        <button type="button" onClick={() => setConfirmando(true)} className={classeBotao('primario')}>Abrir nova vigência</button>
      ) : (
        <>
          <button type="submit" disabled={pending} className={classeBotao('perigo')}>{pending ? 'Gravando…' : 'Confirmar nova vigência'}</button>
          <button type="button" onClick={() => setConfirmando(false)} className={classeBotao('fantasma')}>Cancelar</button>
        </>
      )}
    </div>
  );
}

/**
 * Alteração de regra financeira com simulação: REGRA ATUAL × NOVA REGRA sobre vendas recentes,
 * sem gravar nada. Salvar exige segundo clique e explica o impacto.
 */
export function FormularioComSimulacao({ salvar, simular, children, confirmacao }: { salvar: Acao<unknown>; simular: Acao<ResultadoSimulacao>; children: ReactNode; confirmacao: string }) {
  const [resSalvar, acaoSalvar, salvando] = useActionState<Resultado<unknown> | null, FormData>(salvar, null);
  const [resSim, acaoSimular, simulando] = useActionState<Resultado<ResultadoSimulacao> | null, FormData>(simular, null);
  const [confirmando, setConfirmando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (resSalvar?.ok) router.refresh();
  }, [resSalvar, router]);
  const aoEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => acaoSalvar(fd));
    setConfirmando(false);
  };
  const aoSimular = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(() => acaoSimular(fd));
  };
  const sim = resSim?.ok ? resSim.dados : undefined;
  const diferenca = sim ? sim.diferenca : null;
  return (
    <form ref={formRef} onSubmit={aoEnviar} className="space-y-3" noValidate>
      {children}
      <Botoes confirmando={confirmando} setConfirmando={setConfirmando} simular={aoSimular} pending={salvando || simulando} />
      {confirmando ? <p className="rounded-lg bg-wr-ambar-claro px-3 py-2 text-[12px]" role="alert">{confirmacao}</p> : null}
      <div aria-live="polite" className="space-y-2">
        {resSim && !resSim.ok ? <p className="rounded-lg bg-wr-vermelho-claro px-3 py-2 text-[12px] text-wr-vermelho">{resSim.mensagem}</p> : null}
        {sim ? (
          <div className="rounded-lg border border-wr-azul/25 bg-wr-azul-claro p-3 text-[12px]">
            <p className="font-semibold text-wr-azul">Simulação · {sim.cotasAvaliadas} registro(s) desde {sim.amostraDesde}</p>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <p>Regra atual: <span className="numero font-semibold">{formatarMoeda(sim.totalAtual)}</span></p>
              <p>Nova regra: <span className="numero font-semibold">{formatarMoeda(sim.totalNovo)}</span></p>
              <p>Diferença: <span className={`numero font-semibold ${diferenca && diferenca.startsWith('-') ? 'text-wr-vermelho' : 'text-wr-verde'}`}>{formatarMoeda(sim.diferenca)}</span></p>
            </div>
            {sim.exemplos.length > 0 ? (
              <div className="tabela-quadro mt-2 rounded border border-wr-borda bg-wr-superficie">
                <table className="tabela">
                  <thead><tr><th>Registro</th><th className="direita">Crédito</th><th className="direita">Atual</th><th className="direita">Nova</th><th>Cálculo novo</th></tr></thead>
                  <tbody>{sim.exemplos.map((e, i) => <tr key={i}><td className="numero">{e.cota}</td><td className="direita numero">{e.credito}</td><td className="direita numero">{e.atual}</td><td className="direita numero">{e.novo}</td><td className="numero text-[11px]">{e.formulaNova}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
            <p className="mt-2 text-wr-texto-2">{sim.aviso}</p>
          </div>
        ) : null}
        {resSalvar ? (
          <div className={`rounded-lg px-3 py-2 text-[12px] ${resSalvar.ok ? 'bg-wr-verde-claro text-wr-verde' : 'bg-wr-vermelho-claro text-wr-vermelho'}`}>
            <p className="font-semibold">{resSalvar.mensagem}</p>
            {!resSalvar.ok && resSalvar.campos ? <ul className="list-inside list-disc">{Object.entries(resSalvar.campos).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul> : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
