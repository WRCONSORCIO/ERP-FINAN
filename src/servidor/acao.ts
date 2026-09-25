import 'server-only';
import type { z } from 'zod';
import { ErroDeDominio, mensagemDeErroDeBanco } from '@/lib/erros';
import { log } from '@/lib/log';
import { pode, type Nivel, type Recurso } from '@/lib/permissoes';
import type { Sessao } from './contexto';
import { obterSessao } from './sessao';

export type Resultado<T = undefined> =
  | { ok: true; mensagem: string; dados?: T }
  | { ok: false; mensagem: string; campos?: Record<string, string> };

/**
 * Invólucro de TODA Server Action: sessão reconferida no banco, autorização no servidor,
 * validação Zod da entrada e tradução de erro em mensagem humana (sem pilha, sem SQL).
 */
export async function executar<E extends z.ZodType, T = undefined>(
  recurso: Recurso,
  nivel: Nivel,
  esquema: E,
  entrada: unknown,
  fn: (sessao: Sessao, dados: z.infer<E>) => Promise<{ mensagem: string; dados?: T }>,
): Promise<Resultado<T>> {
  const sessao = await obterSessao();
  if (!sessao) return { ok: false, mensagem: 'Sua sessão expirou. Entre novamente.' };
  if (!pode(sessao.perfil, recurso, nivel)) {
    log.aviso('acao.negada', { usuarioId: sessao.usuarioId, recurso, nivel });
    return { ok: false, mensagem: 'Você não tem permissão para esta ação.' };
  }
  const r = esquema.safeParse(entrada);
  if (!r.success) {
    const campos: Record<string, string> = {};
    for (const i of r.error.issues) campos[i.path.join('.') || '_'] = i.message;
    return { ok: false, mensagem: 'Confira os campos destacados.', campos };
  }
  try {
    const saida = await fn(sessao, r.data);
    // Sem revalidatePath: todas as telas são force-dynamic e o formulário chama router.refresh() quando dá certo.
    return { ok: true, mensagem: saida.mensagem, ...(saida.dados !== undefined ? { dados: saida.dados } : {}) };
  } catch (e) {
    if (e instanceof ErroDeDominio) return { ok: false, mensagem: e.message };
    const traduzida = mensagemDeErroDeBanco(e);
    if (traduzida) return { ok: false, mensagem: traduzida };
    log.erro('acao.erro', { recurso, usuarioId: sessao.usuarioId, erro: e });
    return { ok: false, mensagem: 'Não foi possível concluir a operação. Nada foi gravado. Se persistir, avise o administrador.' };
  }
}

/** Lê um FormData em objeto simples (campos repetidos viram lista). */
export function formParaObjeto(fd: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('$ACTION')) continue;
    const valor = typeof v === 'string' ? v : v;
    if (k in o) {
      const atual = o[k];
      o[k] = Array.isArray(atual) ? [...atual, valor] : [atual, valor];
    } else o[k] = valor;
  }
  return o;
}
