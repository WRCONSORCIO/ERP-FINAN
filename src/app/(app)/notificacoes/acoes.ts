'use server';

import { revalidatePath } from 'next/cache';
import { obterSessao } from '@/servidor/sessao';
import { esquemaNotificacao, marcarLida, marcarTodasLidas } from '@/servidor/servicos/notificacoes';

export async function marcarLidaAcao(fd: FormData): Promise<void> {
  const s = await obterSessao();
  const d = esquemaNotificacao.safeParse({ id: fd.get('id') });
  if (!s || !d.success) return;
  await marcarLida(s, d.data);
  revalidatePath('/notificacoes');
}

export async function marcarTodasAcao(): Promise<void> {
  const s = await obterSessao();
  if (!s) return;
  await marcarTodasLidas(s);
  revalidatePath('/notificacoes');
}

