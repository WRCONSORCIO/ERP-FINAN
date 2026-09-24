import type { Severidade, TipoNotificacao } from '@prisma/client';
import type { Db } from '@/lib/db';
import type { PerfilCodigo } from '@/lib/permissoes';

export interface NovaNotificacao {
  tipo: TipoNotificacao;
  severidade: Severidade;
  titulo: string;
  mensagem: string;
  link?: string;
  /** Deduplicação: a mesma chave não gera duas notificações para o mesmo usuário. */
  chave: string;
  perfis: readonly PerfilCodigo[];
}

/** Notificação persistente para todos os usuários ATIVOS dos perfis indicados. */
export async function notificar(db: Db, n: NovaNotificacao): Promise<number> {
  const usuarios = await db.usuario.findMany({ where: { ativo: true, perfil: { in: [...n.perfis] } }, select: { id: true } });
  if (usuarios.length === 0) return 0;
  const r = await db.notificacao.createMany({
    data: usuarios.map((u) => ({
      usuarioId: u.id, tipo: n.tipo, severidade: n.severidade, titulo: n.titulo, mensagem: n.mensagem, link: n.link ?? null, chave: n.chave,
    })),
    skipDuplicates: true,
  });
  return r.count;
}
