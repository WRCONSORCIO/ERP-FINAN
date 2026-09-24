'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { assinarToken, COOKIE_SESSAO, DURACAO_SESSAO_SEGUNDOS } from '@/lib/sessao-token';
import type { PerfilCodigo } from '@/lib/permissoes';
import { ErroDeDominio } from '@/lib/erros';
import { obterSessao } from '@/servidor/sessao';
import { esquemaMinhaSenha, trocarMinhaSenha } from '@/servidor/servicos/usuarios';
import type { Resultado } from '@/servidor/acao';

export async function trocarMinhaSenhaAcao(_: Resultado<unknown> | null, fd: FormData): Promise<Resultado<unknown>> {
  const s = await obterSessao();
  if (!s) return { ok: false, mensagem: 'Sua sessão expirou. Entre novamente.' };
  const d = esquemaMinhaSenha.safeParse({ atual: fd.get('atual') ?? '', nova: fd.get('nova') ?? '', confirmacao: fd.get('confirmacao') ?? '' });
  if (!d.success) return { ok: false, mensagem: 'Preencha os três campos.' };
  try {
    await trocarMinhaSenha(s, d.data);
  } catch (e) {
    if (e instanceof ErroDeDominio) return { ok: false, mensagem: e.message };
    throw e;
  }
  // A troca invalida as sessões antigas; esta recebe um token novo.
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: s.usuarioId } });
  (await cookies()).set(COOKIE_SESSAO, await assinarToken({ sub: u.id, perfil: u.perfil as PerfilCodigo, gerenciaId: u.gerenciaId, equipeId: u.equipeId, v: u.versaoSessao }), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DURACAO_SESSAO_SEGUNDOS,
  });
  return { ok: true, mensagem: 'Senha trocada. Outras sessões abertas foram encerradas.' };
}
