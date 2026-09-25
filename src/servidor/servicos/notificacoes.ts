import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { Sessao } from '../contexto';
import { zId } from './esquemas';

export const esquemaNotificacao = z.object({ id: zId });

/** Cada um só marca as PRÓPRIAS notificações. */
export async function marcarLida(s: Sessao, d: z.infer<typeof esquemaNotificacao>) {
  await prisma.notificacao.updateMany({ where: { id: d.id, usuarioId: s.usuarioId, lidaEm: null }, data: { lidaEm: new Date() } });
}

export async function marcarTodasLidas(s: Sessao) {
  await prisma.notificacao.updateMany({ where: { usuarioId: s.usuarioId, lidaEm: null }, data: { lidaEm: new Date() } });
}
