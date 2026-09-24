import { z } from 'zod';
import type { Vendedor } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';
import { diaAnterior, formatarData } from '@/lib/datas';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { documentoValido, somenteDigitos } from '@/lib/documento';
import { normalizarNome } from '@/lib/texto';
import { planejarNovaVigencia } from '@/dominio/vigencia';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { enfileirarApuracao } from '../fila';
import { resolverSnapshot } from '../snapshot';
import { carregarCadastroCasamento } from '../cadastro-casamento';
import { casarVendedor } from '@/dominio/casamento';
import { zBooleano, zData, zDataOpcional, zId, zIdOpcional, zMotivo, zTexto, zTextoOpcional } from './esquemas';

export const esquemaCadastroVendedor = z.object({
  pessoaId: zIdOpcional,
  tipoDocumento: z.enum(['CPF', 'CNPJ']),
  documento: zTexto(20),
  nome: zTexto(150),
  categoriaId: zId,
  equipeId: zId,
  vigenteDe: zData,
});
export const esquemaAlterarCategoria = z.object({ vendedorId: zId, categoriaId: zId, vigenteDe: zData, motivo: zMotivo, promocao: zBooleano });
export const esquemaCorrigirInicio = z.object({ vigenciaId: zId, novoInicio: zData, motivo: zMotivo });
export const esquemaAlterarAlocacao = z.object({ vendedorId: zId, equipeId: zId, vigenteDe: zData, motivo: zMotivo });
export const esquemaRecuperacao = z.object({ vendedorId: zId, inicio: zData, fim: zDataOpcional, motivo: zTextoOpcional(300) });
export const esquemaCancelarRecuperacao = z.object({ id: zId, motivo: zMotivo });
export const esquemaDesligar = z.object({ vendedorId: zId, data: zData, motivo: zMotivo });
export const esquemaReativar = z.object({ vendedorId: zId, motivo: zMotivo });
export const esquemaVincularNome = z.object({ nomeImportado: zTexto(200), vendedorId: zId });

async function exigirVendedor(tx: Tx, id: string): Promise<Vendedor> {
  const v = await tx.vendedor.findUnique({ where: { id } });
  if (!v) throw new ErroNaoEncontrado('Documento de vendedor não encontrado.');
  return v;
}

async function exigirCategoriaParaDocumento(tx: Tx, categoriaId: string, tipo: 'CPF' | 'CNPJ') {
  const c = await tx.categoriaVendedor.findUnique({ where: { id: categoriaId } });
  if (!c || !c.ativo) throw new ErroDeDominio('Categoria inexistente ou desativada.');
  if (!c.documentosAceitos.includes(tipo)) {
    throw new ErroDeDominio(`A categoria ${c.nome} não é aceita para documento ${tipo}. Regra: CPF é Iniciante; CNPJ é Veterano ou Expert.`);
  }
  return c;
}

/**
 * Vendas que esperavam este cadastro (vendedor sem cadastro na importação) passam a ter vendedor:
 * é o recongelamento — resolve pelo cadastro de hoje, mas na data ORIGINAL da venda.
 */
async function vincularVendasPendentes(tx: Tx, s: Sessao, vendedor: Vendedor): Promise<number> {
  const cadastro = await carregarCadastroCasamento(tx);
  const candidatas = await tx.cota.findMany({
    where: { vendedorId: null, OR: [{ vendedorDocImportado: vendedor.documento }, { vendedorNomeImportado: { not: null } }] },
    select: { id: true, dataVenda: true, segmentoTexto: true, flexTexto: true, vendedorNomeImportado: true, vendedorDocImportado: true },
  });
  const vinculadas: string[] = [];
  for (const c of candidatas) {
    const r = casarVendedor(c.vendedorNomeImportado, c.vendedorDocImportado, cadastro);
    if (r.vendedorId !== vendedor.id) continue;
    const snap = await resolverSnapshot(tx, { vendedorId: vendedor.id, dataVenda: c.dataVenda, segmentoTexto: c.segmentoTexto, flexTexto: c.flexTexto });
    await tx.cota.update({ where: { id: c.id }, data: { ...snap, vendedorId: vendedor.id, snapCongeladoEm: new Date(), snapOrigem: 'RECONGELAMENTO' } });
    await enfileirarApuracao(tx, c.id, 'vendedor cadastrado');
    vinculadas.push(c.id);
  }
  if (vinculadas.length > 0) {
    await auditar(tx, {
      sessao: s, acao: 'RECONGELAMENTO', entidade: 'Vendedor', entidadeId: vendedor.id,
      depois: { cotasVinculadas: vinculadas.length }, contexto: { cotas: vinculadas.slice(0, 500), motivo: 'vendas aguardando cadastro do vendedor' },
    });
  }
  return vinculadas.length;
}

