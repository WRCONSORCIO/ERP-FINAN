'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { COOKIE_SESSAO, DURACAO_SESSAO_SEGUNDOS } from '@/lib/sessao-token';
import { autenticar } from '@/servidor/autenticacao';
import { auditar } from '@/servidor/auditoria';
import { ipDaRequisicao, obterSessao } from '@/servidor/sessao';

export interface EstadoLogin {
  mensagem: string | null;
}

const esquema = z.object({ email: z.string().trim().max(254), senha: z.string().max(200) });

export async function entrar(_anterior: EstadoLogin, fd: FormData): Promise<EstadoLogin> {
  const r = esquema.safeParse({ email: fd.get('email') ?? '', senha: fd.get('senha') ?? '' });
  if (!r.success || r.data.email === '' || r.data.senha === '') return { mensagem: 'Informe e-mail e senha.' };
  const segredo = process.env.AUTH_SECRET ?? '';
  if (segredo.length < 32) {
    log.erro('login.configuracao', { problema: 'AUTH_SECRET ausente ou com menos de 32 caracteres nas variáveis de ambiente', tamanho: segredo.length });
    return { mensagem: 'O servidor não está configurado para abrir sessões (AUTH_SECRET). Avise o administrador.' };
  }
  let token: string;
  try {
    const resultado = await autenticar({ email: r.data.email, senha: r.data.senha, ip: await ipDaRequisicao() });
    if (!resultado.ok) return { mensagem: resultado.mensagem };
    token = resultado.token;
  } catch (e) {
    log.erro('login.erro', { erro: e });
    return { mensagem: 'Não foi possível entrar agora (falha ao acessar o banco). Tente de novo; se persistir, avise o administrador.' };
  }
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DURACAO_SESSAO_SEGUNDOS,
  });
  redirect('/dashboard');
}

export async function sair(): Promise<void> {
  const s = await obterSessao();
  if (s) await auditar(prisma, { sessao: s, acao: 'LOGOUT', entidade: 'Usuario', entidadeId: s.usuarioId });
  (await cookies()).delete(COOKIE_SESSAO);
  redirect('/login');
}
