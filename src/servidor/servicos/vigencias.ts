import { z } from 'zod';
import { prisma, type Tx } from '@/lib/db';
import { dec } from '@/lib/dinheiro';
import { diaAnterior } from '@/lib/datas';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { enfileirarApuracao } from '../fila';
import { zData, zDataOpcional, zId, zMoeda, zMotivo, zPercentual, zTexto, zTextoOpcional } from './esquemas';

/**
 * Correção de CADASTRO de regra com vigência. Só é aceita enquanto a vigência não explicou nenhum
 * cálculo: corrigir uma regra que ainda não foi usada não reescreve o passado. Usada = imutável
 * (abra vigência nova). Toda correção e exclusão vai para a auditoria com antes, depois e motivo.
 */
export const ENTIDADES_VIGENCIA = ['TABELA', 'CONFIG_ESTORNO', 'REGRA_ESTORNO', 'META', 'FLEX'] as const;
export type EntidadeVigencia = (typeof ENTIDADES_VIGENCIA)[number];

const NOME: Record<EntidadeVigencia, string> = {
  TABELA: 'TabelaComissao', CONFIG_ESTORNO: 'ConfiguracaoEstorno', REGRA_ESTORNO: 'RegraEstorno', META: 'MetaPromocao', FLEX: 'ModalidadeFlex',
};

/** Quantos cálculos gravados apontam para a vigência. Meta: promoção é ato registrado, nada aponta para ela. */
export async function usoDaVigencia(db: Tx | typeof prisma, entidade: EntidadeVigencia, id: string): Promise<number> {
  switch (entidade) {
    case 'TABELA': return db.comissaoApurada.count({ where: { tabelaId: id } });
    case 'CONFIG_ESTORNO': return db.estorno.count({ where: { configuracaoId: id } });
    case 'REGRA_ESTORNO': return db.estorno.count({ where: { regraId: id } });
    case 'FLEX': return db.cota.count({ where: { snapModalidadeFlexId: id } });
    case 'META': return 0;
  }
}

/** Contagem de uso de todas as vigências de uma vez (para a tela). */
export async function usosDasVigencias(): Promise<Map<string, number>> {
  const [tab, cfg, reg, flex] = await Promise.all([
    prisma.comissaoApurada.groupBy({ by: ['tabelaId'], _count: { _all: true } }),
    prisma.estorno.groupBy({ by: ['configuracaoId'], _count: { _all: true } }),
    prisma.estorno.groupBy({ by: ['regraId'], _count: { _all: true } }),
    prisma.cota.groupBy({ by: ['snapModalidadeFlexId'], _count: { _all: true } }),
  ]);
  const m = new Map<string, number>();
  for (const r of tab) m.set(r.tabelaId, r._count._all);
  for (const r of cfg) m.set(r.configuracaoId, r._count._all);
  for (const r of reg) if (r.regraId) m.set(r.regraId, r._count._all);
  for (const r of flex) if (r.snapModalidadeFlexId) m.set(r.snapModalidadeFlexId, r._count._all);
  return m;
}

async function exigirSemUso(tx: Tx, entidade: EntidadeVigencia, id: string) {
  const uso = await usoDaVigencia(tx, entidade, id);
  if (uso > 0) {
    throw new ErroDeDominio(
      `Esta vigência já foi usada em ${uso} cálculo(s) e não pode ser corrigida nem excluída — isso reescreveria o passado. ` +
        'Para mudar daqui para frente, abra uma vigência nova.',
    );
  }
}

/** Datas coerentes: fim nunca antes do início (o banco também confere). */
function validarPeriodo(de: Date, ate: Date | null) {
  if (ate && ate < de) throw new ErroDeDominio('A data final não pode ser anterior à data inicial.');
}

