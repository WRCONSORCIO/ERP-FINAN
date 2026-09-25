'use client';

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Resultado } from '@/servidor/acao';
import { classeBotao } from './base';

export type EtapaProcessamento = 'GRAVAR' | 'CADASTRO' | 'CALCULAR';
export type ProgressoEtapa = { processadas: number; restantes: number; concluida: boolean; cursor: string | null };
type Acao = (etapa: EtapaProcessamento, cursor: string | null) => Promise<Resultado<ProgressoEtapa>>;

const ETAPAS: Array<{ id: EtapaProcessamento; rotulo: string }> = [
  { id: 'GRAVAR', rotulo: 'Gravando as vendas do arquivo' },
  { id: 'CADASTRO', rotulo: 'Conferindo vendedores, equipes e regras' },
  { id: 'CALCULAR', rotulo: 'Calculando comissões e estornos' },
];

/** Roda as três etapas em lotes curtos, mostrando o andamento. Pode ser interrompido e retomado. */
function useProcessamento(acao: Acao) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [etapa, setEtapa] = useState<number | null>(null);
  const [feitas, setFeitas] = useState(0);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const parar = useRef(false);

  async function rodar(): Promise<void> {
    setRodando(true);
    setMensagem(null);
    parar.current = false;
    const avisos: string[] = [];
    try {
      for (let i = 0; i < ETAPAS.length; i++) {
        setEtapa(i);
        setFeitas(0);
        setRestantes(null);
        let cursor: string | null = null;
        let total = 0;
        for (;;) {
          const r = await acao(ETAPAS[i]!.id, cursor);
          if (!r.ok) { setMensagem({ ok: false, texto: r.mensagem }); return; }
          const d = r.dados ?? { processadas: 0, restantes: 0, concluida: true, cursor: null };
          if (r.mensagem !== 'ok' && !avisos.includes(r.mensagem)) avisos.push(r.mensagem);
          total += d.processadas;
          cursor = d.cursor;
          setFeitas(total);
          setRestantes(d.restantes);
          if (d.concluida || d.processadas === 0) break;
          if (parar.current) { setMensagem({ ok: true, texto: 'Interrompido. O que já foi feito está gravado; clique em processar para continuar de onde parou.' }); return; }
        }
      }
      setEtapa(null);
      setMensagem({ ok: true, texto: `Pronto: tudo gravado e calculado.${avisos.length ? ' ' + avisos.join(' ') : ''} Se ainda houver vendas sem comissão, a lista abaixo diz o motivo e como resolver.` });
    } catch {
      setMensagem({ ok: false, texto: 'A conexão caiu no meio do processo. O que já foi feito está gravado; clique em processar para continuar.' });
    } finally {
      setRodando(false);
      router.refresh();
    }
  }

  const andamento = rodando && etapa !== null ? (
    <div aria-live="polite" className="space-y-1 text-[12px] text-wr-texto-2">
      <ol className="space-y-0.5">
        {ETAPAS.map((e, i) => (
          <li key={e.id} className={i === etapa ? 'font-semibold text-wr-texto' : i < etapa ? 'text-wr-verde' : 'text-wr-texto-3'}>
            {i < etapa ? '✓' : i === etapa ? '…' : '○'} {i + 1}. {e.rotulo}{i === etapa ? ` — ${feitas}${restantes !== null && restantes > 0 ? ` de ${feitas + restantes}` : ''}` : ''}
          </li>
        ))}
      </ol>
      <button type="button" className={classeBotao('fantasma', true)} onClick={() => { parar.current = true; }}>Interromper</button>
    </div>
  ) : null;
  const aviso = mensagem ? <p role="status" className={`text-[13px] font-semibold ${mensagem.ok ? 'text-wr-verde' : 'text-wr-vermelho'}`}>{mensagem.texto}</p> : null;
  return { rodar, rodando, andamento, aviso, setMensagem };
}

/** Botão "processar pendências": útil depois de cadastrar vendedor, equipe ou regra. */
export function ProcessarTudo({ acao, rotulo = 'Processar pendências agora' }: { acao: Acao; rotulo?: string }) {
  const p = useProcessamento(acao);
  return (
    <div className="space-y-2">
      {!p.rodando ? <button type="button" className={classeBotao('primario', true)} onClick={() => void p.rodar()}>{rotulo}</button> : null}
      {p.andamento}
      {p.aviso}
    </div>
  );
}

/** Envio de arquivo que já grava e calcula tudo em seguida. */
export function EnviarEProcessar({ enviar, acao, children }: { enviar: (estado: null, fd: FormData) => Promise<Resultado<unknown>>; acao: Acao; children: ReactNode }) {
  const p = useProcessamento(acao);
  const [enviando, startTransition] = useTransition();
  const [lido, setLido] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLido(null);
    p.setMensagem(null);
    startTransition(async () => {
      const r = await enviar(null, fd);
      if (!r.ok) { p.setMensagem({ ok: false, texto: r.mensagem }); return; }
      setLido(r.mensagem);
      form.current?.reset();
      await p.rodar();
    });
  }

  return (
    <form ref={form} onSubmit={aoEnviar} className="space-y-3">
      {children}
      {!p.rodando ? <button type="submit" disabled={enviando} className={classeBotao('primario')}>{enviando ? 'Lendo o arquivo…' : 'Enviar e processar'}</button> : null}
      {lido ? <p className="text-[13px] text-wr-texto">{lido}</p> : null}
      {p.andamento}
      {p.aviso}
    </form>
  );
}
