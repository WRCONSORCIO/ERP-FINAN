import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dec, ZERO, type Dec } from '@/lib/dinheiro';
import { competenciaDe, fimExclusivo, hoje, periodoDoMes } from '@/lib/datas';
import { escopoComissoes, escopoEstornos, exigir, type Sessao } from '../contexto';

export interface LinhaBeneficiario {
  pessoaId: string;
  nome: string;
  previsto: Dec;
  liberado: Dec;
  emFolha: Dec;
  estornoACobrar: Dec;
}

export async function aPagar(s: Sessao) {
  exigir(s, 'comissoes');
  const base: Prisma.ComissaoApuradaWhereInput = { AND: [escopoComissoes(s), { pagaPelaWr: true }] };
  const [previsto, liberado, emFolha, estornos] = await Promise.all([
    prisma.comissaoApurada.groupBy({ by: ['titularPessoaId'], where: { AND: [base, { status: { in: ['PREVISTA', 'LIBERADA'] }, folhaId: null }] }, _sum: { valor: true } }),
    prisma.comissaoApurada.groupBy({ by: ['titularPessoaId'], where: { AND: [base, { status: 'LIBERADA', folhaId: null }] }, _sum: { valor: true } }),
    prisma.comissaoApurada.groupBy({ by: ['titularPessoaId'], where: { AND: [base, { status: 'EM_FOLHA' }] }, _sum: { valor: true } }),
    prisma.estorno.groupBy({ by: ['titularPessoaId'], where: { AND: [escopoEstornos(s), { status: { in: ['A_COBRAR', 'EM_COBRANCA'] } }] }, _sum: { valor: true } }),
  ]);
  const ids = new Set<string>([...previsto, ...liberado, ...emFolha].map((x) => x.titularPessoaId));
  for (const e of estornos) if (e.titularPessoaId) ids.add(e.titularPessoaId);
  const pessoas = new Map((await prisma.pessoa.findMany({ where: { id: { in: [...ids] } }, select: { id: true, nome: true } })).map((p) => [p.id, p.nome]));
  const v = (l: Array<{ titularPessoaId: string | null; _sum: { valor: Prisma.Decimal | null } }>, id: string) => dec(l.find((x) => x.titularPessoaId === id)?._sum.valor ?? 0);
  const linhas: LinhaBeneficiario[] = [...ids].map((id) => ({
    pessoaId: id, nome: pessoas.get(id) ?? '—', previsto: v(previsto, id), liberado: v(liberado, id), emFolha: v(emFolha, id), estornoACobrar: v(estornos, id),
  })).sort((a, b) => b.liberado.comparedTo(a.liberado) || a.nome.localeCompare(b.nome));
  const soma = (k: keyof Omit<LinhaBeneficiario, 'pessoaId' | 'nome'>) => linhas.reduce((t, l) => t.plus(l[k]), ZERO);
  const semTitular = dec(estornos.find((e) => e.titularPessoaId === null)?._sum.valor ?? 0);
  return {
    linhas,
    totais: { previsto: soma('previsto'), liberado: soma('liberado'), emFolha: soma('emFolha'), estornoACobrar: soma('estornoACobrar').plus(semTitular) },
    estornoSemTitular: semTitular,
  };
}

export async function detalheBeneficiario(s: Sessao, pessoaId: string) {
  exigir(s, 'comissoes');
  return prisma.comissaoApurada.findMany({
    where: { AND: [escopoComissoes(s), { titularPessoaId: pessoaId, pagaPelaWr: true, status: { in: ['PREVISTA', 'LIBERADA', 'EM_FOLHA'] } }] },
    include: { cota: { select: { id: true, clienteNome: true, grupo: true, cota: true } }, titularVendedor: { select: { tipoDocumento: true, documento: true } }, folha: { select: { competencia: true } } },
    orderBy: [{ status: 'asc' }, { cota: { dataVenda: 'desc' } }, { parcela: 'asc' }],
    take: 1000,
  });
}

export async function folhas(s: Sessao) {
  exigir(s, 'comissoes');
  return prisma.folhaComissao.findMany({ orderBy: { fechadaEm: 'desc' }, take: 36 });
}

/** Prévia do fechamento: o que entraria na folha da competência (só o liberado, fora de folha, pago pela WR). */
export async function previaFechamento(s: Sessao, competencia: string) {
  exigir(s, 'comissoes', 'editar');
  const per = periodoDoMes(competencia);
  if (!per) return null;
  const r = await prisma.comissaoApurada.aggregate({
    where: { status: 'LIBERADA', pagaPelaWr: true, folhaId: null, liberadaEm: { lt: fimExclusivo(per) } }, _sum: { valor: true }, _count: true,
  });
  return { competencia, quantidade: r._count, total: dec(r._sum.valor ?? 0) };
}

export function competenciaPadrao(): string {
  return competenciaDe(hoje());
}
