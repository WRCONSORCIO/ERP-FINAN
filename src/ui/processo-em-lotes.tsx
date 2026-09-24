'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Resultado } from '@/servidor/acao';
import { classeBotao } from './base';

export type ProgressoLote = { processadas: number; restantes: number; concluida: boolean };

/**
 * Operação longa em lotes com cursor: cada chamada processa um lote curto (cabe no tempo da função),
 * e o processo pode ser interrompido no meio e retomado depois de onde parou.
 */
export function ProcessoEmLotes({ acao, rotulo, perigo = false, confirmacao }: { acao: () => Promise<Resultado<ProgressoLote>>; rotulo: string; perigo?: boolean; confirmacao?: string }) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [total, setTotal] = useState(0);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const parar = useRef(false);

  async function executar() {
    setConfirmando(false);
    setRodando(true);
    setMensagem(null);
    parar.current = false;
    let feitas = 0;
    try {
      for (;;) {
        const r = await acao();
        if (!r.ok) {
          setMensagem({ ok: false, texto: r.mensagem });
          break;
        }
        const d = r.dados ?? { processadas: 0, restantes: 0, concluida: true };
        feitas += d.processadas;
        setTotal(feitas);
        setRestantes(d.restantes);
        if (d.concluida || d.processadas === 0) {
          setMensagem({ ok: true, texto: r.mensagem });
          break;
        }
        if (parar.current) {
          setMensagem({ ok: true, texto: `Interrompido. ${d.restantes} restante(s) — retome quando quiser, continua de onde parou.` });
          break;
        }
      }
    } catch {
      setMensagem({ ok: false, texto: 'A conexão caiu no meio do processo. O que já foi feito está gravado; clique de novo para retomar.' });
    } finally {
      setRodando(false);
      router.refresh();
    }
  }

  const pct = restantes !== null && total + restantes > 0 ? Math.round((total * 100) / (total + restantes)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!rodando ? (
          confirmacao && !confirmando ? (
            <button type="button" className={classeBotao(perigo ? 'perigo' : 'primario', true)} onClick={() => setConfirmando(true)}>{rotulo}</button>
          ) : (
            <button type="button" className={classeBotao(perigo ? 'perigo' : 'primario', true)} onClick={executar}>{confirmacao ? `Confirmar: ${rotulo.toLowerCase()}` : rotulo}</button>
          )
        ) : (
          <button type="button" className={classeBotao('secundario', true)} onClick={() => { parar.current = true; }}>Interromper</button>
        )}
        {confirmando ? <button type="button" className={classeBotao('fantasma', true)} onClick={() => setConfirmando(false)}>Cancelar</button> : null}
      </div>
      {confirmando && confirmacao ? <p className="rounded-lg bg-wr-ambar-claro px-3 py-2 text-[12px]" role="alert">{confirmacao}</p> : null}
      {rodando || restantes !== null ? (
        <div aria-live="polite" className="text-[12px] text-wr-texto-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-wr-fundo">
            <div className="h-full bg-wr-verde" style={{ width: `${pct}%` }} />
          </div>
          <p className="numero mt-1">{total} processada(s){restantes !== null ? ` · ${restantes} restante(s)` : ''}</p>
        </div>
      ) : null}
      {mensagem ? <p className={`text-[12px] font-semibold ${mensagem.ok ? 'text-wr-verde' : 'text-wr-vermelho'}`}>{mensagem.texto}</p> : null}
    </div>
  );
}
