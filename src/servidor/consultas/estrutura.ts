import { prisma } from '@/lib/db';
import { hoje, vigenteEm } from '@/lib/datas';
import { pode } from '@/lib/permissoes';
import { escopoEquipes, escopoGerencias, exigir, type Sessao } from '../contexto';

export async function arvoreDaEstrutura(s: Sessao) {
  exigir(s, 'equipes');
  const d = hoje();
  const gerencias = await prisma.gerencia.findMany({
    where: escopoGerencias(s),
    orderBy: [{ status: 'asc' }, { nome: 'asc' }],
    include: {
      responsaveis: { include: { pessoa: true }, orderBy: { vigenteDe: 'desc' } },
      equipes: {
        where: escopoEquipes(s),
        orderBy: [{ status: 'asc' }, { nome: 'asc' }],
        include: {
          responsaveis: { include: { pessoa: true }, orderBy: { vigenteDe: 'desc' } },
          alocacoes: { where: { vigenteDe: { lte: d }, OR: [{ vigenteAte: null }, { vigenteAte: { gte: d } }] }, include: { vendedor: { include: { pessoa: true } } } },
        },
      },
    },
  });
  const atual = <T extends { vigenteDe: Date; vigenteAte: Date | null }>(l: T[]) => l.find((r) => vigenteEm(d, r.vigenteDe, r.vigenteAte)) ?? null;
  const arvore = gerencias.map((g) => ({
    ...g,
    gerenteAtual: atual(g.responsaveis),
    equipes: g.equipes.map((e) => ({ ...e, supervisorAtual: atual(e.responsaveis) })),
  }));
  const ativas = arvore.filter((g) => g.status === 'ATIVO');
  const equipesAtivas = ativas.flatMap((g) => g.equipes.filter((e) => e.status === 'ATIVO'));
  return {
    arvore,
    indicadores: {
      gerencias: ativas.length,
      supervisoes: equipesAtivas.length,
      gerenciasSemGerente: ativas.filter((g) => !g.gerenteAtual).length,
      supervisoesSemSupervisor: equipesAtivas.filter((e) => !e.supervisorAtual).length,
    },
    // Listas de edição só para quem edita (não trafegam para quem só vê).
    pessoas: pode(s.perfil, 'equipes', 'editar') ? await prisma.pessoa.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true }, take: 3000 }) : [],
    administradoras: pode(s.perfil, 'gerencias', 'editar') ? await prisma.administradora.findMany({ orderBy: { nome: 'asc' } }) : [],
  };
}