/** Cadastra um DOCUMENTO que vende (para pessoa nova ou existente), com categoria e alocação próprias. */
export async function cadastrarVendedor(s: Sessao, d: z.infer<typeof esquemaCadastroVendedor>) {
  exigir(s, 'vendedores', 'editar');
  const doc = somenteDigitos(d.documento);
  if ((d.tipoDocumento === 'CPF' && doc.length !== 11) || (d.tipoDocumento === 'CNPJ' && doc.length !== 14) || !documentoValido(doc)) {
    throw new ErroDeDominio(`${d.tipoDocumento} inválido (confira os dígitos verificadores).`);
  }
  return prisma.$transaction(async (tx) => {
    if (await tx.vendedor.findUnique({ where: { documento: doc } })) throw new ErroDeDominio('Este documento já está cadastrado.');
    await exigirCategoriaParaDocumento(tx, d.categoriaId, d.tipoDocumento);
    const equipe = await tx.equipe.findUnique({ where: { id: d.equipeId } });
    if (!equipe || equipe.status !== 'ATIVO') throw new ErroDeDominio('Equipe inexistente ou inativa.');
    const nome = d.nome.replace(/\s+/g, ' ').toUpperCase();
    let pessoaId = d.pessoaId;
    if (pessoaId) {
      if (!(await tx.pessoa.findUnique({ where: { id: pessoaId } }))) throw new ErroNaoEncontrado('Pessoa não encontrada.');
    } else {
      const p = await tx.pessoa.create({ data: { nome, nomeNormalizado: normalizarNome(nome) } });
      pessoaId = p.id;
    }
    const v = await tx.vendedor.create({
      data: { pessoaId, tipoDocumento: d.tipoDocumento, documento: doc, nome, nomeNormalizado: normalizarNome(nome) },
    });
    await tx.pessoaVinculo.create({ data: { pessoaId, vendedorId: v.id, motivo: d.pessoaId ? 'documento acrescentado a pessoa existente' : 'cadastro', criadoPorId: s.usuarioId } });
    const cat = await tx.vendedorCategoria.create({ data: { vendedorId: v.id, categoriaId: d.categoriaId, vigenteDe: d.vigenteDe, motivo: 'cadastro', criadoPorId: s.usuarioId } });
    const aloc = await tx.vendedorAlocacao.create({ data: { vendedorId: v.id, equipeId: d.equipeId, vigenteDe: d.vigenteDe, motivo: 'cadastro', criadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'Vendedor', entidadeId: v.id, depois: { vendedor: v, categoria: cat, alocacao: aloc } });
    const vinculadas = await vincularVendasPendentes(tx, s, v);
    return { vendedor: v, pessoaId, vinculadas };
  }, { timeout: 60_000 });
}

/** Trava comum: nova vigência não pode tirar a regra de venda já apurada sob a vigência atual. */
async function vendasApuradasDesde(tx: Tx, filtro: { vendedorId: string; campo: 'snapCategoriaId' | 'snapEquipeId'; valor: string; desde: Date; ate?: Date | null }) {
  return tx.cota.findFirst({
    where: {
      snapVendedorId: filtro.vendedorId, [filtro.campo]: filtro.valor,
      dataVenda: { gte: filtro.desde, ...(filtro.ate ? { lte: filtro.ate } : {}) },
      comissoes: { some: { status: { not: 'CANCELADA' } } },
    },
    orderBy: { dataVenda: 'desc' },
    select: { dataVenda: true, grupo: true, cota: true },
  });
}

export async function alterarCategoria(s: Sessao, d: z.infer<typeof esquemaAlterarCategoria>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    const nova = await exigirCategoriaParaDocumento(tx, d.categoriaId, v.tipoDocumento);
    const atual = await tx.vendedorCategoria.findFirst({ where: { vendedorId: v.id }, orderBy: { vigenteDe: 'desc' }, include: { categoria: true } });
    if (atual && atual.categoriaId === d.categoriaId && (atual.vigenteAte === null || atual.vigenteAte >= d.vigenteDe)) {
      throw new ErroDeDominio(`O documento já é ${nova.nome} nesta data.`);
    }
    const plano = planejarNovaVigencia(atual, d.vigenteDe);
    if (atual && plano.encerrarAtualEm) {
      const conflito = await vendasApuradasDesde(tx, { vendedorId: v.id, campo: 'snapCategoriaId', valor: atual.categoriaId, desde: d.vigenteDe });
      if (conflito) {
        throw new ErroDeDominio(
          `A venda do grupo ${conflito.grupo}/${conflito.cota} em ${formatarData(conflito.dataVenda)} já foi apurada como ${atual.categoria.nome}. ` +
          `A nova categoria precisa começar depois de ${formatarData(conflito.dataVenda)} — alterar a categoria não reescreve venda apurada.`,
        );
      }
      await tx.vendedorCategoria.update({ where: { id: atual.id }, data: { vigenteAte: plano.encerrarAtualEm } });
    }
    const criada = await tx.vendedorCategoria.create({
      data: { vendedorId: v.id, categoriaId: d.categoriaId, vigenteDe: d.vigenteDe, promocao: d.promocao, motivo: d.motivo, criadoPorId: s.usuarioId },
    });
    await auditar(tx, {
      sessao: s, acao: d.promocao ? 'PROMOCAO' : 'ALTERACAO_CATEGORIA', entidade: 'Vendedor', entidadeId: v.id,
      antes: atual ? { categoria: atual.categoria.codigo, vigenteDe: atual.vigenteDe, vigenteAte: atual.vigenteAte } : null,
      depois: { categoria: nova.codigo, vigenteDe: criada.vigenteDe, encerradaAnteriorEm: plano.encerrarAtualEm }, contexto: { motivo: d.motivo },
    });
  });
}

