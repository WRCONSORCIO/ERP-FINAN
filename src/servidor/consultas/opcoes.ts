import { prisma } from '@/lib/db';
import { hoje } from '@/lib/datas';
import { escopoEquipes, escopoGerencias, type Sessao } from '../contexto';

/** Listas para selects de formulário — também recortadas pelo escopo. */
export async function opcoesDeFormulario(s: Sessao) {
  const [categorias, equipes, gerencias, segmentos, administradoras] = await Promise.all([
    prisma.categoriaVendedor.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' } }),
    prisma.equipe.findMany({ where: { status: 'ATIVO', ...escopoEquipes(s) }, include: { gerencia: true }, orderBy: [{ gerencia: { nome: 'asc' } }, { nome: 'asc' }] }),
    prisma.gerencia.findMany({ where: { status: 'ATIVO', ...escopoGerencias(s) }, orderBy: { nome: 'asc' } }),
    prisma.segmento.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } }),
    prisma.administradora.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } }),
  ]);
  return { categorias, equipes, gerencias, segmentos, administradoras, hojeISO: hoje().toISOString().slice(0, 10) };
}
