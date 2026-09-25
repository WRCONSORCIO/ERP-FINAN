import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';
import { aplicarPercentual, dec, formatarMoeda, formatarPercentual, paraTexto, somar, ZERO } from '@/lib/dinheiro';
import { formatarData, hoje, somarDias } from '@/lib/datas';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { normalizarNome } from '@/lib/texto';
import { planejarNaLinhaDoTempo, type ComVigencia } from '@/dominio/vigencia';
import { calcularBase } from '@/dominio/comissao';
import { CAMPOS_CARTEIRA } from '@/dominio/importacao/layouts';
import { auditar } from '../auditoria';
import { CHAVES } from '../configuracao';
import { exigir, type Sessao } from '../contexto';
import { enfileirarApuracao } from '../fila';
import { paraJson } from '../json';
import { usoDaVigencia, type EntidadeVigencia } from './vigencias';
import { zBooleano, zData, zDataOpcional, zId, zIdOpcional, zMoeda, zMotivo, zPercentual, zTexto, zTextoOpcional } from './esquemas';

// ------------------------------------------------------------------ Categorias

const zDocs = z.union([z.enum(['CPF', 'CNPJ']), z.array(z.enum(['CPF', 'CNPJ']))]).transform((v) => (Array.isArray(v) ? v : [v]));

export const esquemaCategoria = z.object({
  codigo: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_]+$/, 'Use letras maiúsculas, números e _'),
  nome: zTexto(60),
  descricao: zTextoOpcional(300),
  ordem: z.coerce.number().int().min(0).max(100),
  documentosAceitos: zDocs,
  pagaPelaWr: zBooleano,
  geraSupervisao: zBooleano,
  geraGerencia: zBooleano,
  contaParaPromocao: zBooleano,
});
export const esquemaEditarCategoria = esquemaCategoria.omit({ codigo: true }).extend({ id: zId, motivo: zMotivo });
export const esquemaAtivoCategoria = z.object({ id: zId, ativo: zBooleano });

export async function criarCategoria(s: Sessao, d: z.infer<typeof esquemaCategoria>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const c = await tx.categoriaVendedor.create({ data: d });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'CategoriaVendedor', entidadeId: c.id, depois: c, contexto: { operacao: 'criação' } });
    return c;
  });
}

/** Nome e comportamento FUTURO podem ser editados; o código nunca. Vendas já importadas guardam o comportamento congelado. */
export async function editarCategoria(s: Sessao, d: z.infer<typeof esquemaEditarCategoria>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.categoriaVendedor.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const { id, motivo, ...dados } = d;
    const depois = await tx.categoriaVendedor.update({ where: { id }, data: dados });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'CategoriaVendedor', entidadeId: id, antes, depois, contexto: { motivo } });
  });
}

export async function alterarAtivoCategoria(s: Sessao, d: z.infer<typeof esquemaAtivoCategoria>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.categoriaVendedor.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const depois = await tx.categoriaVendedor.update({ where: { id: d.id }, data: { ativo: d.ativo } });
    await auditar(tx, { sessao: s, acao: d.ativo ? 'REATIVACAO' : 'DESATIVACAO', entidade: 'CategoriaVendedor', entidadeId: d.id, antes, depois });
  });
}

export async function usoDaCategoria(db: Tx | typeof prisma, id: string): Promise<number> {
  const [vig, tab, cotas, metas] = await Promise.all([
    db.vendedorCategoria.count({ where: { categoriaId: id } }),
    db.tabelaComissao.count({ where: { categoriaId: id } }),
    db.cota.count({ where: { snapCategoriaId: id } }),
    db.metaPromocao.count({ where: { OR: [{ categoriaOrigemId: id }, { categoriaAlvoId: id }] } }),
  ]);
  return vig + tab + cotas + metas;
}

/** Categoria que já explica alguma coisa não se apaga — desativa. */
export async function excluirCategoria(s: Sessao, d: { id: string }) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const c = await tx.categoriaVendedor.findUnique({ where: { id: d.id } });
    if (!c) throw new ErroNaoEncontrado();
    const uso = await usoDaCategoria(tx, d.id);
    if (uso > 0) throw new ErroDeDominio(`A categoria ${c.nome} está em uso em ${uso} registro(s). Desative em vez de excluir.`);
    await tx.categoriaVendedor.delete({ where: { id: d.id } });
    await auditar(tx, { sessao: s, acao: 'EXCLUSAO', entidade: 'CategoriaVendedor', entidadeId: d.id, antes: c });
  });
}

