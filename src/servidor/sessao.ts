import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { COOKIE_SESSAO, lerToken } from '@/lib/sessao-token';
import { pode, type Nivel, type Recurso } from '@/lib/permissoes';
import type { Sessao } from './contexto';
import { sessaoDoToken } from './sessao-banco';

export async function ipDaRequisicao(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (fwd || h.get('x-real-ip') || 'desconhecido').slice(0, 64);
}

/**
 * Sessão RECONFERIDA NO BANCO a cada tela/ação (7.2): desativar, rebaixar ou mudar o escopo
 * de alguém vale na próxima tela que a pessoa abrir, sem precisar sair e entrar.
 * O perfil e o escopo usados são SEMPRE os do banco, nunca os do token.
 */
export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const jar = await cookies();
  const conteudo = await lerToken(jar.get(COOKIE_SESSAO)?.value);
  return sessaoDoToken(prisma, conteudo, await ipDaRequisicao());
});

/** Para páginas: exige sessão válida e permissão — o servidor recusa mesmo com o menu escondido. */
export async function exigirPagina(recurso: Recurso, nivel: Nivel = 'ver'): Promise<Sessao> {
  const s = await obterSessao();
  if (!s) redirect('/login?expirada=1');
  if (!pode(s.perfil, recurso, nivel)) redirect('/sem-permissao');
  return s;
}
