import { z } from 'zod';
import { prisma, type Tx } from '@/lib/db';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { casarVendedor } from '@/dominio/casamento';
import { auditar } from '../auditoria';
import { carregarCadastroCasamento } from '../cadastro-casamento';
import { escopoCotas, exigir, type Sessao } from '../contexto';
import { enfileirarApuracao } from '../fila';
import { resolverSnapshot } from '../snapshot';
import { zId, zMotivo, zTextoOpcional } from './esquemas';

export const esquemaTransferir = z.object({ cotaId: zId, vendedorNovoId: zId, motivo: zMotivo });
export const esquemaRecongelar = z.object({ cotaId: zId, motivo: zMotivo });
export const esquemaDivergencia = z.object({ id: zId, decisao: z.enum(['ACEITAR', 'REJEITAR']), observacao: zTextoOpcional(500) });

/** Tipos de pendência que se resolvem recongelando o snapshot pelo cadastro atual. */
export const PENDENCIAS_DE_SNAPSHOT = ['SEM_VENDEDOR', 'VENDEDOR_SEM_CADASTRO', 'SEM_CATEGORIA', 'SEM_ESTRUTURA', 'SEM_SEGMENTO', 'SEM_FLEX', 'SEM_RESPONSAVEL'] as const;

async function transferir(tx: Tx, s: Sessao, cotaId: string, vendedorNovoId: string, motivo: string, origem: 'MANUAL' | 'DIVERGENCIA_IMPORTACAO') {
  const cota = await tx.cota.findUnique({ where: { id: cotaId } });
  if (!cota) throw new ErroNaoEncontrado();
  if (cota.vendedorId === vendedorNovoId) throw new ErroDeDominio('A venda já está com este vendedor.');
  const novo = await tx.vendedor.findUnique({ where: { id: vendedorNovoId } });
  if (!novo) throw new ErroNaoEncontrado('Vendedor não encontrado.');
  const snap = await resolverSnapshot(tx, { vendedorId: novo.id, dataVenda: cota.dataVenda, segmentoTexto: cota.segmentoTexto, flexTexto: cota.flexTexto });
  // Segmento/flex continuam os congelados (dizem respeito à venda, não ao vendedor).
  const dados = {
    ...snap, snapSegmentoId: cota.snapSegmentoId ?? snap.snapSegmentoId, snapModalidadeFlexId: cota.snapModalidadeFlexId ?? snap.snapModalidadeFlexId,
    vendedorId: novo.id, snapCongeladoEm: new Date(), snapOrigem: 'TRANSFERENCIA',
  };
  await tx.cota.update({ where: { id: cota.id }, data: dados });
  const t = await tx.cotaTransferencia.create({
    data: { cotaId: cota.id, vendedorAnteriorId: cota.vendedorId, vendedorNovoId: novo.id, motivo, origem, criadoPorId: s.usuarioId },
  });
  await auditar(tx, {
    sessao: s, acao: 'TRANSFERENCIA_VENDEDOR', entidade: 'Cota', entidadeId: cota.id,
    antes: { vendedorId: cota.vendedorId, snapCategoriaId: cota.snapCategoriaId, snapEquipeId: cota.snapEquipeId, snapGerenciaId: cota.snapGerenciaId },
    depois: { vendedorId: novo.id, snapCategoriaId: dados.snapCategoriaId, snapEquipeId: dados.snapEquipeId, snapGerenciaId: dados.snapGerenciaId },
    contexto: { transferenciaId: t.id, motivo, origem },
  });
  await enfileirarApuracao(tx, cota.id, 'transferência de vendedor');
  return t;
}

/** Troca a responsabilidade da venda. Reverter é transferência nova, nunca DELETE. Bônus já atribuído não é reescrito. */
export async function transferirVenda(s: Sessao, d: z.infer<typeof esquemaTransferir>) {
  exigir(s, 'transferencias', 'editar');
  return prisma.$transaction((tx) => transferir(tx, s, d.cotaId, d.vendedorNovoId, d.motivo, 'MANUAL'));
}