// ------------------------------------------------------------------ Vigência genérica

/**
 * Salva uma regra "valendo a partir de" uma data, em qualquer ponto da linha do tempo:
 *  - data igual ao início de uma vigência existente e ainda não usada → substitui aquela vigência;
 *  - data depois de uma vigência → a anterior é encerrada no dia anterior;
 *  - data antes de uma vigência (inclusive data passada) → a nova termina na véspera da seguinte.
 * Recusado quando tiraria a regra de fato já apurado (nunca reescreve o passado). A EXCLUDE do banco
 * é a última barreira contra sobreposição.
 */
async function abrirVigencia<T extends ComVigencia & { id: string }>(p: {
  entidade: EntidadeVigencia;
  tx: Tx;
  lista: readonly T[];
  vigenteDe: Date;
  conflito: (anterior: T) => Promise<string | null>;
  encerrar: (id: string, ate: Date) => Promise<unknown>;
  excluir: (id: string) => Promise<unknown>;
}): Promise<{ anterior: T | null; encerrada: Date | null; vigenteAte: Date | null }> {
  const plano = planejarNaLinhaDoTempo(p.lista, p.vigenteDe);
  if (plano.mesma) {
    const uso = await usoDaVigencia(p.tx, p.entidade, plano.mesma.id);
    if (uso > 0) {
      throw new ErroDeDominio(
        `Já existe regra começando em ${formatarData(p.vigenteDe)} e ela já foi usada em ${uso} cálculo(s), então não pode ser trocada. ` +
          'Informe uma data posterior ao último cálculo para a regra nova valer dali em diante.',
      );
    }
    await p.excluir(plano.mesma.id);
    return { anterior: plano.mesma, encerrada: null, vigenteAte: plano.vigenteAte };
  }
  if (plano.anterior && plano.encerrarAnteriorEm) {
    const c = await p.conflito(plano.anterior);
    if (c) throw new ErroDeDominio(c);
    await p.encerrar(plano.anterior.id, plano.encerrarAnteriorEm);
  }
  return { anterior: plano.anterior, encerrada: plano.encerrarAnteriorEm, vigenteAte: plano.vigenteAte };
}

// ------------------------------------------------------------------ Tabelas de comissão

const zFaixaOpcional = z.string().trim().optional().transform((v) => (v ? v : null));
export const esquemaTabela = z.object({
  destino: z.enum(['VENDEDOR', 'SUPERVISAO', 'GERENCIA']),
  segmentoId: zId,
  categoriaId: zIdOpcional,
  titularVendedorId: zIdOpcional,
  titularPessoaId: zIdOpcional,
  vigenteDe: zData,
  /** Opcional: o valor vale só até esta data; depois volta o valor que valia antes. */
  vigenteAte: zDataOpcional,
  observacao: zTextoOpcional(300),
  p1: zFaixaOpcional, p2: zFaixaOpcional, p3: zFaixaOpcional, p4: zFaixaOpcional, p5: zFaixaOpcional, p6: zFaixaOpcional,
  p7: zFaixaOpcional, p8: zFaixaOpcional, p9: zFaixaOpcional, p10: zFaixaOpcional, p11: zFaixaOpcional, p12: zFaixaOpcional,
});
type EntradaTabela = z.infer<typeof esquemaTabela>;

function faixasDaEntrada(d: EntradaTabela): Array<{ parcela: number; percentual: string }> {
  const faixas: Array<{ parcela: number; percentual: string }> = [];
  for (let i = 1; i <= 12; i++) {
    const v = d[`p${i}` as keyof EntradaTabela] as string | null;
    if (v === null || v === undefined) continue;
    const r = zPercentual.safeParse(v);
    if (!r.success) throw new ErroDeDominio(`Percentual da ${i}ª parcela inválido.`);
    faixas.push({ parcela: i, percentual: r.data });
  }
  return faixas;
}

function validarChaveTabela(d: EntradaTabela) {
  if (d.destino === 'VENDEDOR' && !d.categoriaId) throw new ErroDeDominio('Escolha a categoria do vendedor em “Quem recebe”.');
  if (d.destino !== 'VENDEDOR' && (d.categoriaId || d.titularVendedorId)) throw new ErroDeDominio('Para supervisor ou gerente, a exceção precisa ser um supervisor/gerente, não um vendedor.');
  if (d.destino === 'VENDEDOR' && d.titularPessoaId) throw new ErroDeDominio('Para vendedor, a exceção precisa ser um vendedor (CPF/CNPJ), não um supervisor/gerente.');
}

