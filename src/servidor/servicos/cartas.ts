import { z } from 'zod';
import type { Carta } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';
import { lerMoedaTexto, paraTexto, type Dec } from '@/lib/dinheiro';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { calcularLucro } from '@/dominio/cartas';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { zData, zDataOpcional, zId, zIdOpcional, zMoeda, zMotivo, zTextoOpcional } from './esquemas';

/** Como zMoeda, mas aceita vazio/ausente (campo só obrigatório quando a carta está vendida). */
const zMoedaOpcional = z
  .string()
  .trim()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || lerMoedaTexto(s) !== null, 'Valor inválido')
  .transform((s) => (s === null ? null : paraTexto((lerMoedaTexto(s) as NonNullable<ReturnType<typeof lerMoedaTexto>>).toDecimalPlaces(2))));

const zInteiro = z.coerce.number().int().min(0).max(99_999);

const camposCarta = z.object({
  administradoraId: zId,
  tipoNegociacao: z.enum(['COMPRA_VENDA', 'INTERMEDIACAO']),
  status: z.enum(['ESTOQUE', 'VENDIDA', 'TRANSFERIDA']),
  vendedorCartaId: zIdOpcional,
  clienteVendedorId: zId,
  clienteCompradorId: zIdOpcional,
  valorCarta: zMoeda,
  valorCompra: zMoeda,
  valorVenda: zMoedaOpcional,
  valorParcela: zMoeda,
  parcelasPagas: zInteiro,
  parcelasAPagar: zInteiro,
  comissaoVendedor: zMoeda,
  dataCompra: zData,
  dataVenda: zDataOpcional,
  dataTransferencia: zDataOpcional,
  observacoes: zTextoOpcional(2000),
});

/** Mesma regra da constraint ck_carta_situacao do banco — validada já no Zod, pra dar erro de campo. */
function refinarSituacao(d: z.infer<typeof camposCarta>, ctx: z.RefinementCtx) {
  if (d.status === 'VENDIDA') {
    if (!d.clienteCompradorId) ctx.addIssue({ code: 'custom', path: ['clienteCompradorId'], message: 'Obrigatório: quem comprou a carta.' });
    if (!d.dataVenda) ctx.addIssue({ code: 'custom', path: ['dataVenda'], message: 'Obrigatório: data da venda.' });
    if (d.valorVenda === null) ctx.addIssue({ code: 'custom', path: ['valorVenda'], message: 'Obrigatório: valor da venda.' });
  }
  if (d.status === 'TRANSFERIDA' && !d.dataTransferencia) {
    ctx.addIssue({ code: 'custom', path: ['dataTransferencia'], message: 'Obrigatório: data da transferência para o nome da empresa.' });
  }
}

export const esquemaCadastroCarta = camposCarta.superRefine(refinarSituacao);
export const esquemaAlterarCarta = camposCarta.extend({ id: zId }).superRefine(refinarSituacao);
export const esquemaExcluirCarta = z.object({ id: zId, motivo: zMotivo });

type DadosCarta = z.infer<typeof camposCarta>;

function lucroDaSituacao(d: DadosCarta): Dec | null {
  if (d.status !== 'VENDIDA' || d.valorVenda === null) return null;
  return calcularLucro(d.valorVenda, d.valorCompra, d.comissaoVendedor);
}

async function validarReferencias(tx: Tx, d: Pick<DadosCarta, 'administradoraId' | 'clienteVendedorId' | 'clienteCompradorId' | 'vendedorCartaId'>) {
  const adm = await tx.administradora.findUnique({ where: { id: d.administradoraId } });
  if (!adm || !adm.ativo) throw new ErroDeDominio('Administradora inexistente ou inativa.');
  const clienteVendedor = await tx.clienteCarta.findUnique({ where: { id: d.clienteVendedorId } });
  if (!clienteVendedor) throw new ErroNaoEncontrado('Cliente (dono atual da carta) não encontrado.');
  if (d.clienteCompradorId) {
    if (d.clienteCompradorId === d.clienteVendedorId) throw new ErroDeDominio('O comprador não pode ser o mesmo cliente que vendeu a carta.');
    const comprador = await tx.clienteCarta.findUnique({ where: { id: d.clienteCompradorId } });
    if (!comprador) throw new ErroNaoEncontrado('Cliente comprador não encontrado.');
  }
  if (d.vendedorCartaId) {
    const vendedor = await tx.vendedorCarta.findUnique({ where: { id: d.vendedorCartaId } });
    if (!vendedor || !vendedor.ativo) throw new ErroDeDominio('Vendedor inexistente ou inativo.');
  }
}

