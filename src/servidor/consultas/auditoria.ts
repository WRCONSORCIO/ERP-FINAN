import type { AcaoAuditoria, Prisma } from '@prisma/client';
import { deISO, somarDias } from '@/lib/datas';
import { param, type Params } from './comum';

export const ACOES: AcaoAuditoria[] = ['LOGIN', 'LOGIN_FALHA', 'LOGIN_BLOQUEADO', 'LOGOUT', 'CRIACAO', 'ALTERACAO', 'EXCLUSAO', 'DESATIVACAO', 'REATIVACAO', 'ALTERACAO_REGRA', 'ALTERACAO_CATEGORIA', 'PROMOCAO', 'ALTERACAO_ALOCACAO', 'RECUPERACAO', 'TRANSFERENCIA_VENDEDOR', 'RECONGELAMENTO', 'IMPORTACAO', 'APURACAO', 'FECHAMENTO_FOLHA', 'PAGAMENTO_FOLHA', 'ESTORNO_COBRANCA', 'TROCA_SENHA', 'ACESSO_DADO_PESSOAL', 'SOLICITACAO_TITULAR', 'ANONIMIZACAO', 'EXPORTACAO'];

export function filtroAuditoria(sp: Params): Prisma.AuditLogWhereInput {
  const de = deISO(param(sp, 'de'));
  const ate = deISO(param(sp, 'ate'));
  const acao = param(sp, 'acao');
  const e: Prisma.AuditLogWhereInput[] = [];
  if (de) e.push({ criadoEm: { gte: de } });
  if (ate) e.push({ criadoEm: { lt: somarDias(ate, 1) } });
  if (param(sp, 'usuario')) e.push({ usuarioId: param(sp, 'usuario') });
  if (ACOES.includes(acao as AcaoAuditoria)) e.push({ acao: acao as AcaoAuditoria });
  if (param(sp, 'entidade')) e.push({ entidade: param(sp, 'entidade') });
  if (param(sp, 'registro')) e.push({ entidadeId: param(sp, 'registro') });
  return { AND: e };
}

