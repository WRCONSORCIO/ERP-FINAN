import { prisma } from '@/lib/db';
import { exigir, type Sessao } from '../contexto';

/** Lista enxuta para o combobox de cliente (dono atual / comprador) do formulário de carta. */
export async function listarClientesCarta(s: Sessao) {
  exigir(s, 'cartas');
  return prisma.clienteCarta.findMany({ orderBy: { nome: 'asc' }, take: 2000 });
}

export async function buscarClienteCarta(s: Sessao, id: string) {
  exigir(s, 'cartas');
  return prisma.clienteCarta.findUnique({ where: { id }, include: { cartasVendidas: true, cartasCompradas: true } });
}