async function recongelarUma(tx: Tx, s: Sessao | null, cotaId: string, motivo: string, cadastro: Awaited<ReturnType<typeof carregarCadastroCasamento>>) {
  const cota = await tx.cota.findUniqueOrThrow({ where: { id: cotaId } });
  let vendedorId = cota.vendedorId;
  if (!vendedorId) {
    const r = casarVendedor(cota.vendedorNomeImportado, cota.vendedorDocImportado, cadastro);
    vendedorId = r.vendedorId;
  }
  const snap = await resolverSnapshot(tx, { vendedorId, dataVenda: cota.dataVenda, segmentoTexto: cota.segmentoTexto, flexTexto: cota.flexTexto });
  const antes = {
    snapVendedorId: cota.snapVendedorId, snapCategoriaId: cota.snapCategoriaId, snapSegmentoId: cota.snapSegmentoId, snapModalidadeFlexId: cota.snapModalidadeFlexId,
    snapEquipeId: cota.snapEquipeId, snapGerenciaId: cota.snapGerenciaId, snapSupervisorPessoaId: cota.snapSupervisorPessoaId, snapGerentePessoaId: cota.snapGerentePessoaId,
    snapRecuperacao: cota.snapRecuperacao,
  };
  const mudou = (Object.keys(antes) as Array<keyof typeof antes>).some((k) => antes[k] !== snap[k]) || vendedorId !== cota.vendedorId;
  if (!mudou) return false;
  await tx.cota.update({ where: { id: cotaId }, data: { ...snap, vendedorId, snapCongeladoEm: new Date(), snapOrigem: 'RECONGELAMENTO' } });
  await auditar(tx, { sessao: s, acao: 'RECONGELAMENTO', entidade: 'Cota', entidadeId: cotaId, antes, depois: snap, contexto: { motivo } });
  await enfileirarApuracao(tx, cotaId, 'recongelamento');
  return true;
}

/** Recongelamento de UMA venda: resolve pelo cadastro de hoje, mas na data original da venda. Exige nível tudo. */
export async function recongelarCota(s: Sessao, d: z.infer<typeof esquemaRecongelar>) {
  exigir(s, 'cotas', 'tudo');
  return prisma.$transaction(async (tx) => {
    const ok = await tx.cota.findFirst({ where: { id: d.cotaId, ...escopoCotas(s) }, select: { id: true } });
    if (!ok) throw new ErroNaoEncontrado();
    return recongelarUma(tx, s, d.cotaId, d.motivo, await carregarCadastroCasamento(tx));
  });
}

/** Etapa "conferir cadastro" do processamento: só as vendas com pendência de cadastro/estrutura, em lotes (retomável). */
/**
 * `depoisDe` (cursor por cotaId) permite percorrer todas uma vez só: vendas que continuam sem cadastro
 * continuam pendentes e não fazem o processamento girar em falso.
 */
export async function recongelarPendentes(s: Sessao, lote = 200, depoisDe: string | null = null): Promise<{ processadas: number; alteradas: number; restantes: number; ultimo: string | null }> {
  exigir(s, 'importacoes', 'editar');
  const ids = await prisma.pendencia.findMany({
    where: { resolvidaEm: null, tipo: { in: [...PENDENCIAS_DE_SNAPSHOT] }, cotaId: depoisDe ? { gt: depoisDe } : { not: null } },
    distinct: ['cotaId'], select: { cotaId: true }, orderBy: { cotaId: 'asc' },
  });
  const cadastro = await carregarCadastroCasamento(prisma);
  let alteradas = 0;
  const alvo = ids.slice(0, lote);
  for (const { cotaId } of alvo) {
    const mudou = await prisma.$transaction((tx) => recongelarUma(tx, s, cotaId as string, 'Recongelar todas (pendências de cadastro/estrutura)', cadastro));
    if (mudou) alteradas++;
  }
  return { processadas: alvo.length, alteradas, restantes: Math.max(0, ids.length - alvo.length), ultimo: (alvo[alvo.length - 1]?.cotaId as string | undefined) ?? null };
}

/** Vendedor corrigido pela administradora: aceitar = transferir (com rastro); rejeitar = manter, com rastro. */
export async function resolverDivergencia(s: Sessao, d: z.infer<typeof esquemaDivergencia>) {
  exigir(s, 'transferencias', 'editar');
  return prisma.$transaction(async (tx) => {
    const div = await tx.divergenciaVendedor.findUnique({ where: { id: d.id } });
    if (!div) throw new ErroNaoEncontrado();
    if (div.status !== 'ABERTA') throw new ErroDeDominio('Esta divergência já foi resolvida.');
    if (d.decisao === 'ACEITAR') {
      const r = casarVendedor(div.nomeNovo, div.docNovo, await carregarCadastroCasamento(tx));
      if (!r.vendedorId) throw new ErroDeDominio(`O vendedor "${div.nomeNovo ?? div.docNovo}" não tem cadastro. Cadastre-o (ou vincule o nome) antes de aceitar.`);
      await transferir(tx, s, div.cotaId, r.vendedorId, `Correção da administradora aceita${d.observacao ? ': ' + d.observacao : ''}`, 'DIVERGENCIA_IMPORTACAO');
    }
    const depois = await tx.divergenciaVendedor.update({
      where: { id: d.id }, data: { status: d.decisao === 'ACEITAR' ? 'ACEITA' : 'REJEITADA', resolvidoPorId: s.usuarioId, resolvidoEm: new Date(), observacao: d.observacao },
    });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'DivergenciaVendedor', entidadeId: d.id, antes: div, depois });
  });
}
