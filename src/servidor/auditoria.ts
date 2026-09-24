import type { AcaoAuditoria, Prisma } from '@prisma/client';
import type { Db } from '@/lib/db';
import type { Sessao } from './contexto';
import { paraJson, semSegredos } from './json';

export interface RegistroAuditoria {
  sessao: Sessao | null;
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId?: string | null;
  antes?: unknown;
  depois?: unknown;
  contexto?: unknown;
  email?: string | null;
  ip?: string | null;
}

/**
 * Grava a auditoria NA MESMA TRANSAÇÃO do fato: passe o `tx` da operação.
 * Se o fato falhar, a auditoria some junto; se a auditoria falhar, o fato é desfeito.
 */
export async function auditar(db: Db, r: RegistroAuditoria): Promise<void> {
  const antes = r.antes && typeof r.antes === 'object' ? semSegredos(r.antes as Record<string, unknown>) : r.antes;
  const depois = r.depois && typeof r.depois === 'object' ? semSegredos(r.depois as Record<string, unknown>) : r.depois;
  const dados: Prisma.AuditLogUncheckedCreateInput = {
    usuarioId: r.sessao?.usuarioId ?? null,
    email: r.email ?? r.sessao?.email ?? null,
    acao: r.acao,
    entidade: r.entidade,
    entidadeId: r.entidadeId ?? null,
    ip: r.ip ?? r.sessao?.ip ?? null,
  };
  const a = paraJson(antes);
  const d = paraJson(depois);
  const c = paraJson(r.contexto);
  if (a !== null) dados.antes = a;
  if (d !== null) dados.depois = d;
  if (c !== null) dados.contexto = c;
  await db.auditLog.create({ data: dados });
}

/** LGPD: registro de LEITURA de dado pessoal (quem abriu a ficha de qual cliente). */
export async function registrarLeituraDadoPessoal(db: Db, sessao: Sessao, entidade: string, entidadeId: string, finalidade: string): Promise<void> {
  await db.acessoDadoPessoal.create({ data: { usuarioId: sessao.usuarioId, entidade, entidadeId, finalidade, ip: sessao.ip } });
}
