import { z } from 'zod';
import type { StatusEstorno } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { pode } from '@/lib/permissoes';
import { auditar } from '../auditoria';
import { escopoEstornos, exigir, type Sessao } from '../contexto';
import { zId, zMoeda, zMotivo, zTextoOpcional } from './esquemas';

export const esquemaMovimentarEstorno = z.object({
  estornoId: zId,
  para: z.enum(['EM_COBRANCA', 'QUITADO', 'PERDOADO']),
  forma: z.enum(['DESCONTO_EM_FOLHA', 'COBRANCA_A_PARTE', 'PARCELAMENTO']).optional(),
  valor: zMoeda.optional(),
  referencia: zTextoOpcional(200),
  motivo: zMotivo,
});

const TRANSICOES: Record<StatusEstorno, StatusEstorno[]> = {
  A_COBRAR: ['EM_COBRANCA', 'QUITADO', 'PERDOADO'],
  EM_COBRANCA: ['QUITADO', 'PERDOADO'],
  QUITADO: [],
  PERDOADO: [],
  INVALIDADO: [],
};

/**
 * Ciclo de vida da cobrança: a cobrar → em cobrança → quitado, ou perdoado.
 * Perdoar é abrir mão de dinheiro: exige nível "tudo". Cada passo fica registrado (append-only).
 * O desconto em folha é registrado como FORMA de cobrança — nunca é abatido automaticamente da folha.
 */
export async function movimentarEstorno(s: Sessao, d: z.infer<typeof esquemaMovimentarEstorno>) {
  exigir(s, 'estornos', 'editar');
  if (d.para === 'PERDOADO' && !pode(s.perfil, 'estornos', 'tudo')) throw new ErroDeDominio('Perdoar estorno exige permissão total sobre estornos.');
  return prisma.$transaction(async (tx) => {
    const e = await tx.estorno.findFirst({ where: { id: d.estornoId, ...escopoEstornos(s) } });
    if (!e) throw new ErroNaoEncontrado();
    if (!TRANSICOES[e.status].includes(d.para)) throw new ErroDeDominio(`Um estorno ${e.status.replace('_', ' ').toLowerCase()} não pode ir para ${d.para.replace('_', ' ').toLowerCase()}.`);
    if (e.titularPessoaId === null && d.para !== 'PERDOADO') throw new ErroDeDominio('Este estorno não tem de quem cobrar: informe em Estrutura quem era o responsável na data da venda e clique em “Processar pendências agora” em Importações.');
    const depois = await tx.estorno.update({ where: { id: e.id }, data: { status: d.para } });
    await tx.estornoMovimento.create({
      data: { estornoId: e.id, de: e.status, para: d.para, valor: d.valor ?? null, forma: d.forma ?? null, referencia: d.referencia, motivo: d.motivo, usuarioId: s.usuarioId },
    });
    await auditar(tx, { sessao: s, acao: 'ESTORNO_COBRANCA', entidade: 'Estorno', entidadeId: e.id, antes: { status: e.status }, depois: { status: depois.status, forma: d.forma, valor: d.valor, referencia: d.referencia }, contexto: { motivo: d.motivo } });
  });
}