function chaveTabelaWhere(d: EntradaTabela): Prisma.TabelaComissaoWhereInput {
  return { destino: d.destino, segmentoId: d.segmentoId, categoriaId: d.categoriaId, titularVendedorId: d.titularVendedorId, titularPessoaId: d.titularPessoaId };
}

export async function abrirVigenciaTabela(s: Sessao, d: EntradaTabela) {
  exigir(s, 'regras', 'editar');
  validarChaveTabela(d);
  const faixas = faixasDaEntrada(d);
  if (d.vigenteAte && d.vigenteAte < d.vigenteDe) throw new ErroDeDominio('A data final não pode ser anterior à data inicial.');
  return prisma.$transaction(async (tx) => {
    const lista = await tx.tabelaComissao.findMany({ where: chaveTabelaWhere(d), include: { faixas: true } });
    // Período que cobre a data de início (se houver): com data final, ele continua depois dela.
    const cobre = lista.find((t) => t.vigenteDe <= d.vigenteDe && (t.vigenteAte === null || t.vigenteAte >= d.vigenteDe)) ?? null;
    const fimOriginal = cobre?.vigenteAte ?? null;
    const { anterior: atual, encerrada, vigenteAte: fimCalculado } = await abrirVigencia({
      entidade: 'TABELA', tx, lista, vigenteDe: d.vigenteDe,
      excluir: async (id) => { await tx.faixaComissao.deleteMany({ where: { tabelaId: id } }); await tx.tabelaComissao.delete({ where: { id } }); },
      conflito: async (a) => {
        const c = await tx.comissaoApurada.findFirst({
          where: { tabelaId: a.id, status: { not: 'CANCELADA' }, cota: { dataVenda: { gte: d.vigenteDe } } },
          include: { cota: { select: { dataVenda: true, grupo: true, cota: true } } }, orderBy: { cota: { dataVenda: 'desc' } },
        });
        return c ? `A venda ${c.cota.grupo}/${c.cota.cota} de ${formatarData(c.cota.dataVenda)} já foi apurada com a tabela atual. Para não mudar o que já foi calculado, a regra nova precisa começar depois dessa data.` : null;
      },
      encerrar: (id, ate) => tx.tabelaComissao.update({ where: { id }, data: { vigenteAte: ate } }),
    });
    let vigenteAte = fimCalculado;
    if (d.vigenteAte) {
      if (fimCalculado && d.vigenteAte > fimCalculado) {
        throw new ErroDeDominio(`A data final passaria por cima do período seguinte, que começa em ${formatarData(somarDias(fimCalculado, 1))}.`);
      }
      vigenteAte = d.vigenteAte;
      // O período que cobria a data volta a valer depois da data final, com os mesmos percentuais.
      if (cobre && (fimOriginal === null || fimOriginal > d.vigenteAte)) {
        const continuacao = await tx.tabelaComissao.create({
          data: {
            destino: cobre.destino, segmentoId: cobre.segmentoId, categoriaId: cobre.categoriaId, titularVendedorId: cobre.titularVendedorId, titularPessoaId: cobre.titularPessoaId,
            vigenteDe: somarDias(d.vigenteAte, 1), vigenteAte: fimOriginal, observacao: cobre.observacao, criadoPorId: s.usuarioId,
            faixas: { create: cobre.faixas.map((f) => ({ parcela: f.parcela, percentual: f.percentual })) },
          },
        });
        await auditar(tx, {
          sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'TabelaComissao', entidadeId: continuacao.id,
          depois: { vigenteDe: continuacao.vigenteDe, vigenteAte: continuacao.vigenteAte, faixas: cobre.faixas.map((f) => ({ parcela: f.parcela, percentual: f.percentual })) },
          contexto: { operacao: 'continuação do período anterior depois de um intervalo com outro valor', periodoOriginal: cobre.id },
        });
      }
    }
    const nova = await tx.tabelaComissao.create({
      data: {
        destino: d.destino, segmentoId: d.segmentoId, categoriaId: d.categoriaId, titularVendedorId: d.titularVendedorId, titularPessoaId: d.titularPessoaId,
        vigenteDe: d.vigenteDe, vigenteAte, observacao: d.observacao, criadoPorId: s.usuarioId, faixas: { create: faixas },
      },
      include: { faixas: true },
    });
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'TabelaComissao', entidadeId: nova.id,
      antes: atual ? { id: atual.id, vigenteDe: atual.vigenteDe, vigenteAte: encerrada ?? atual.vigenteAte, faixas: atual.faixas.map((f) => ({ parcela: f.parcela, percentual: f.percentual })) } : null,
      depois: { vigenteDe: nova.vigenteDe, faixas: nova.faixas.map((f) => ({ parcela: f.parcela, percentual: f.percentual })) },
      contexto: { destino: d.destino, segmentoId: d.segmentoId, categoriaId: d.categoriaId, excecao: Boolean(d.titularVendedorId || d.titularPessoaId) },
    });
    // Vendas pendentes por falta desta tabela passam a ser apuráveis.
    const pend = await tx.pendencia.findMany({ where: { tipo: 'SEM_TABELA', resolvidaEm: null, destino: d.destino, cotaId: { not: null } }, select: { cotaId: true } });
    for (const p of pend) await enfileirarApuracao(tx, p.cotaId as string, 'nova tabela de comissão');
    return nova;
  });
}

