import { prisma } from '@/lib/db';
import { exigir, type Sessao } from '../contexto';
import { PENDENCIAS_DE_SNAPSHOT } from '../servicos/cotas';
import { layoutCarteira, layoutsPdf } from '../configuracao';

export async function painelImportacoes(s: Sessao, importacaoId: string | null) {
  exigir(s, 'importacoes');
  const [faltaAplicar, filaPendente, filaErro, semEstrutura, pendenciasPorTipo, historico, divergencias, administradoras] = await Promise.all([
    prisma.importacao.findMany({ where: { status: { in: ['RECEBIDA', 'APLICANDO'] } }, orderBy: { enviadoEm: 'asc' }, include: { _count: { select: { linhas: { where: { status: 'PENDENTE' } } } } } }),
    prisma.eventoDominio.count({ where: { status: 'PENDENTE' } }),
    prisma.eventoDominio.findMany({ where: { status: 'ERRO' }, orderBy: { criadoEm: 'desc' }, take: 20, include: { cota: { select: { grupo: true, cota: true } } } }),
    prisma.pendencia.findMany({ where: { resolvidaEm: null, tipo: { in: [...PENDENCIAS_DE_SNAPSHOT] } }, distinct: ['cotaId'], select: { cotaId: true } }),
    prisma.pendencia.groupBy({ by: ['tipo'], where: { resolvidaEm: null }, _count: true, orderBy: { _count: { tipo: 'desc' } } }),
    prisma.importacao.findMany({ orderBy: { enviadoEm: 'desc' }, take: 30, include: { administradora: { select: { codigo: true } } } }),
    prisma.divergenciaVendedor.findMany({ where: { status: 'ABERTA' }, include: { cota: { select: { id: true, grupo: true, cota: true, clienteNome: true } } }, orderBy: { criadoEm: 'desc' }, take: 50 }),
    prisma.administradora.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } }),
  ]);
  const exemplos = await Promise.all(pendenciasPorTipo.map(async (p) => ({
    tipo: p.tipo, quantidade: p._count,
    exemplos: await prisma.pendencia.findMany({ where: { tipo: p.tipo, resolvidaEm: null }, take: 3, include: { cota: { select: { id: true, grupo: true, cota: true } } }, orderBy: { criadoEm: 'desc' } }),
  })));
  const selecionada = importacaoId ? historico.find((i) => i.id === importacaoId) ?? (await prisma.importacao.findUnique({ where: { id: importacaoId }, include: { administradora: { select: { codigo: true } } } })) : historico[0] ?? null;
  const erros = selecionada ? await prisma.importacaoErro.findMany({ where: { importacaoId: selecionada.id }, orderBy: { linha: 'asc' }, take: 500 }) : [];
  return {
    faltaAplicar, filaPendente, filaErro, semEstrutura: semEstrutura.length, diagnostico: exemplos, historico, divergencias, administradoras, selecionada, erros,
    layouts: { carteira: await layoutCarteira(prisma), pdf: await layoutsPdf(prisma) },
  };
}
