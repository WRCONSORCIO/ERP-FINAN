import { prisma } from '@/lib/db';
import { exigir, type Sessao } from '../contexto';
import { param, type Params } from './comum';

/** Lista enxuta para o combobox "Vendedor interno" do formulário de carta (só ativos). */
export async function listarVendedoresCartaAtivos(s: Sessao) {
  exigir(s, 'cartas');
  return prisma.vendedorCarta.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
}

export async function listarVendedoresCarta(s: Sessao, p: Params) {
  exigir(s, 'cartas');
  const busca = param(p, 'busca');
  const vendedores = await prisma.vendedorCarta.findMany({
    where: busca ? { nome: { contains: busca, mode: 'insensitive' } } : {},
    include: { _count: { select: { cartas: true } } },
    orderBy: [{ nome: 'asc' }],
  });
  return { busca, ativos: vendedores.filter((v) => v.ativo), inativos: vendedores.filter((v) => !v.ativo) };
}

export async function buscarVendedorCarta(s: Sessao, id: string) {
  exigir(s, 'cartas');
  return prisma.vendedorCarta.findUnique({
    where: { id },
    include: { cartas: { include: { administradora: true, clienteVendedor: true }, orderBy: { criadoEm: 'desc' } } },
  });
}