export interface ResultadoSimulacao {
  cotasAvaliadas: number;
  totalAtual: string;
  totalNovo: string;
  diferenca: string;
  amostraDesde: string;
  exemplos: Array<{ cota: string; credito: string; flex: string; atual: string; novo: string; formulaNova: string }>;
  aviso: string;
}

/**
 * Pré-visualização SEM GRAVAR NADA: aplica os percentuais novos às vendas dos últimos 3 meses que usariam
 * esta tabela, para responder "quanto muda daqui para frente?". Vendas já registradas NÃO serão alteradas.
 */
export async function simularTabela(s: Sessao, d: EntradaTabela): Promise<ResultadoSimulacao> {
  exigir(s, 'regras', 'editar');
  validarChaveTabela(d);
  const faixasNovas = faixasDaEntrada(d);
  const desde = somarDias(hoje(), -92);
  const atual = await prisma.tabelaComissao.findFirst({ where: { ...chaveTabelaWhere(d), vigenteAte: null }, include: { faixas: true } });
  const filtroCota: Prisma.CotaWhereInput = {
    dataVenda: { gte: desde }, snapSegmentoId: d.segmentoId, snapModalidadeFlexId: { not: null },
    ...(d.destino === 'VENDEDOR' ? { snapCategoriaId: d.categoriaId } : d.destino === 'SUPERVISAO' ? { snapGeraSupervisao: true } : { snapGeraGerencia: true }),
    ...(d.titularVendedorId ? { snapVendedorId: d.titularVendedorId } : {}),
    ...(d.titularPessoaId ? (d.destino === 'SUPERVISAO' ? { snapSupervisorPessoaId: d.titularPessoaId } : { snapGerentePessoaId: d.titularPessoaId }) : {}),
  };
  const cotas = await prisma.cota.findMany({ where: filtroCota, include: { snapModalidadeFlex: true }, take: 5000, orderBy: { dataVenda: 'desc' } });
  let totalAtual = ZERO;
  let totalNovo = ZERO;
  const exemplos: ResultadoSimulacao['exemplos'] = [];
  for (const c of cotas) {
    const base = calcularBase(dec(c.credito), dec(c.snapModalidadeFlex!.percentual));
    const va = somar((atual?.faixas ?? []).map((f) => aplicarPercentual(base, f.percentual)));
    const vn = somar(faixasNovas.map((f) => aplicarPercentual(base, f.percentual)));
    totalAtual = totalAtual.plus(va);
    totalNovo = totalNovo.plus(vn);
    if (exemplos.length < 8) {
      exemplos.push({
        cota: `${c.grupo}/${c.cota}`, credito: formatarMoeda(c.credito), flex: formatarPercentual(c.snapModalidadeFlex!.percentual),
        atual: formatarMoeda(va), novo: formatarMoeda(vn),
        formulaNova: `${formatarMoeda(base)} × (${faixasNovas.map((f) => formatarPercentual(f.percentual)).join(' + ') || '0%'}) = ${formatarMoeda(vn)}`,
      });
    }
  }
  return {
    cotasAvaliadas: cotas.length, totalAtual: paraTexto(totalAtual), totalNovo: paraTexto(totalNovo), diferenca: paraTexto(totalNovo.minus(totalAtual)),
    amostraDesde: formatarData(desde), exemplos,
    aviso: 'Simulação: nada foi gravado. A regra nova vale só para vendas a partir da data informada; vendas já registradas continuam com a regra da data delas.',
  };
}