/** Depois de corrigir regra, as vendas em pendência voltam para a fila: a regra corrigida pode resolvê-las. */
async function reenfileirarPendentes(tx: Tx, tipos: Array<'SEM_TABELA' | 'ESTORNO_SEM_CONFIGURACAO' | 'ESTORNO_SEM_REGRA'>, motivo: string) {
  const pend = await tx.pendencia.findMany({ where: { resolvidaEm: null, tipo: { in: tipos }, cotaId: { not: null } }, select: { cotaId: true }, distinct: ['cotaId'] });
  for (const p of pend) await enfileirarApuracao(tx, p.cotaId as string, motivo);
}

async function reenfileirarCotasDaChave(tx: Tx, entidade: EntidadeVigencia) {
  if (entidade === 'TABELA') await reenfileirarPendentes(tx, ['SEM_TABELA'], 'tabela de comissão corrigida');
  if (entidade === 'CONFIG_ESTORNO' || entidade === 'REGRA_ESTORNO') await reenfileirarPendentes(tx, ['ESTORNO_SEM_CONFIGURACAO', 'ESTORNO_SEM_REGRA'], 'regra de estorno corrigida');
}

// ------------------------------------------------------------------ Exclusão

export const esquemaExcluirVigencia = z.object({ entidade: z.enum(ENTIDADES_VIGENCIA), id: zId, motivo: zMotivo });

type Linha = { id: string; vigenteDe: Date; vigenteAte: Date | null };

/** A vigência imediatamente anterior da MESMA chave (a que foi encerrada quando esta foi aberta). */
async function anteriorDaMesmaChave(tx: Tx, entidade: EntidadeVigencia, id: string): Promise<{ anterior: Linha | null; atual: Record<string, unknown> & Linha }> {
  switch (entidade) {
    case 'TABELA': {
      const a = await tx.tabelaComissao.findUnique({ where: { id }, include: { faixas: { orderBy: { parcela: 'asc' } } } });
      if (!a) throw new ErroNaoEncontrado();
      const anterior = await tx.tabelaComissao.findFirst({ where: { destino: a.destino, segmentoId: a.segmentoId, categoriaId: a.categoriaId, titularVendedorId: a.titularVendedorId, titularPessoaId: a.titularPessoaId, vigenteAte: diaAnterior(a.vigenteDe) } });
      return { anterior, atual: a };
    }
    case 'CONFIG_ESTORNO': {
      const a = await tx.configuracaoEstorno.findUnique({ where: { id } });
      if (!a) throw new ErroNaoEncontrado();
      return { anterior: await tx.configuracaoEstorno.findFirst({ where: { vigenteAte: diaAnterior(a.vigenteDe) } }), atual: a };
    }
    case 'REGRA_ESTORNO': {
      const a = await tx.regraEstorno.findUnique({ where: { id } });
      if (!a) throw new ErroNaoEncontrado();
      return { anterior: await tx.regraEstorno.findFirst({ where: { tipo: a.tipo, participante: a.participante, titularVendedorId: a.titularVendedorId, vigenteAte: diaAnterior(a.vigenteDe) } }), atual: a };
    }
    case 'META': {
      const a = await tx.metaPromocao.findUnique({ where: { id } });
      if (!a) throw new ErroNaoEncontrado();
      return { anterior: await tx.metaPromocao.findFirst({ where: { categoriaOrigemId: a.categoriaOrigemId, vigenteAte: diaAnterior(a.vigenteDe) } }), atual: a };
    }
    case 'FLEX': {
      const a = await tx.modalidadeFlex.findUnique({ where: { id } });
      if (!a) throw new ErroNaoEncontrado();
      return { anterior: await tx.modalidadeFlex.findFirst({ where: { codigo: a.codigo, vigenteAte: diaAnterior(a.vigenteDe) } }), atual: a };
    }
  }
}

