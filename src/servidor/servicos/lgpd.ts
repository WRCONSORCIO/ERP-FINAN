import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { somenteDigitos } from '@/lib/documento';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { zData, zId, zTexto } from './esquemas';

export const esquemaSolicitacao = z.object({
  documento: zTexto(20), nome: zTexto(150), tipo: z.enum(['ACESSO', 'CORRECAO', 'EXCLUSAO', 'ANONIMIZACAO']), descricao: zTexto(2000),
});
export const esquemaConcluirSolicitacao = z.object({ id: zId, status: z.enum(['ATENDIDA', 'RECUSADA']), resposta: zTexto(2000) });
export const esquemaAnonimizar = z.object({ canceladasAntesDe: zData, confirmacao: z.literal('ANONIMIZAR', { error: 'Digite ANONIMIZAR para confirmar' }) });

export async function registrarSolicitacao(s: Sessao, d: z.infer<typeof esquemaSolicitacao>) {
  exigir(s, 'usuarios', 'tudo');
  const documento = somenteDigitos(d.documento);
  if (documento.length !== 11 && documento.length !== 14) throw new ErroDeDominio('Documento do titular inválido.');
  return prisma.$transaction(async (tx) => {
    const r = await tx.solicitacaoTitular.create({ data: { ...d, documento, criadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'SOLICITACAO_TITULAR', entidade: 'SolicitacaoTitular', entidadeId: r.id, depois: { tipo: r.tipo } });
  });
}

export async function concluirSolicitacao(s: Sessao, d: z.infer<typeof esquemaConcluirSolicitacao>) {
  exigir(s, 'usuarios', 'tudo');
  return prisma.$transaction(async (tx) => {
    const r = await tx.solicitacaoTitular.findUnique({ where: { id: d.id } });
    if (!r) throw new ErroNaoEncontrado();
    if (r.status !== 'ABERTA') throw new ErroDeDominio('Solicitação já concluída.');
    const depois = await tx.solicitacaoTitular.update({ where: { id: d.id }, data: { status: d.status, resposta: d.resposta, concluidoPorId: s.usuarioId, concluidoEm: new Date() } });
    await auditar(tx, { sessao: s, acao: 'SOLICITACAO_TITULAR', entidade: 'SolicitacaoTitular', entidadeId: d.id, antes: { status: r.status }, depois: { status: depois.status } });
  });
}

/**
 * Anonimização de CONTATO (e-mail e telefone) de vendas canceladas antigas.
 * Nome, CPF e valores permanecem: são a prova de registros financeiros com obrigação de retenção —
 * apagá-los destruiria a auditoria de comissões e estornos já pagos/cobrados.
 */
export async function anonimizarContatos(s: Sessao, d: z.infer<typeof esquemaAnonimizar>) {
  exigir(s, 'usuarios', 'tudo');
  return prisma.$transaction(async (tx) => {
    const r = await tx.cota.updateMany({
      where: { cancelada: true, dataCancelamento: { lt: d.canceladasAntesDe }, anonimizadaEm: null },
      data: { clienteEmail: null, clienteTelefone: null, anonimizadaEm: new Date() },
    });
    await auditar(tx, { sessao: s, acao: 'ANONIMIZACAO', entidade: 'Cota', contexto: { canceladasAntesDe: d.canceladasAntesDe, cotas: r.count, campos: ['clienteEmail', 'clienteTelefone'] } });
    return { anonimizadas: r.count };
  });
}