// ------------------------------------------------------------------ Estorno

const zParticipantes = z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));
export const esquemaConfigEstorno = z.object({
  participantes: zParticipantes,
  criterioCancelamento: z.enum(['IGUAL', 'ABAIXO_DE']),
  limiteParcelas: z.coerce.number().int().min(0).max(999),
  /** Vazio = recuperação com qualquer quantidade de parcelas pagas. */
  criterioRecuperacao: z.enum(['IGUAL', 'ABAIXO_DE', '']).optional().transform((v) => (v ? v : null)),
  limiteRecuperacao: z.string().trim().optional().transform((v) => (v ? Number(v) : null)).refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 999), 'Informe um número de parcelas (1 ou mais)'),
  escopoBase: z.enum(['PARCELAS_RECEBIDAS', 'PRIMEIRA_PARCELA', 'TOTAL_TABELA']),
  vigenteDe: zData,
});
export const esquemaDefinirEscopo = z.object({ configuracaoId: zId, escopoBase: z.enum(['PARCELAS_RECEBIDAS', 'PRIMEIRA_PARCELA', 'TOTAL_TABELA']) });
export const esquemaRegraEstorno = z.object({
  tipo: z.enum(['RECUPERACAO', 'CANCELAMENTO']),
  /** Código da categoria ou SUPERVISAO/GERENCIA; vazio = regra padrão. */
  participante: z.string().trim().optional().transform((v) => (v ? v : null)),
  titularVendedorId: zIdOpcional,
  percentual: zPercentual,
  vigenteDe: zData,
});

async function participantesValidos(tx: Tx, lista: string[]): Promise<string[]> {
  const codigos = new Set((await tx.categoriaVendedor.findMany({ select: { codigo: true } })).map((c) => c.codigo));
  for (const p of lista) if (p !== 'SUPERVISAO' && p !== 'GERENCIA' && !codigos.has(p)) throw new ErroDeDominio(`Participante desconhecido: ${p}`);
  return [...new Set(lista)];
}

async function reapurarCanceladasComPendencia(tx: Tx, motivo: string) {
  const pend = await tx.pendencia.findMany({
    where: { resolvidaEm: null, tipo: { in: ['ESTORNO_SEM_CONFIGURACAO', 'ESTORNO_SEM_REGRA'] }, cotaId: { not: null } }, select: { cotaId: true }, distinct: ['cotaId'],
  });
  for (const p of pend) await enfileirarApuracao(tx, p.cotaId as string, motivo);
}

export async function abrirVigenciaConfigEstorno(s: Sessao, d: z.infer<typeof esquemaConfigEstorno>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    if (d.criterioRecuperacao && d.limiteRecuperacao === null) throw new ErroDeDominio('Informe o número de parcelas da regra de recuperação.');
    const participantes = await participantesValidos(tx, d.participantes);
    const lista = await tx.configuracaoEstorno.findMany();
    const { anterior: atual, encerrada, vigenteAte } = await abrirVigencia({
      entidade: 'CONFIG_ESTORNO', tx, lista, vigenteDe: d.vigenteDe,
      excluir: (id) => tx.configuracaoEstorno.delete({ where: { id } }),
      conflito: async (a) => {
        const e = await tx.estorno.findFirst({ where: { configuracaoId: a.id, status: { not: 'INVALIDADO' }, dataEvento: { gte: d.vigenteDe } }, orderBy: { dataEvento: 'desc' } });
        return e ? `Já há estorno apurado com a configuração atual para cancelamento em ${formatarData(e.dataEvento)}. Para não mudar o que já foi calculado, a regra nova precisa começar depois dessa data.` : null;
      },
      encerrar: (id, ate) => tx.configuracaoEstorno.update({ where: { id }, data: { vigenteAte: ate } }),
    });
    const nova = await tx.configuracaoEstorno.create({
      data: {
        participantes, criterioCancelamento: d.criterioCancelamento, limiteParcelas: d.limiteParcelas,
        criterioRecuperacao: d.criterioRecuperacao, limiteRecuperacao: d.criterioRecuperacao ? d.limiteRecuperacao : null,
        escopoBase: d.escopoBase, vigenteDe: d.vigenteDe, vigenteAte, criadoPorId: s.usuarioId,
      },
    });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'ConfiguracaoEstorno', entidadeId: nova.id, antes: atual ? { ...atual, vigenteAte: encerrada ?? atual.vigenteAte } : null, depois: nova });
    await reapurarCanceladasComPendencia(tx, 'nova configuração de estorno');
    return nova;
  });
}

