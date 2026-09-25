import type { Db } from '@/lib/db';
import type { ConteudoToken } from '@/lib/sessao-token';
import type { PerfilCodigo } from '@/lib/permissoes';
import type { Sessao } from './contexto';

/**
 * Reconferência da sessão no banco: o token é só um atalho. Usuário desativado, rebaixado ou com escopo
 * alterado tem versaoSessao incrementada — o token antigo deixa de valer na próxima tela.
 * O perfil e o escopo devolvidos são SEMPRE os do banco.
 */
export async function sessaoDoToken(db: Db, conteudo: ConteudoToken | null, ip: string | null): Promise<Sessao | null> {
  if (!conteudo) return null;
  const u = await db.usuario.findUnique({
    where: { id: conteudo.sub },
    select: { id: true, nome: true, email: true, perfil: true, gerenciaId: true, equipeId: true, ativo: true, versaoSessao: true },
  });
  if (!u || !u.ativo || u.versaoSessao !== conteudo.v) return null;
  return { usuarioId: u.id, nome: u.nome, email: u.email, perfil: u.perfil as PerfilCodigo, gerenciaId: u.gerenciaId, equipeId: u.equipeId, ip };
}
