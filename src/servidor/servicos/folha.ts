import { z } from 'zod';
import { prisma } from '@/lib/db';
import { dec, formatarMoeda, paraTexto, somar } from '@/lib/dinheiro';
import { competenciaDe, fimExclusivo, hoje, periodoDoMes, rotuloMesLongo } from '@/lib/datas';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { zData, zId, zMoeda, zTextoOpcional } from './esquemas';

export const esquemaFecharFolha = z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/, 'Competência inválida') });
export const esquemaPagarFolha = z.object({ folhaId: zId, dataPagamento: zData, valorPago: zMoeda, referencia: zTextoOpcional(200), observacao: zTextoOpcional(500) });

/**
 * Fecha a folha da competência: entra SÓ o liberado (parcela paga pelo cliente), pago pela WR,
 * ainda fora de folha e liberado até o fim da competência. Fechar congela: reapuração nunca altera essas linhas.
 * Estorno NÃO é descontado automaticamente.
 */
export async function fecharFolha(s: Sessao, d: z.infer<typeof esquemaFecharFolha>) {
  exigir(s, 'comissoes', 'editar');
  const periodo = periodoDoMes(d.competencia);
  if (!periodo) throw new ErroDeDominio('Competência inválida.');
  if (periodo.de > hoje()) throw new ErroDeDominio('Não é possível fechar folha de competência futura.');
  const limite = fimExclusivo(periodo);
  return prisma.$transaction(async (tx) => {
    const itens = await tx.comissaoApurada.findMany({
      where: { status: 'LIBERADA', pagaPelaWr: true, folhaId: null, liberadaEm: { lt: limite } },
      select: { id: true, valor: true, titularPessoaId: true },
    });
    if (itens.length === 0) throw new ErroDeDominio(`Não há comissão liberada fora de folha até ${rotuloMesLongo(d.competencia)}.`);
    const total = somar(itens.map((i) => i.valor));
    if (total.isNegative()) throw new ErroDeDominio(`O total da folha seria negativo (${formatarMoeda(total)}): há mais ajustes de devolução do que comissão a pagar.`);
    const folha = await tx.folhaComissao.create({
      data: { competencia: d.competencia, liberadasAte: limite, total: paraTexto(total), quantidade: itens.length, fechadaPorId: s.usuarioId },
    });
    const r = await tx.comissaoApurada.updateMany({ where: { id: { in: itens.map((i) => i.id) }, status: 'LIBERADA', folhaId: null }, data: { status: 'EM_FOLHA', folhaId: folha.id } });
    if (r.count !== itens.length) throw new ErroDeDominio('Outra operação alterou as comissões durante o fechamento. Nada foi gravado; tente de novo.');
    const porPessoa = new Map<string, ReturnType<typeof dec>>();
    for (const i of itens) porPessoa.set(i.titularPessoaId, (porPessoa.get(i.titularPessoaId) ?? dec('0')).plus(dec(i.valor)));
    await auditar(tx, {
      sessao: s, acao: 'FECHAMENTO_FOLHA', entidade: 'FolhaComissao', entidadeId: folha.id,
      depois: { competencia: d.competencia, total: paraTexto(total), quantidade: itens.length, beneficiarios: [...porPessoa.entries()].map(([p, v]) => ({ pessoaId: p, total: paraTexto(v) })) },
    });
    return folha;
  }, { timeout: 60_000 });
}

/** Marca a folha como paga, com data real, valor efetivamente pago e referência (conciliação). */
export async function marcarFolhaPaga(s: Sessao, d: z.infer<typeof esquemaPagarFolha>) {
  exigir(s, 'comissoes', 'editar');
  return prisma.$transaction(async (tx) => {
    const folha = await tx.folhaComissao.findUnique({ where: { id: d.folhaId } });
    if (!folha) throw new ErroNaoEncontrado('Folha não encontrada.');
    if (folha.status === 'PAGA') throw new ErroDeDominio('Esta folha já foi marcada como paga.');
    const diferenca = dec(d.valorPago).minus(dec(folha.total));
    const pagaEm = new Date(`${d.dataPagamento.toISOString().slice(0, 10)}T12:00:00Z`);
    const depois = await tx.folhaComissao.update({
      where: { id: folha.id },
      data: {
        status: 'PAGA', pagaEm, pagaPorId: s.usuarioId, valorPagoInformado: d.valorPago, referenciaPagamento: d.referencia,
        observacao: [d.observacao, diferenca.isZero() ? null : `Valor pago difere do fechado em ${formatarMoeda(diferenca)}`].filter(Boolean).join(' · ') || null,
      },
    });
    await tx.comissaoApurada.updateMany({ where: { folhaId: folha.id, status: 'EM_FOLHA' }, data: { status: 'PAGA' } });
    await auditar(tx, { sessao: s, acao: 'PAGAMENTO_FOLHA', entidade: 'FolhaComissao', entidadeId: folha.id, antes: folha, depois, contexto: { diferenca: paraTexto(diferenca) } });
    return { diferenca: paraTexto(diferenca) };
  });
}

export function competenciaAtual(): string {
  return competenciaDe(hoje());
}
