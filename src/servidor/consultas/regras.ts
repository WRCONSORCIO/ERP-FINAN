import { prisma } from '@/lib/db';
import { exigir, type Sessao } from '../contexto';
import { usoDaCategoria } from '../servicos/regras';

export async function dadosDeConfiguracao(s: Sessao) {
  exigir(s, 'regras');
  const [categorias, segmentos, tabelas, configs, regras, metas, flex, vendedores, pessoas] = await Promise.all([
    prisma.categoriaVendedor.findMany({ orderBy: { ordem: 'asc' } }),
    prisma.segmento.findMany({ orderBy: { nome: 'asc' } }),
    prisma.tabelaComissao.findMany({ include: { faixas: { orderBy: { parcela: 'asc' } }, segmento: true, categoria: true, titularVendedor: { select: { nome: true, documento: true } } }, orderBy: [{ destino: 'asc' }, { vigenteDe: 'desc' }] }),
    prisma.configuracaoEstorno.findMany({ orderBy: { vigenteDe: 'desc' } }),
    prisma.regraEstorno.findMany({ include: { titularVendedor: { select: { nome: true } } }, orderBy: [{ tipo: 'asc' }, { vigenteDe: 'desc' }] }),
    prisma.metaPromocao.findMany({ include: { categoriaOrigem: true, categoriaAlvo: true }, orderBy: { vigenteDe: 'desc' } }),
    prisma.modalidadeFlex.findMany({ orderBy: [{ codigo: 'asc' }, { vigenteDe: 'desc' }] }),
    prisma.vendedor.findMany({ select: { id: true, nome: true, tipoDocumento: true }, orderBy: { nome: 'asc' } }),
    prisma.pessoa.findMany({ where: { responsabilidades: { some: {} } }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  ]);
  const usos = new Map(await Promise.all(categorias.map(async (c) => [c.id, await usoDaCategoria(prisma, c.id)] as const)));
  const pessoasTitulares = await prisma.pessoa.findMany({ where: { id: { in: tabelas.map((t) => t.titularPessoaId).filter((x): x is string => x !== null) } }, select: { id: true, nome: true } });
  return { categorias, usos, segmentos, tabelas, configs, regras, metas, flex, vendedores, pessoas, pessoasTitulares };
}