/**
 * Corrigir a data de início de uma categoria. Recusado quando atropelaria o período anterior,
 * quando cairia depois do fim do próprio período, ou quando tiraria a regra de uma comissão já apurada.
 */
export async function corrigirInicioCategoria(s: Sessao, d: z.infer<typeof esquemaCorrigirInicio>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const vig = await tx.vendedorCategoria.findUnique({ where: { id: d.vigenciaId }, include: { categoria: true } });
    if (!vig) throw new ErroNaoEncontrado();
    if (d.novoInicio.getTime() === vig.vigenteDe.getTime()) throw new ErroDeDominio('A data informada é a mesma.');
    if (vig.vigenteAte && d.novoInicio > vig.vigenteAte) throw new ErroDeDominio(`O início não pode cair depois do fim do próprio período (${formatarData(vig.vigenteAte)}).`);
    const anterior = await tx.vendedorCategoria.findFirst({
      where: { vendedorId: vig.vendedorId, vigenteDe: { lt: vig.vigenteDe } }, orderBy: { vigenteDe: 'desc' }, include: { categoria: true },
    });
    if (anterior && d.novoInicio <= anterior.vigenteDe) {
      throw new ErroDeDominio(`A nova data atropelaria o período anterior (${anterior.categoria.nome} desde ${formatarData(anterior.vigenteDe)}).`);
    }
    if (d.novoInicio > vig.vigenteDe) {
      // Atrasar o início descobre [início antigo, novo início): vendas apuradas nesse intervalo perderiam a regra.
      const c = await vendasApuradasDesde(tx, { vendedorId: vig.vendedorId, campo: 'snapCategoriaId', valor: vig.categoriaId, desde: vig.vigenteDe, ate: diaAnterior(d.novoInicio) });
      if (c) throw new ErroDeDominio(`Tiraria a regra da venda ${c.grupo}/${c.cota} de ${formatarData(c.dataVenda)}, já apurada como ${vig.categoria.nome}.`);
      await tx.vendedorCategoria.update({ where: { id: vig.id }, data: { vigenteDe: d.novoInicio } });
      if (anterior && anterior.vigenteAte && anterior.vigenteAte.getTime() === diaAnterior(vig.vigenteDe).getTime()) {
        await tx.vendedorCategoria.update({ where: { id: anterior.id }, data: { vigenteAte: diaAnterior(d.novoInicio) } });
      }
    } else {
      // Antecipar o início encurta o anterior: vendas apuradas pelo anterior no intervalo perderiam a regra.
      if (anterior) {
        const c = await vendasApuradasDesde(tx, { vendedorId: vig.vendedorId, campo: 'snapCategoriaId', valor: anterior.categoriaId, desde: d.novoInicio, ate: diaAnterior(vig.vigenteDe) });
        if (c) throw new ErroDeDominio(`Tiraria a regra da venda ${c.grupo}/${c.cota} de ${formatarData(c.dataVenda)}, já apurada como ${anterior.categoria.nome}.`);
        await tx.vendedorCategoria.update({ where: { id: anterior.id }, data: { vigenteAte: diaAnterior(d.novoInicio) } });
      }
      await tx.vendedorCategoria.update({ where: { id: vig.id }, data: { vigenteDe: d.novoInicio } });
    }
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO_CATEGORIA', entidade: 'VendedorCategoria', entidadeId: vig.id,
      antes: { vigenteDe: vig.vigenteDe }, depois: { vigenteDe: d.novoInicio }, contexto: { operacao: 'correção de data de início', motivo: d.motivo },
    });
  });
}

