import { prisma } from '@/lib/db';
import { somar } from '@/lib/dinheiro';
import { fimExclusivo, type Periodo } from '@/lib/datas';
import { escopoComissoes, escopoEstornos, exigir, type Sessao } from '../contexto';

/** Extrato do período por pessoa: cada venda, cada parcela, o percentual, os estornos e o total — mesmo detalhe da tela. */
export async function extratoDaPessoa(s: Sessao, pessoaId: string, p: Periodo) {
  exigir(s, 'comissoes');
  const pessoa = await prisma.pessoa.findUnique({ where: { id: pessoaId }, include: { documentos: { select: { tipoDocumento: true, documento: true } } } });
  if (!pessoa) return null;
  const fim = fimExclusivo(p);
  const [comissoes, estornos] = await Promise.all([
    prisma.comissaoApurada.findMany({
      where: { AND: [escopoComissoes(s), { titularPessoaId: pessoaId, status: { in: ['LIBERADA', 'EM_FOLHA', 'PAGA'] }, liberadaEm: { gte: p.de, lt: fim } }] },
      include: { cota: { select: { id: true, clienteNome: true, grupo: true, cota: true, credito: true, dataVenda: true, snapModalidadeFlex: { select: { nome: true, percentual: true } } } }, titularVendedor: { select: { tipoDocumento: true, documento: true } } },
      orderBy: [{ cota: { dataVenda: 'asc' } }, { parcela: 'asc' }],
    }),
    prisma.estorno.findMany({
      where: { AND: [escopoEstornos(s), { titularPessoaId: pessoaId, status: { not: 'INVALIDADO' }, dataEvento: { gte: p.de, lt: fim } }] },
      include: { cota: { select: { id: true, clienteNome: true, grupo: true, cota: true, credito: true } } },
      orderBy: { dataEvento: 'asc' },
    }),
  ]);
  const pagasWr = comissoes.filter((c) => c.pagaPelaWr);
  const totalComissao = somar(pagasWr.map((c) => c.valor));
  const totalAdm = somar(comissoes.filter((c) => !c.pagaPelaWr).map((c) => c.valor));
  const totalEstorno = somar(estornos.map((e) => e.valor));
  return { pessoa, comissoes, estornos, totalComissao, totalAdm, totalEstorno, liquidoInformativo: totalComissao.minus(totalEstorno) };
}
