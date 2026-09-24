'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as E from '@/servidor/servicos/estornos';

type Estado = Resultado<unknown> | null;

export async function movimentarEstornoAcao(_: Estado, fd: FormData) {
  const obj = formParaObjeto(fd);
  for (const k of ['forma', 'valor']) if (obj[k] === '') delete obj[k];
  return executar('estornos', 'editar', E.esquemaMovimentarEstorno, obj, async (s, d) => {
    await E.movimentarEstorno(s, d);
    return { mensagem: 'Situação do estorno registrada (com quem, quando e por quê).' };
  });
}
