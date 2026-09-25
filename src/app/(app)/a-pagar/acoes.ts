'use server';

import { formatarMoeda } from '@/lib/dinheiro';
import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as F from '@/servidor/servicos/folha';

type Estado = Resultado<unknown> | null;

export async function fecharFolhaAcao(_: Estado, fd: FormData) {
  return executar('comissoes', 'editar', F.esquemaFecharFolha, formParaObjeto(fd), async (s, d) => {
    const f = await F.fecharFolha(s, d);
    return { mensagem: `Folha ${f.competencia} fechada: ${f.quantidade} comissão(ões), ${formatarMoeda(f.total)}. Estas linhas não mudam mais.` };
  });
}

export async function pagarFolhaAcao(_: Estado, fd: FormData) {
  return executar('comissoes', 'editar', F.esquemaPagarFolha, formParaObjeto(fd), async (s, d) => {
    const r = await F.marcarFolhaPaga(s, d);
    return { mensagem: r.diferenca === '0' ? 'Folha marcada como paga.' : `Folha marcada como paga. Atenção: o valor pago difere do fechado em ${formatarMoeda(r.diferenca)} — registrado.` };
  });
}
