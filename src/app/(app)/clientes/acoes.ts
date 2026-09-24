'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as C from '@/servidor/servicos/cotas';

type Estado = Resultado<unknown> | null;

export async function transferirAcao(_: Estado, fd: FormData) {
  return executar('transferencias', 'editar', C.esquemaTransferir, formParaObjeto(fd), async (s, d) => {
    await C.transferirVenda(s, d);
    return { mensagem: 'Responsabilidade transferida. O snapshot foi recongelado com o novo vendedor na data original da venda, e a apuração foi pedida.' };
  });
}

export async function recongelarAcao(_: Estado, fd: FormData) {
  return executar('cotas', 'tudo', C.esquemaRecongelar, formParaObjeto(fd), async (s, d) => {
    const mudou = await C.recongelarCota(s, d);
    return { mensagem: mudou ? 'Snapshot recongelado pelo cadastro atual na data da venda. Apuração pedida.' : 'Nada mudou: o cadastro atual resolve o mesmo snapshot.' };
  });
}

export async function resolverDivergenciaAcao(_: Estado, fd: FormData) {
  return executar('transferencias', 'editar', C.esquemaDivergencia, formParaObjeto(fd), async (s, d) => {
    await C.resolverDivergencia(s, d);
    return { mensagem: d.decisao === 'ACEITAR' ? 'Correção aceita: venda transferida com rastro.' : 'Correção rejeitada: a venda continua com o vendedor atual (registrado).' };
  });
}
