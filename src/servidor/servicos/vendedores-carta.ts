import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { zId, zTexto, zTextoOpcional } from './esquemas';

export const esquemaCadastroVendedorCarta = z.object({ nome: zTexto(150), telefone: zTextoOpcional(30), email: zTextoOpcional(150) });
export const esquemaAlterarVendedorCarta = esquemaCadastroVendedorCarta.extend({ id: zId });
export const esquemaVendedorCartaId = z.object({ id: zId });

/** Representante interno que recebe comissão pelas negociações de cartas contempladas. */
export async function cadastrarVendedorCarta(s: Sessao, d: z.infer<typeof esquemaCadastroVendedorCarta>) {
  exigir(s, 'cartas', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await tx.vendedorCarta.create({ data: { nome: d.nome.replace(/\s+/g, ' ').toUpperCase(), telefone: d.telefone, email: d.email, criadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'VendedorCarta', entidadeId: v.id, depois: v });
    return v;
  });
}

export async function alterarVendedorCarta(s: Sessao, d: z.infer<typeof esquemaAlterarVendedorCarta>) {
  exigir(s, 'cartas', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.vendedorCarta.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado('Vendedor não encontrado.');
    const depois = await tx.vendedorCarta.update({ where: { id: d.id }, data: { nome: d.nome.replace(/\s+/g, ' ').toUpperCase(), telefone: d.telefone, email: d.email } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'VendedorCarta', entidadeId: d.id, antes, depois });
    return depois;
  });
}

export async function desativarVendedorCarta(s: Sessao, d: z.infer<typeof esquemaVendedorCartaId>) {
  exigir(s, 'cartas', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await tx.vendedorCarta.findUnique({ where: { id: d.id } });
    if (!v) throw new ErroNaoEncontrado();
    if (!v.ativo) throw new ErroDeDominio('Este vendedor já está inativo.');
    const depois = await tx.vendedorCarta.update({ where: { id: d.id }, data: { ativo: false } });
    await auditar(tx, { sessao: s, acao: 'DESATIVACAO', entidade: 'VendedorCarta', entidadeId: d.id, antes: v, depois });
  });
}

export async function reativarVendedorCarta(s: Sessao, d: z.infer<typeof esquemaVendedorCartaId>) {
  exigir(s, 'cartas', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await tx.vendedorCarta.findUnique({ where: { id: d.id } });
    if (!v) throw new ErroNaoEncontrado();
    if (v.ativo) throw new ErroDeDominio('Este vendedor já está ativo.');
    const depois = await tx.vendedorCarta.update({ where: { id: d.id }, data: { ativo: true } });
    await auditar(tx, { sessao: s, acao: 'REATIVACAO', entidade: 'VendedorCarta', entidadeId: d.id, antes: v, depois });
  });
}