/**
 * Completa uma configuração cujo escopo da base ficou INDEFINIDO. Não é alterar regra: com escopo
 * indefinido nenhum estorno foi apurado (virou pendência). Só é aceito enquanto o escopo estiver vazio.
 */
export async function definirEscopoBase(s: Sessao, d: z.infer<typeof esquemaDefinirEscopo>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const c = await tx.configuracaoEstorno.findUnique({ where: { id: d.configuracaoId } });
    if (!c) throw new ErroNaoEncontrado();
    if (c.escopoBase !== null) throw new ErroDeDominio('Esta regra já está completa. Para mudar, salve uma regra nova com a data da mudança.');
    const depois = await tx.configuracaoEstorno.update({ where: { id: c.id }, data: { escopoBase: d.escopoBase } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'ConfiguracaoEstorno', entidadeId: c.id, antes: c, depois, contexto: { operacao: 'definição de escopo indefinido' } });
    await reapurarCanceladasComPendencia(tx, 'escopo da base do estorno definido');
  });
}

export async function abrirVigenciaRegraEstorno(s: Sessao, d: z.infer<typeof esquemaRegraEstorno>) {
  exigir(s, 'regras', 'editar');
  if (d.participante && d.titularVendedorId) throw new ErroDeDominio('Escolha a categoria OU o vendedor da exceção, não os dois.');
  return prisma.$transaction(async (tx) => {
    if (d.participante) await participantesValidos(tx, [d.participante]);
    const lista = await tx.regraEstorno.findMany({ where: { tipo: d.tipo, participante: d.participante, titularVendedorId: d.titularVendedorId } });
    const { anterior: atual, encerrada, vigenteAte } = await abrirVigencia({
      entidade: 'REGRA_ESTORNO', tx, lista, vigenteDe: d.vigenteDe,
      excluir: (id) => tx.regraEstorno.delete({ where: { id } }),
      conflito: async (a) => {
        const e = await tx.estorno.findFirst({ where: { regraId: a.id, status: { not: 'INVALIDADO' }, dataEvento: { gte: d.vigenteDe } }, orderBy: { dataEvento: 'desc' } });
        return e ? `Já há estorno apurado com o percentual atual para cancelamento em ${formatarData(e.dataEvento)}. Para não mudar o que já foi calculado, a regra nova precisa começar depois dessa data.` : null;
      },
      encerrar: (id, ate) => tx.regraEstorno.update({ where: { id }, data: { vigenteAte: ate } }),
    });
    const nova = await tx.regraEstorno.create({ data: { tipo: d.tipo, participante: d.participante, titularVendedorId: d.titularVendedorId, percentual: d.percentual, vigenteDe: d.vigenteDe, vigenteAte, criadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'RegraEstorno', entidadeId: nova.id, antes: atual ? { ...atual, vigenteAte: encerrada ?? atual.vigenteAte } : null, depois: nova });
    await reapurarCanceladasComPendencia(tx, 'nova regra de estorno');
    return nova;
  });
}

// ------------------------------------------------------------------ Metas

export const esquemaMeta = z.object({
  categoriaOrigemId: zId, categoriaAlvoId: zId, volumeMinimo: zMoeda, alertaAoFaltar: zMoeda,
  documentoExigido: z.enum(['CPF', 'CNPJ', '']).optional().transform((v) => (v ? v : null)), vigenteDe: zData,
});

/** Mudar a meta hoje não reclassifica quem já foi promovido sob a meta anterior (promoção é ato registrado). */
export async function abrirVigenciaMeta(s: Sessao, d: z.infer<typeof esquemaMeta>) {
  exigir(s, 'regras', 'editar');
  if (!dec(d.volumeMinimo).isPositive()) throw new ErroDeDominio('Volume mínimo precisa ser maior que zero.');
  return prisma.$transaction(async (tx) => {
    const lista = await tx.metaPromocao.findMany({ where: { categoriaOrigemId: d.categoriaOrigemId } });
    const { anterior: atual, encerrada, vigenteAte } = await abrirVigencia({
      entidade: 'META', tx, lista, vigenteDe: d.vigenteDe, conflito: async () => null,
      excluir: (id) => tx.metaPromocao.delete({ where: { id } }),
      encerrar: (id, ate) => tx.metaPromocao.update({ where: { id }, data: { vigenteAte: ate } }),
    });
    const nova = await tx.metaPromocao.create({ data: { ...d, vigenteAte, criadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'MetaPromocao', entidadeId: nova.id, antes: atual ? { ...atual, vigenteAte: encerrada ?? atual.vigenteAte } : null, depois: nova });
    return nova;
  });
}

// ------------------------------------------------------------------ Flex e segmentos

const zAliases = z.string().trim().max(1000).optional().transform((v) => (v ?? '').split(/[,;\n]/).map((a) => a.trim()).filter((a) => a !== ''));
export const esquemaFlex = z.object({ codigo: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_]+$/, 'Use letras maiúsculas, números e _'), nome: zTexto(60), percentual: zPercentual, aliases: zAliases, vigenteDe: zData });
export const esquemaAliases = z.object({ id: zId, aliases: zAliases });
export const esquemaSegmento = z.object({ codigo: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_]+$/), nome: zTexto(60), aliases: zAliases });

