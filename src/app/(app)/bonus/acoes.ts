'use server';

import { z } from 'zod';
import { executar, type Resultado } from '@/servidor/acao';
import { reconciliarBonus } from '@/servidor/importacao';

type Estado = Resultado<unknown> | null;

export async function reconciliarBonusAcao(_: Estado, _fd: FormData) {
  return executar('bonus', 'editar', z.object({}), {}, async (s) => {
    const r = await reconciliarBonus(s);
    return { mensagem: `${r.reconciliados} bônus reconciliado(s) com a carteira; ${r.semVinculo} continuam sem vínculo.` };
  });
}