export async function alterarAlocacao(s: Sessao, d: z.infer<typeof esquemaAlterarAlocacao>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    const equipe = await tx.equipe.findUnique({ where: { id: d.equipeId }, include: { gerencia: true } });
    if (!equipe || equipe.status !== 'ATIVO') throw new ErroDeDominio('Equipe inexistente ou inativa.');
    const atual = await tx.vendedorAlocacao.findFirst({ where: { vendedorId: v.id }, orderBy: { vigenteDe: 'desc' }, include: { equipe: true } });
    if (atual && atual.equipeId === d.equipeId && atual.vigenteAte === null) throw new ErroDeDominio('O documento já está nesta equipe.');
    const plano = planejarNovaVigencia(atual, d.vigenteDe);
    if (atual && plano.encerrarAtualEm) {
      const c = await vendasApuradasDesde(tx, { vendedorId: v.id, campo: 'snapEquipeId', valor: atual.equipeId, desde: d.vigenteDe });
      if (c) {
        throw new ErroDeDominio(`A venda ${c.grupo}/${c.cota} de ${formatarData(c.dataVenda)} já foi apurada na equipe ${atual.equipe.nome}. A nova alocação precisa começar depois dessa data.`);
      }
      await tx.vendedorAlocacao.update({ where: { id: atual.id }, data: { vigenteAte: plano.encerrarAtualEm } });
    }
    const nova = await tx.vendedorAlocacao.create({ data: { vendedorId: v.id, equipeId: d.equipeId, vigenteDe: d.vigenteDe, motivo: d.motivo, criadoPorId: s.usuarioId } });
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO_ALOCACAO', entidade: 'Vendedor', entidadeId: v.id,
      antes: atual ? { equipe: atual.equipe.nome, vigenteDe: atual.vigenteDe } : null,
      depois: { equipe: equipe.nome, gerencia: equipe.gerencia.nome, vigenteDe: nova.vigenteDe }, contexto: { motivo: d.motivo },
    });
  });
}