async function estenderAte(tx: Tx, entidade: EntidadeVigencia, id: string, ate: Date | null) {
  const data = { vigenteAte: ate };
  switch (entidade) {
    case 'TABELA': return tx.tabelaComissao.update({ where: { id }, data });
    case 'CONFIG_ESTORNO': return tx.configuracaoEstorno.update({ where: { id }, data });
    case 'REGRA_ESTORNO': return tx.regraEstorno.update({ where: { id }, data });
    case 'META': return tx.metaPromocao.update({ where: { id }, data });
    case 'FLEX': return tx.modalidadeFlex.update({ where: { id }, data });
  }
}

/**
 * Exclui uma vigência que nunca foi usada. A vigência anterior da mesma chave, que tinha sido
 * encerrada por esta, volta a valer pelo período dela (desfaz a abertura).
 */
export async function excluirVigencia(s: Sessao, d: z.infer<typeof esquemaExcluirVigencia>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    await exigirSemUso(tx, d.entidade, d.id);
    const { anterior, atual } = await anteriorDaMesmaChave(tx, d.entidade, d.id);
    switch (d.entidade) {
      case 'TABELA':
        await tx.faixaComissao.deleteMany({ where: { tabelaId: d.id } });
        await tx.tabelaComissao.delete({ where: { id: d.id } });
        break;
      case 'CONFIG_ESTORNO': await tx.configuracaoEstorno.delete({ where: { id: d.id } }); break;
      case 'REGRA_ESTORNO': await tx.regraEstorno.delete({ where: { id: d.id } }); break;
      case 'META': await tx.metaPromocao.delete({ where: { id: d.id } }); break;
      case 'FLEX': await tx.modalidadeFlex.delete({ where: { id: d.id } }); break;
    }
    if (anterior) await estenderAte(tx, d.entidade, anterior.id, atual.vigenteAte);
    await auditar(tx, {
      sessao: s, acao: 'EXCLUSAO', entidade: NOME[d.entidade], entidadeId: d.id, antes: atual,
      contexto: { motivo: d.motivo, operacao: 'exclusão de vigência sem uso', anteriorReaberta: anterior ? { id: anterior.id, vigenteAteAntes: anterior.vigenteAte, vigenteAteDepois: atual.vigenteAte } : null },
    });
    await reenfileirarCotasDaChave(tx, d.entidade);
    return { anteriorReaberta: anterior !== null };
  });
}

// ------------------------------------------------------------------ Correção

const zVigencia = { id: zId, vigenteDe: zData, vigenteAte: zDataOpcional, motivo: zMotivo };
const zFaixa = z.string().trim().optional().transform((v) => (v ? v : null));

export const esquemaCorrigirRegraEstorno = z.object({ ...zVigencia, percentual: zPercentual });
export const esquemaCorrigirTabela = z.object({
  ...zVigencia, observacao: zTextoOpcional(300),
  p1: zFaixa, p2: zFaixa, p3: zFaixa, p4: zFaixa, p5: zFaixa, p6: zFaixa, p7: zFaixa, p8: zFaixa, p9: zFaixa, p10: zFaixa, p11: zFaixa, p12: zFaixa,
});
const zParticipantes = z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));
export const esquemaCorrigirConfigEstorno = z.object({
  ...zVigencia,
  participantes: zParticipantes,
  criterioCancelamento: z.enum(['IGUAL', 'ABAIXO_DE']),
  limiteParcelas: z.coerce.number().int().min(0).max(999),
  escopoBase: z.enum(['PARCELAS_RECEBIDAS', 'PRIMEIRA_PARCELA', 'TOTAL_TABELA', '']).optional().transform((v) => (v ? v : null)),
});
export const esquemaCorrigirMeta = z.object({
  ...zVigencia, categoriaAlvoId: zId, volumeMinimo: zMoeda, alertaAoFaltar: zMoeda,
  documentoExigido: z.enum(['CPF', 'CNPJ', '']).optional().transform((v) => (v ? v : null)),
});
export const esquemaCorrigirFlex = z.object({ ...zVigencia, nome: zTexto(60), percentual: zPercentual });