export async function abrirVigenciaFlex(s: Sessao, d: z.infer<typeof esquemaFlex>) {
  exigir(s, 'regras', 'editar');
  if (dec(d.percentual).isZero()) throw new ErroDeDominio('Percentual do flex precisa ser maior que zero.');
  return prisma.$transaction(async (tx) => {
    const lista = await tx.modalidadeFlex.findMany({ where: { codigo: d.codigo } });
    const { anterior: atual, encerrada, vigenteAte } = await abrirVigencia({
      entidade: 'FLEX', tx, lista, vigenteDe: d.vigenteDe,
      excluir: (id) => tx.modalidadeFlex.delete({ where: { id } }),
      conflito: async (a) => {
        const c = await tx.cota.findFirst({ where: { snapModalidadeFlexId: a.id, dataVenda: { gte: d.vigenteDe } }, orderBy: { dataVenda: 'desc' } });
        return c ? `A venda ${c.grupo}/${c.cota} de ${formatarData(c.dataVenda)} já está congelada com este flex. Para não mudar o que já foi calculado, a regra nova precisa começar depois dessa data.` : null;
      },
      encerrar: (id, ate) => tx.modalidadeFlex.update({ where: { id }, data: { vigenteAte: ate } }),
    });
    const nova = await tx.modalidadeFlex.create({ data: { ...d, vigenteAte, aliases: d.aliases.map(normalizarNome), criadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO_REGRA', entidade: 'ModalidadeFlex', entidadeId: nova.id, antes: atual ? { ...atual, vigenteAte: encerrada ?? atual.vigenteAte } : null, depois: nova });
    return nova;
  });
}

/** Apelidos só afetam o reconhecimento de vendas FUTURAS (o que já entrou está congelado). */
export async function editarAliasesFlex(s: Sessao, d: z.infer<typeof esquemaAliases>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.modalidadeFlex.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const depois = await tx.modalidadeFlex.update({ where: { id: d.id }, data: { aliases: d.aliases.map(normalizarNome) } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'ModalidadeFlex', entidadeId: d.id, antes: { aliases: antes.aliases }, depois: { aliases: depois.aliases } });
  });
}

export async function criarSegmento(s: Sessao, d: z.infer<typeof esquemaSegmento>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const seg = await tx.segmento.create({ data: { ...d, aliases: d.aliases.map(normalizarNome) } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'Segmento', entidadeId: seg.id, depois: seg });
  });
}

export async function editarAliasesSegmento(s: Sessao, d: z.infer<typeof esquemaAliases>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.segmento.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const depois = await tx.segmento.update({ where: { id: d.id }, data: { aliases: d.aliases.map(normalizarNome) } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'Segmento', entidadeId: d.id, antes: { aliases: antes.aliases }, depois: { aliases: depois.aliases } });
  });
}

// ------------------------------------------------------------------ Layouts de importação

export const esquemaLayoutCarteira = z.object({
  separador: z.string().length(1),
  situacoesCanceladas: zAliases,
  ...Object.fromEntries(CAMPOS_CARTEIRA.map((c) => [`col_${c}`, zAliases])),
});
export const esquemaLayoutPdf = z.object({
  tipo: z.enum(['FECHAMENTO_CV056E', 'COMISSAO_VENDEDOR_CV069E', 'BONUS_GC070A']),
  marcador: zTexto(30), linha: zTexto(2000), total: zTexto(1000),
  cancelamento: zAliases, comissao: zAliases,
});

