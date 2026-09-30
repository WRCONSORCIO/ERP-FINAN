import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hoje } from '@/lib/datas';
import { somenteDigitos } from '@/lib/documento';
import { exigir, type Sessao } from '../contexto';
import { listarClientesCarta } from './clientes-carta';
import { listarVendedoresCartaAtivos } from './vendedores-carta';
import { param, paginaDe, POR_PAGINA, type Params } from './comum';

export type AbaCartas = 'todas' | 'ESTOQUE' | 'VENDIDA' | 'TRANSFERIDA' | 'INTERMEDIACAO';
const ABAS_STATUS = new Set(['ESTOQUE', 'VENDIDA', 'TRANSFERIDA']);

export interface FiltroCartas {
  busca: string;
  aba: AbaCartas;
  administradoraId: string;
}

export function lerFiltroCartas(p: Params): FiltroCartas {
  const abaBruta = param(p, 'aba');
  const aba: AbaCartas = abaBruta === 'INTERMEDIACAO' || ABAS_STATUS.has(abaBruta) ? (abaBruta as AbaCartas) : 'todas';
  return { busca: param(p, 'busca'), aba, administradoraId: param(p, 'administradoraId') };
}

/** Filtro da listagem. `semAba` monta o "resto" do filtro para contar cada aba (mesmo padrão de whereCarteira/semSituacao). */
export function whereCartas(f: FiltroCartas, semAba = false): Prisma.CartaWhereInput {
  const e: Prisma.CartaWhereInput[] = [];
  if (!semAba) {
    if (f.aba === 'INTERMEDIACAO') e.push({ tipoNegociacao: 'INTERMEDIACAO' });
    else if (ABAS_STATUS.has(f.aba)) e.push({ status: f.aba as 'ESTOQUE' | 'VENDIDA' | 'TRANSFERIDA' });
  }
  if (f.administradoraId) e.push({ administradoraId: f.administradoraId });
  if (f.busca) {
    const dig = somenteDigitos(f.busca);
    e.push({
      OR: [
        { codigo: { contains: f.busca, mode: 'insensitive' } },
        { administradora: { nome: { contains: f.busca, mode: 'insensitive' } } },
        { clienteVendedor: { nome: { contains: f.busca, mode: 'insensitive' } } },
        { clienteComprador: { nome: { contains: f.busca, mode: 'insensitive' } } },
        { vendedorCarta: { nome: { contains: f.busca, mode: 'insensitive' } } },
        ...(dig.length >= 3 ? [{ clienteVendedor: { documento: { contains: dig } } }, { clienteComprador: { documento: { contains: dig } } }] : []),
      ],
    });
  }
  return e.length > 0 ? { AND: e } : {};
}

const INCLUDE_CARTA = {
  administradora: true,
  vendedorCarta: true,
  clienteVendedor: true,
  clienteComprador: true,
} satisfies Prisma.CartaInclude;

export async function listarCartas(s: Sessao, p: Params) {
  exigir(s, 'cartas');
  const f = lerFiltroCartas(p);
  const pagina = paginaDe(p);
  const whereBase = whereCartas(f, true);
  const where = whereCartas(f);
  const [total, cartas, porStatus, intermediacao] = await Promise.all([
    prisma.carta.count({ where }),
    prisma.carta.findMany({ where, include: INCLUDE_CARTA, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    prisma.carta.groupBy({ by: ['status'], where: whereBase, _count: true }),
    prisma.carta.count({ where: { AND: [whereBase, { tipoNegociacao: 'INTERMEDIACAO' }] } }),
  ]);
  const contagens = {
    todas: porStatus.reduce((a, x) => a + x._count, 0),
    ESTOQUE: porStatus.find((x) => x.status === 'ESTOQUE')?._count ?? 0,
    VENDIDA: porStatus.find((x) => x.status === 'VENDIDA')?._count ?? 0,
    TRANSFERIDA: porStatus.find((x) => x.status === 'TRANSFERIDA')?._count ?? 0,
    INTERMEDIACAO: intermediacao,
  };
  return { filtro: f, pagina, total, cartas, contagens };
}

export async function buscarCarta(s: Sessao, id: string) {
  exigir(s, 'cartas');
  const carta = await prisma.carta.findUnique({ where: { id }, include: INCLUDE_CARTA });
  if (!carta) return null;
  const auditoria = await prisma.auditLog.findMany({ where: { entidade: 'Carta', entidadeId: id }, orderBy: { criadoEm: 'desc' }, take: 30, include: { usuario: { select: { nome: true } } } });
  return { carta, auditoria };
}

/** Listas para os selects/combobox do formulário de carta. */
export async function opcoesFormularioCarta(s: Sessao) {
  exigir(s, 'cartas');
  const [administradoras, vendedoresCarta, clientesCarta] = await Promise.all([
    prisma.administradora.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } }),
    listarVendedoresCartaAtivos(s),
    listarClientesCarta(s),
  ]);
  return { administradoras, vendedoresCarta, clientesCarta, hojeISO: hoje().toISOString().slice(0, 10) };
}