export async function registrarRecuperacao(s: Sessao, d: z.infer<typeof esquemaRecuperacao>) {
  exigir(s, 'vendedores', 'editar');
  if (d.fim && d.fim < d.inicio) throw new ErroDeDominio('O fim não pode ser antes do início.');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    const r = await tx.periodoRecuperacao.create({ data: { vendedorId: v.id, inicio: d.inicio, fim: d.fim, motivo: d.motivo, criadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'RECUPERACAO', entidade: 'PeriodoRecuperacao', entidadeId: r.id, depois: r });
    return r;
  });
}

/** Cancelado é ignorado, não apagado. Vendas já marcadas continuam marcadas (a marcação é permanente no snapshot). */
export async function cancelarRecuperacao(s: Sessao, d: z.infer<typeof esquemaCancelarRecuperacao>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const r = await tx.periodoRecuperacao.findUnique({ where: { id: d.id } });
    if (!r) throw new ErroNaoEncontrado();
    if (r.canceladoEm) throw new ErroDeDominio('Este período já foi cancelado.');
    const depois = await tx.periodoRecuperacao.update({ where: { id: d.id }, data: { canceladoEm: new Date(), canceladoPorId: s.usuarioId, motivoCancelamento: d.motivo } });
    await auditar(tx, { sessao: s, acao: 'RECUPERACAO', entidade: 'PeriodoRecuperacao', entidadeId: r.id, antes: r, depois, contexto: { operacao: 'cancelamento' } });
  });
}

export async function desligarVendedor(s: Sessao, d: z.infer<typeof esquemaDesligar>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    if (v.status === 'DESLIGADO') throw new ErroDeDominio('Este documento já está desligado.');
    const depois = await tx.vendedor.update({ where: { id: v.id }, data: { status: 'DESLIGADO', desligadoEm: d.data } });
    await auditar(tx, { sessao: s, acao: 'DESATIVACAO', entidade: 'Vendedor', entidadeId: v.id, antes: v, depois, contexto: { motivo: d.motivo } });
  });
}

export async function reativarVendedor(s: Sessao, d: z.infer<typeof esquemaReativar>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    if (v.status === 'ATIVO') throw new ErroDeDominio('Este documento já está ativo.');
    const depois = await tx.vendedor.update({ where: { id: v.id }, data: { status: 'ATIVO', desligadoEm: null } });
    await auditar(tx, { sessao: s, acao: 'REATIVACAO', entidade: 'Vendedor', entidadeId: v.id, antes: v, depois, contexto: { motivo: d.motivo } });
  });
}

/**
 * Decisão humana registrada: o nome como a administradora escreve ("VERENA S OLIVEIRA") é este documento.
 * Cria o apelido e vincula as vendas que aguardavam.
 */
export async function vincularNomeImportado(s: Sessao, d: z.infer<typeof esquemaVincularNome>) {
  exigir(s, 'vendedores', 'editar');
  const n = normalizarNome(d.nomeImportado);
  if (n === '') throw new ErroDeDominio('Nome vazio.');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    if (v.nomeNormalizado === n) throw new ErroDeDominio('Este já é o nome do cadastro.');
    const outro = await tx.vendedor.findFirst({ where: { nomeNormalizado: n } });
    if (outro) throw new ErroDeDominio('Este nome já é o nome de outro documento cadastrado.');
    const alias = await tx.vendedorAlias.create({ data: { vendedorId: v.id, nomeNormalizado: n, criadoPorId: s.usuarioId } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'VendedorAlias', entidadeId: alias.id, depois: { vendedor: v.nome, nomeImportado: d.nomeImportado } });
    const vinculadas = await vincularVendasPendentes(tx, s, v);
    return { vinculadas };
  }, { timeout: 60_000 });
}