async function proximoCodigo(tx: Tx): Promise<string> {
  const r = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('carta_codigo_seq') AS nextval`;
  const n = r[0]?.nextval ?? 1n;
  return `CART-${String(n).padStart(4, '0')}`;
}

function dadosParaGravar(d: DadosCarta) {
  const lucro = lucroDaSituacao(d);
  return {
    administradoraId: d.administradoraId,
    tipoNegociacao: d.tipoNegociacao,
    status: d.status,
    vendedorCartaId: d.vendedorCartaId,
    clienteVendedorId: d.clienteVendedorId,
    clienteCompradorId: d.status === 'VENDIDA' ? d.clienteCompradorId : null,
    valorCarta: d.valorCarta,
    valorCompra: d.valorCompra,
    valorVenda: d.status === 'VENDIDA' ? d.valorVenda : null,
    valorParcela: d.valorParcela,
    parcelasPagas: d.parcelasPagas,
    parcelasAPagar: d.parcelasAPagar,
    comissaoVendedor: d.comissaoVendedor,
    dataCompra: d.dataCompra,
    dataVenda: d.status === 'VENDIDA' ? d.dataVenda : null,
    dataTransferencia: d.status === 'TRANSFERIDA' ? d.dataTransferencia : null,
    observacoes: d.observacoes,
    lucro: lucro ? lucro.toFixed(2) : null,
  };
}

/** Cadastra uma carta contemplada: gera o código sequencial e calcula o lucro (se já vendida). */
export async function cadastrarCarta(s: Sessao, d: z.infer<typeof esquemaCadastroCarta>): Promise<Carta> {
  exigir(s, 'cartas', 'editar');
  return prisma.$transaction(async (tx) => {
    await validarReferencias(tx, d);
    const codigo = await proximoCodigo(tx);
    const carta = await tx.carta.create({ data: { codigo, criadoPorId: s.usuarioId, ...dadosParaGravar(d) } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'Carta', entidadeId: carta.id, depois: carta });
    return carta;
  });
}

export async function alterarCarta(s: Sessao, d: z.infer<typeof esquemaAlterarCarta>): Promise<Carta> {
  exigir(s, 'cartas', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.carta.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado('Carta não encontrada.');
    await validarReferencias(tx, d);
    const depois = await tx.carta.update({ where: { id: d.id }, data: dadosParaGravar(d) });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'Carta', entidadeId: d.id, antes, depois });
    return depois;
  });
}

/**
 * Exclusão física — exceção deliberada e escopada a este módulo: o padrão do ERP para
 * registro financeiro é append-only, mas o usuário decidiu manter CRUD completo aqui,
 * como no app de referência. O motivo fica na auditoria.
 */
export async function excluirCarta(s: Sessao, d: z.infer<typeof esquemaExcluirCarta>): Promise<void> {
  exigir(s, 'cartas', 'editar');
  return prisma.$transaction(async (tx) => {
    const carta = await tx.carta.findUnique({ where: { id: d.id } });
    if (!carta) throw new ErroNaoEncontrado('Carta não encontrada.');
    await tx.carta.delete({ where: { id: d.id } });
    await auditar(tx, { sessao: s, acao: 'EXCLUSAO', entidade: 'Carta', entidadeId: d.id, antes: carta, contexto: { motivo: d.motivo } });
  });
}