async function registrarCorrecao(tx: Tx, s: Sessao, entidade: EntidadeVigencia, id: string, antes: unknown, depois: unknown, motivo: string) {
  await auditar(tx, { sessao: s, acao: 'ALTERACAO_REGRA', entidade: NOME[entidade], entidadeId: id, antes, depois, contexto: { motivo, operacao: 'correção de vigência sem uso' } });
  await reenfileirarCotasDaChave(tx, entidade);
}

export async function corrigirRegraEstorno(s: Sessao, d: z.infer<typeof esquemaCorrigirRegraEstorno>) {
  exigir(s, 'regras', 'editar');
  validarPeriodo(d.vigenteDe, d.vigenteAte);
  return prisma.$transaction(async (tx) => {
    await exigirSemUso(tx, 'REGRA_ESTORNO', d.id);
    const antes = await tx.regraEstorno.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const depois = await tx.regraEstorno.update({ where: { id: d.id }, data: { percentual: d.percentual, vigenteDe: d.vigenteDe, vigenteAte: d.vigenteAte } });
    await registrarCorrecao(tx, s, 'REGRA_ESTORNO', d.id, antes, depois, d.motivo);
  });
}

export async function corrigirTabela(s: Sessao, d: z.infer<typeof esquemaCorrigirTabela>) {
  exigir(s, 'regras', 'editar');
  validarPeriodo(d.vigenteDe, d.vigenteAte);
  const faixas: Array<{ parcela: number; percentual: string }> = [];
  for (let i = 1; i <= 12; i++) {
    const v = d[`p${i}` as keyof typeof d] as string | null;
    if (v === null) continue;
    const r = zPercentual.safeParse(v);
    if (!r.success) throw new ErroDeDominio(`Percentual da ${i}ª parcela inválido.`);
    faixas.push({ parcela: i, percentual: r.data });
  }
  return prisma.$transaction(async (tx) => {
    await exigirSemUso(tx, 'TABELA', d.id);
    const antes = await tx.tabelaComissao.findUnique({ where: { id: d.id }, include: { faixas: { orderBy: { parcela: 'asc' } } } });
    if (!antes) throw new ErroNaoEncontrado();
    await tx.faixaComissao.deleteMany({ where: { tabelaId: d.id } });
    const depois = await tx.tabelaComissao.update({
      where: { id: d.id }, data: { vigenteDe: d.vigenteDe, vigenteAte: d.vigenteAte, observacao: d.observacao, faixas: { create: faixas } },
      include: { faixas: { orderBy: { parcela: 'asc' } } },
    });
    const resumo = (t: typeof antes) => ({ vigenteDe: t.vigenteDe, vigenteAte: t.vigenteAte, observacao: t.observacao, faixas: t.faixas.map((f) => ({ parcela: f.parcela, percentual: f.percentual })) });
    await registrarCorrecao(tx, s, 'TABELA', d.id, resumo(antes), resumo(depois), d.motivo);
  });
}

export async function corrigirConfigEstorno(s: Sessao, d: z.infer<typeof esquemaCorrigirConfigEstorno>) {
  exigir(s, 'regras', 'editar');
  validarPeriodo(d.vigenteDe, d.vigenteAte);
  return prisma.$transaction(async (tx) => {
    await exigirSemUso(tx, 'CONFIG_ESTORNO', d.id);
    const antes = await tx.configuracaoEstorno.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const codigos = new Set((await tx.categoriaVendedor.findMany({ select: { codigo: true } })).map((c) => c.codigo));
    for (const p of d.participantes) if (p !== 'SUPERVISAO' && p !== 'GERENCIA' && !codigos.has(p)) throw new ErroDeDominio(`Participante desconhecido: ${p}`);
    const depois = await tx.configuracaoEstorno.update({
      where: { id: d.id },
      data: { participantes: [...new Set(d.participantes)], criterioCancelamento: d.criterioCancelamento, limiteParcelas: d.limiteParcelas, escopoBase: d.escopoBase, vigenteDe: d.vigenteDe, vigenteAte: d.vigenteAte },
    });
    await registrarCorrecao(tx, s, 'CONFIG_ESTORNO', d.id, antes, depois, d.motivo);
  });
}

