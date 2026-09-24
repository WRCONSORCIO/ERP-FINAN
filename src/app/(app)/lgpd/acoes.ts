'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as L from '@/servidor/servicos/lgpd';

type Estado = Resultado<unknown> | null;

export async function registrarSolicitacaoAcao(_: Estado, fd: FormData) {
  return executar('usuarios', 'tudo', L.esquemaSolicitacao, formParaObjeto(fd), async (s, d) => { await L.registrarSolicitacao(s, d); return { mensagem: 'Solicitação registrada.' }; });
}
export async function concluirSolicitacaoAcao(_: Estado, fd: FormData) {
  return executar('usuarios', 'tudo', L.esquemaConcluirSolicitacao, formParaObjeto(fd), async (s, d) => { await L.concluirSolicitacao(s, d); return { mensagem: 'Solicitação concluída.' }; });
}
export async function anonimizarAcao(_: Estado, fd: FormData) {
  return executar('usuarios', 'tudo', L.esquemaAnonimizar, formParaObjeto(fd), async (s, d) => { const r = await L.anonimizarContatos(s, d); return { mensagem: `${r.anonimizadas} cota(s) com contato anonimizado.` }; });
}