export async function salvarLayoutCarteira(s: Sessao, d: Record<string, unknown>) {
  exigir(s, 'importacoes', 'editar');
  const r = esquemaLayoutCarteira.parse(d) as Record<string, unknown> & { separador: string; situacoesCanceladas: string[] };
  const colunas = Object.fromEntries(CAMPOS_CARTEIRA.map((c) => [c, (r[`col_${c}`] as string[]) ?? []]));
  const valor = { separador: r.separador, colunas, situacoesCanceladas: r.situacoesCanceladas };
  await salvarConfig(s, CHAVES.CARTEIRA_CSV, valor, 'Layout da base de clientes (CSV)');
}

export async function salvarLayoutPdf(s: Sessao, d: z.infer<typeof esquemaLayoutPdf>) {
  exigir(s, 'importacoes', 'editar');
  for (const [nome, re] of [['linha', d.linha], ['total', d.total]] as const) {
    try { new RegExp(re, 'i'); } catch { throw new ErroDeDominio(`Expressão "${nome}" inválida.`); }
  }
  if (!/\(\?<valor>/.test(d.linha) || !/\(\?<grupo>/.test(d.linha) || !/\(\?<cota>/.test(d.linha)) throw new ErroDeDominio('A expressão da linha precisa dos grupos nomeados grupo, cota e valor.');
  if (!/\(\?<total>/.test(d.total)) throw new ErroDeDominio('A expressão do total precisa do grupo nomeado total.');
  const valor = { marcador: d.marcador, linha: d.linha, total: d.total, ...(d.tipo === 'FECHAMENTO_CV056E' ? { classificacao: { CANCELAMENTO: d.cancelamento, COMISSAO_PARCELA: d.comissao } } : {}) };
  await salvarConfig(s, CHAVES[d.tipo], valor, `Layout ${d.tipo}`);
}

async function salvarConfig(s: Sessao, chave: string, valor: unknown, descricao: string) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.configuracaoSistema.findUnique({ where: { chave } });
    const json = paraJson(valor) ?? {};
    await tx.configuracaoSistema.upsert({ where: { chave }, create: { chave, valor: json, descricao, atualizadoPorId: s.usuarioId }, update: { valor: json, atualizadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'ConfiguracaoSistema', entidadeId: chave, antes: antes?.valor ?? null, depois: valor });
  });
}

/** Simulação do percentual de estorno sobre os estornos dos últimos 3 meses do mesmo tipo. Nada é gravado. */
export async function simularRegraEstorno(s: Sessao, d: z.infer<typeof esquemaRegraEstorno>): Promise<ResultadoSimulacao> {
  exigir(s, 'regras', 'editar');
  const desde = somarDias(hoje(), -92);
  const estornos = await prisma.estorno.findMany({
    where: {
      tipo: d.tipo, status: { not: 'INVALIDADO' }, dataEvento: { gte: desde },
      ...(d.titularVendedorId ? { titularVendedorId: d.titularVendedorId } : {}),
      ...(d.participante === 'SUPERVISAO' || d.participante === 'GERENCIA' ? { destino: d.participante }
        : d.participante ? { destino: 'VENDEDOR', cota: { snapCategoria: { codigo: d.participante } } } : {}),
    },
    include: { cota: { select: { grupo: true, cota: true, credito: true } } }, take: 5000, orderBy: { dataEvento: 'desc' },
  });
  let totalAtual = ZERO;
  let totalNovo = ZERO;
  const exemplos: ResultadoSimulacao['exemplos'] = [];
  for (const e of estornos) {
    const novo = aplicarPercentual(e.comissaoBase, d.percentual);
    totalAtual = totalAtual.plus(dec(e.valor));
    totalNovo = totalNovo.plus(novo);
    if (exemplos.length < 8) exemplos.push({ cota: `${e.cota.grupo}/${e.cota.cota}`, credito: formatarMoeda(e.cota.credito), flex: '—', atual: formatarMoeda(e.valor), novo: formatarMoeda(novo), formulaNova: `${formatarMoeda(e.comissaoBase)} × ${formatarPercentual(d.percentual)} = ${formatarMoeda(novo)}` });
  }
  return {
    cotasAvaliadas: estornos.length, totalAtual: paraTexto(totalAtual), totalNovo: paraTexto(totalNovo), diferenca: paraTexto(totalNovo.minus(totalAtual)),
    amostraDesde: formatarData(desde), exemplos,
    aviso: 'Simulação: nada foi gravado. O novo percentual vale só para cancelamentos a partir da data informada; estornos já apurados não mudam.',
  };
}