export async function corrigirMeta(s: Sessao, d: z.infer<typeof esquemaCorrigirMeta>) {
  exigir(s, 'regras', 'editar');
  validarPeriodo(d.vigenteDe, d.vigenteAte);
  if (!dec(d.volumeMinimo).isPositive()) throw new ErroDeDominio('Volume mínimo precisa ser maior que zero.');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.metaPromocao.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const depois = await tx.metaPromocao.update({
      where: { id: d.id },
      data: { categoriaAlvoId: d.categoriaAlvoId, volumeMinimo: d.volumeMinimo, alertaAoFaltar: d.alertaAoFaltar, documentoExigido: d.documentoExigido, vigenteDe: d.vigenteDe, vigenteAte: d.vigenteAte },
    });
    await registrarCorrecao(tx, s, 'META', d.id, antes, depois, d.motivo);
  });
}

export async function corrigirFlex(s: Sessao, d: z.infer<typeof esquemaCorrigirFlex>) {
  exigir(s, 'regras', 'editar');
  validarPeriodo(d.vigenteDe, d.vigenteAte);
  if (dec(d.percentual).isZero()) throw new ErroDeDominio('Percentual do flex precisa ser maior que zero.');
  return prisma.$transaction(async (tx) => {
    await exigirSemUso(tx, 'FLEX', d.id);
    const antes = await tx.modalidadeFlex.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const depois = await tx.modalidadeFlex.update({ where: { id: d.id }, data: { nome: d.nome, percentual: d.percentual, vigenteDe: d.vigenteDe, vigenteAte: d.vigenteAte } });
    await registrarCorrecao(tx, s, 'FLEX', d.id, antes, depois, d.motivo);
  });
}

// ------------------------------------------------------------------ Segmentos

export const esquemaEditarSegmento = z.object({ id: zId, nome: zTexto(60), ativo: z.union([z.literal('true'), z.literal('on'), z.literal('false')]).optional().transform((v) => v === 'true' || v === 'on'), motivo: zMotivo });

export async function usoDoSegmento(db: Tx | typeof prisma, id: string): Promise<number> {
  const [t, c] = await Promise.all([db.tabelaComissao.count({ where: { segmentoId: id } }), db.cota.count({ where: { snapSegmentoId: id } })]);
  return t + c;
}

/** O código do segmento é a chave que as vendas carregam: nome e situação podem mudar; o código não. */
export async function editarSegmento(s: Sessao, d: z.infer<typeof esquemaEditarSegmento>) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.segmento.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const depois = await tx.segmento.update({ where: { id: d.id }, data: { nome: d.nome, ativo: d.ativo } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'Segmento', entidadeId: d.id, antes, depois, contexto: { motivo: d.motivo } });
  });
}

export async function excluirSegmento(s: Sessao, d: { id: string; motivo: string }) {
  exigir(s, 'regras', 'editar');
  return prisma.$transaction(async (tx) => {
    const seg = await tx.segmento.findUnique({ where: { id: d.id } });
    if (!seg) throw new ErroNaoEncontrado();
    const uso = await usoDoSegmento(tx, d.id);
    if (uso > 0) throw new ErroDeDominio(`O segmento ${seg.nome} está em uso em ${uso} registro(s) (tabelas ou vendas). Desative em vez de excluir.`);
    await tx.segmento.delete({ where: { id: d.id } });
    await auditar(tx, { sessao: s, acao: 'EXCLUSAO', entidade: 'Segmento', entidadeId: d.id, antes: seg, contexto: { motivo: d.motivo } });
  });
}
