import { z } from 'zod';
import type { Vendedor } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';
import { diaAnterior, formatarData } from '@/lib/datas';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { documentoValido, somenteDigitos } from '@/lib/documento';
import { normalizarNome } from '@/lib/texto';
import { planejarNaLinhaDoTempo } from '@/dominio/vigencia';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { enfileirarApuracao } from '../fila';
import { documentosDaPessoa, expertNaData, resolverSnapshot } from '../snapshot';
import { carregarCadastroCasamento } from '../cadastro-casamento';
import { recongelarUma } from './cotas';
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
export const esquemaMoverDocumento = z.object({ vendedorId: zId, pessoaDestinoId: zId, motivo: zMotivo });
export const esquemaCorrigirEquipe = z.object({ alocacaoId: zId, equipeId: zId, motivo: zMotivo });
export const esquemaCorrigirNome = z.object({ vendedorId: zId, nome: zTexto(200), tambemPessoa: zBooleano, motivo: zMotivo });

async function exigirVendedor(tx: Tx, id: string): Promise<Vendedor> {
  const v = await tx.vendedor.findUnique({ where: { id } });
  if (!v) throw new ErroNaoEncontrado('Documento de vendedor não encontrado.');
  return v;
}

async function exigirCategoriaParaDocumento(tx: Tx, categoriaId: string, tipo: 'CPF' | 'CNPJ') {
  const c = await tx.categoriaVendedor.findUnique({ where: { id: categoriaId } });
  if (!c || !c.ativo) throw new ErroDeDominio('Categoria inexistente ou desativada.');
  if (!c.documentosAceitos.includes(tipo)) {
    throw new ErroDeDominio(`A categoria ${c.nome} está configurada para aceitar só ${c.documentosAceitos.join(' ou ') || 'nenhum documento'}. Para cadastrar com ${tipo}, edite a categoria em Configurações › Categorias e marque ${tipo} em “Aceita vendedor com”.`);
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
    await reavaliarExpertDaPessoa(tx, s, pessoaId, 'documento cadastrado');
    return { vendedor: v, pessoaId, vinculadas };
  }, { timeout: 60_000 });
}

/**
 * Depois de mudar a categoria (ou a data dela), o cadastro ou o desligamento de um documento: refaz, nas
 * vendas da pessoa, só a informação de qual CNPJ Expert recebe sobre elas (pela data de cada venda) e
 * manda recalcular as que mudaram. A linha do Expert é paga pela administradora: não mexe em folha.
 */
export async function reavaliarExpertDaPessoa(tx: Tx, s: Sessao, pessoaId: string, motivo: string): Promise<number> {
  const cotas = await tx.cota.findMany({
    where: { snapVendedor: { pessoaId }, snapCategoriaId: { not: null } },
    select: { id: true, dataVenda: true, snapVendedorId: true, snapExpertVendedorId: true, snapExpertCategoriaId: true, snapExpertPagaPelaWr: true, snapCategoria: { select: { recebeSobreOutrosDocumentos: true } } },
  });
  const documentos = await documentosDaPessoa(tx, pessoaId);
  let alteradas = 0;
  for (const c of cotas) {
    const novo = expertNaData(documentos, c.snapVendedorId as string, c.dataVenda, c.snapCategoria);
    if (novo.snapExpertVendedorId === c.snapExpertVendedorId && novo.snapExpertCategoriaId === c.snapExpertCategoriaId && novo.snapExpertPagaPelaWr === c.snapExpertPagaPelaWr) continue;
    await tx.cota.update({ where: { id: c.id }, data: novo });
    await enfileirarApuracao(tx, c.id, motivo);
    alteradas++;
  }
  if (alteradas > 0) {
    await auditar(tx, { sessao: s, acao: 'RECONGELAMENTO', entidade: 'Pessoa', entidadeId: pessoaId, depois: { vendasAtualizadas: alteradas }, contexto: { operacao: 'documento Expert das vendas', motivo } });
  }
  return alteradas;
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
    const lista = await tx.vendedorCategoria.findMany({ where: { vendedorId: v.id }, include: { categoria: true } });
    const plano = planejarNaLinhaDoTempo(lista, d.vigenteDe);
    if (plano.mesma) throw new ErroDeDominio(`Já existe a categoria ${plano.mesma.categoria.nome} começando em ${formatarData(d.vigenteDe)}. Para trocar, use "Corrigir" no histórico de categoria ou escolha outra data.`);
    const atual = plano.anterior;
    if (atual && atual.categoriaId === d.categoriaId) throw new ErroDeDominio(`O documento já é ${nova.nome} nesta data.`);
    if (plano.seguinte && plano.seguinte.categoriaId === d.categoriaId) {
      // Mesma categoria logo depois: é só antecipar o início dela (o intervalo não tinha categoria).
      const depois = await tx.vendedorCategoria.update({ where: { id: plano.seguinte.id }, data: { vigenteDe: d.vigenteDe } });
      await auditar(tx, { sessao: s, acao: 'ALTERACAO_CATEGORIA', entidade: 'VendedorCategoria', entidadeId: depois.id, antes: { vigenteDe: plano.seguinte.vigenteDe }, depois: { vigenteDe: d.vigenteDe }, contexto: { operacao: 'antecipação do início', motivo: d.motivo } });
      await reavaliarExpertDaPessoa(tx, s, v.pessoaId, 'categoria alterada');
      return;
    }
    if (atual && plano.encerrarAnteriorEm) {
      const conflito = await vendasApuradasDesde(tx, { vendedorId: v.id, campo: 'snapCategoriaId', valor: atual.categoriaId, desde: d.vigenteDe });
      if (conflito) {
        throw new ErroDeDominio(
          `A venda do grupo ${conflito.grupo}/${conflito.cota} em ${formatarData(conflito.dataVenda)} já foi calculada como ${atual.categoria.nome}. ` +
          `Para não mudar o que já foi calculado, a nova categoria precisa começar depois de ${formatarData(conflito.dataVenda)}.`,
        );
      }
      await tx.vendedorCategoria.update({ where: { id: atual.id }, data: { vigenteAte: plano.encerrarAnteriorEm } });
    }
    const criada = await tx.vendedorCategoria.create({
      data: { vendedorId: v.id, categoriaId: d.categoriaId, vigenteDe: d.vigenteDe, vigenteAte: plano.vigenteAte, promocao: d.promocao, motivo: d.motivo, criadoPorId: s.usuarioId },
    });
    await auditar(tx, {
      sessao: s, acao: d.promocao ? 'PROMOCAO' : 'ALTERACAO_CATEGORIA', entidade: 'Vendedor', entidadeId: v.id,
      antes: atual ? { categoria: atual.categoria.codigo, vigenteDe: atual.vigenteDe, vigenteAte: atual.vigenteAte } : null,
      depois: { categoria: nova.codigo, vigenteDe: criada.vigenteDe, vigenteAte: criada.vigenteAte, encerradaAnteriorEm: plano.encerrarAnteriorEm }, contexto: { motivo: d.motivo },
    });
    await reavaliarExpertDaPessoa(tx, s, v.pessoaId, 'categoria alterada');
  }, { timeout: 60_000 });
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
      throw new ErroDeDominio(`A nova data passaria por cima do período anterior (${anterior.categoria.nome} desde ${formatarData(anterior.vigenteDe)}).`);
    }
    if (d.novoInicio > vig.vigenteDe) {
      // Atrasar o início descobre [início antigo, novo início): vendas apuradas nesse intervalo perderiam a regra.
      const c = await vendasApuradasDesde(tx, { vendedorId: vig.vendedorId, campo: 'snapCategoriaId', valor: vig.categoriaId, desde: vig.vigenteDe, ate: diaAnterior(d.novoInicio) });
      if (c) throw new ErroDeDominio(`Tiraria a regra da venda ${c.grupo}/${c.cota} de ${formatarData(c.dataVenda)}, já calculada como ${vig.categoria.nome}.`);
      await tx.vendedorCategoria.update({ where: { id: vig.id }, data: { vigenteDe: d.novoInicio } });
      if (anterior && anterior.vigenteAte && anterior.vigenteAte.getTime() === diaAnterior(vig.vigenteDe).getTime()) {
        await tx.vendedorCategoria.update({ where: { id: anterior.id }, data: { vigenteAte: diaAnterior(d.novoInicio) } });
      }
    } else {
      // Antecipar o início encurta o anterior: vendas apuradas pelo anterior no intervalo perderiam a regra.
      if (anterior) {
        const c = await vendasApuradasDesde(tx, { vendedorId: vig.vendedorId, campo: 'snapCategoriaId', valor: anterior.categoriaId, desde: d.novoInicio, ate: diaAnterior(vig.vigenteDe) });
        if (c) throw new ErroDeDominio(`Tiraria a regra da venda ${c.grupo}/${c.cota} de ${formatarData(c.dataVenda)}, já calculada como ${anterior.categoria.nome}.`);
        await tx.vendedorCategoria.update({ where: { id: anterior.id }, data: { vigenteAte: diaAnterior(d.novoInicio) } });
      }
      await tx.vendedorCategoria.update({ where: { id: vig.id }, data: { vigenteDe: d.novoInicio } });
    }
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO_CATEGORIA', entidade: 'VendedorCategoria', entidadeId: vig.id,
      antes: { vigenteDe: vig.vigenteDe }, depois: { vigenteDe: d.novoInicio }, contexto: { operacao: 'correção de data de início', motivo: d.motivo },
    });
    const dono = await tx.vendedor.findUniqueOrThrow({ where: { id: vig.vendedorId }, select: { pessoaId: true } });
    await reavaliarExpertDaPessoa(tx, s, dono.pessoaId, 'data da categoria corrigida');
  }, { timeout: 60_000 });
}

export async function alterarAlocacao(s: Sessao, d: z.infer<typeof esquemaAlterarAlocacao>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    const equipe = await tx.equipe.findUnique({ where: { id: d.equipeId }, include: { gerencia: true } });
    if (!equipe || equipe.status !== 'ATIVO') throw new ErroDeDominio('Equipe inexistente ou inativa.');
    const lista = await tx.vendedorAlocacao.findMany({ where: { vendedorId: v.id }, include: { equipe: true } });
    const plano = planejarNaLinhaDoTempo(lista, d.vigenteDe);
    if (plano.mesma) throw new ErroDeDominio(`Já existe a equipe ${plano.mesma.equipe.nome} começando em ${formatarData(d.vigenteDe)}. Escolha outra data.`);
    const atual = plano.anterior;
    if (atual && atual.equipeId === d.equipeId) throw new ErroDeDominio('O documento já está nesta equipe nesta data.');
    if (plano.seguinte && plano.seguinte.equipeId === d.equipeId) {
      const depois = await tx.vendedorAlocacao.update({ where: { id: plano.seguinte.id }, data: { vigenteDe: d.vigenteDe } });
      await auditar(tx, { sessao: s, acao: 'ALTERACAO_ALOCACAO', entidade: 'VendedorAlocacao', entidadeId: depois.id, antes: { vigenteDe: plano.seguinte.vigenteDe }, depois: { vigenteDe: d.vigenteDe }, contexto: { operacao: 'antecipação do início', motivo: d.motivo } });
      return;
    }
    if (atual && plano.encerrarAnteriorEm) {
      const c = await vendasApuradasDesde(tx, { vendedorId: v.id, campo: 'snapEquipeId', valor: atual.equipeId, desde: d.vigenteDe });
      if (c) {
        throw new ErroDeDominio(`A venda ${c.grupo}/${c.cota} de ${formatarData(c.dataVenda)} já foi calculada na equipe ${atual.equipe.nome}. Para não mudar o que já foi calculado, a nova equipe precisa começar depois dessa data. Se o cadastro estava errado desde o início, use “Corrigir” no histórico de equipe.`);
      }
      await tx.vendedorAlocacao.update({ where: { id: atual.id }, data: { vigenteAte: plano.encerrarAnteriorEm } });
    }
    const nova = await tx.vendedorAlocacao.create({ data: { vendedorId: v.id, equipeId: d.equipeId, vigenteDe: d.vigenteDe, vigenteAte: plano.vigenteAte, motivo: d.motivo, criadoPorId: s.usuarioId } });
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO_ALOCACAO', entidade: 'Vendedor', entidadeId: v.id,
      antes: atual ? { equipe: atual.equipe.nome, vigenteDe: atual.vigenteDe } : null,
      depois: { equipe: equipe.nome, gerencia: equipe.gerencia.nome, vigenteDe: nova.vigenteDe }, contexto: { motivo: d.motivo },
    });
  });
}

/**
 * Correção de cadastro (não é mudança de equipe): o período estava com a equipe errada desde o início. Troca a
 * equipe do período e recongela as vendas dele — supervisor e gerente passam a ser os da equipe certa na data
 * de cada venda. O que já estava em folha fechada não muda: a diferença vira ajuste na próxima folha.
 */
export async function corrigirEquipe(s: Sessao, d: z.infer<typeof esquemaCorrigirEquipe>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const aloc = await tx.vendedorAlocacao.findUnique({ where: { id: d.alocacaoId }, include: { equipe: { include: { gerencia: true } } } });
    if (!aloc) throw new ErroNaoEncontrado();
    if (aloc.equipeId === d.equipeId) throw new ErroDeDominio('O período já está nesta equipe.');
    const equipe = await tx.equipe.findUnique({ where: { id: d.equipeId }, include: { gerencia: true } });
    if (!equipe || equipe.status !== 'ATIVO') throw new ErroDeDominio('Equipe inexistente ou inativa.');
    await tx.vendedorAlocacao.update({ where: { id: aloc.id }, data: { equipeId: d.equipeId, motivo: `correção: ${d.motivo}` } });
    const cotas = await tx.cota.findMany({
      where: { snapVendedorId: aloc.vendedorId, dataVenda: { gte: aloc.vigenteDe, ...(aloc.vigenteAte ? { lte: aloc.vigenteAte } : {}) } },
      select: { id: true },
    });
    const cadastro = await carregarCadastroCasamento(tx);
    let recalculadas = 0;
    for (const c of cotas) if (await recongelarUma(tx, s, c.id, `equipe corrigida: ${d.motivo}`, cadastro)) recalculadas++;
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO_ALOCACAO', entidade: 'VendedorAlocacao', entidadeId: aloc.id,
      antes: { equipe: aloc.equipe.nome, gerencia: aloc.equipe.gerencia.nome }, depois: { equipe: equipe.nome, gerencia: equipe.gerencia.nome },
      contexto: { operacao: 'correção de equipe do período', motivo: d.motivo, vendasRecalculadas: recalculadas },
    });
    return { vendas: cotas.length, recalculadas };
  }, { timeout: 120_000 });
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
    await reavaliarExpertDaPessoa(tx, s, v.pessoaId, 'documento desligado');
    await recalcularVendasDoDocumento(tx, v.id, 'documento desligado: não recebe mais comissão nem paga estorno');
  }, { timeout: 60_000 });
}

export async function reativarVendedor(s: Sessao, d: z.infer<typeof esquemaReativar>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    if (v.status === 'ATIVO') throw new ErroDeDominio('Este documento já está ativo.');
    const depois = await tx.vendedor.update({ where: { id: v.id }, data: { status: 'ATIVO', desligadoEm: null } });
    await auditar(tx, { sessao: s, acao: 'REATIVACAO', entidade: 'Vendedor', entidadeId: v.id, antes: v, depois, contexto: { motivo: d.motivo } });
    await reavaliarExpertDaPessoa(tx, s, v.pessoaId, 'documento reativado');
    await recalcularVendasDoDocumento(tx, v.id, 'documento reativado');
  }, { timeout: 60_000 });
}

/** Manda recalcular as vendas em que o documento recebe (como vendedor ou como Expert). */
async function recalcularVendasDoDocumento(tx: Tx, vendedorId: string, motivo: string) {
  const cotas = await tx.cota.findMany({ where: { OR: [{ snapVendedorId: vendedorId }, { snapExpertVendedorId: vendedorId }] }, select: { id: true } });
  for (const c of cotas) await enfileirarApuracao(tx, c.id, motivo);
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

/**
 * Corrige um CPF/CNPJ cadastrado na pessoa errada (ex.: CNPJ criado como pessoa nova em vez de junto do CPF
 * do vendedor): o documento passa para a outra pessoa, com todo o histórico (categoria, equipe, vendas).
 * As vendas desse documento são recalculadas para o novo titular (o que já estiver em folha fechada vira
 * ajuste) e a regra do Expert é reavaliada nas duas pessoas. Fica registrado.
 */
export async function moverDocumento(s: Sessao, d: z.infer<typeof esquemaMoverDocumento>) {
  exigir(s, 'vendedores', 'editar');
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    // Já está lá (ex.: o primeiro clique já moveu e a tela não tinha atualizado): nada a fazer, sem erro.
    if (v.pessoaId === d.pessoaDestinoId) return { pessoaDestinoId: v.pessoaId, vendas: 0, origemFicouVazia: false, jaEstava: true };
    const destino = await tx.pessoa.findUnique({ where: { id: d.pessoaDestinoId } });
    if (!destino) throw new ErroNaoEncontrado('Pessoa de destino não encontrada.');
    const origemId = v.pessoaId;
    await tx.vendedor.update({ where: { id: v.id }, data: { pessoaId: destino.id } });
    await tx.pessoaVinculo.create({ data: { pessoaId: destino.id, vendedorId: v.id, motivo: `documento movido de outra pessoa: ${d.motivo}`, criadoPorId: s.usuarioId } });
    const cotas = await tx.cota.findMany({ where: { snapVendedorId: v.id }, select: { id: true } });
    for (const c of cotas) await enfileirarApuracao(tx, c.id, 'documento movido para outra pessoa');
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO', entidade: 'Vendedor', entidadeId: v.id,
      antes: { pessoaId: origemId }, depois: { pessoaId: destino.id }, contexto: { operacao: 'mover documento para outra pessoa', motivo: d.motivo, vendas: cotas.length },
    });
    await reavaliarExpertDaPessoa(tx, s, origemId, 'documento movido para outra pessoa');
    await reavaliarExpertDaPessoa(tx, s, destino.id, 'documento movido de outra pessoa');
    const restantes = await tx.vendedor.count({ where: { pessoaId: origemId } });
    return { pessoaDestinoId: destino.id, vendas: cotas.length, origemFicouVazia: restantes === 0, jaEstava: false };
  }, { timeout: 60_000 });
}

/**
 * Corrige o nome de um CPF/CNPJ cadastrado errado (ex.: o CPF da Keila cadastrado com o nome do Lucas).
 * Pode corrigir junto o nome da pessoa (o que aparece nas listas, extrato e folha). Fica registrado.
 * Comissões já calculadas guardam o nome da época na memória de cálculo; o titular (a pessoa) é o mesmo.
 */
export async function corrigirNome(s: Sessao, d: z.infer<typeof esquemaCorrigirNome>) {
  exigir(s, 'vendedores', 'editar');
  const nome = d.nome.replace(/\s+/g, ' ').trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    const v = await exigirVendedor(tx, d.vendedorId);
    const pessoa = await tx.pessoa.findUniqueOrThrow({ where: { id: v.pessoaId } });
    if (v.nome === nome && (!d.tambemPessoa || pessoa.nome === nome)) throw new ErroDeDominio('O nome já é este.');
    await tx.vendedor.update({ where: { id: v.id }, data: { nome, nomeNormalizado: normalizarNome(nome) } });
    if (d.tambemPessoa) await tx.pessoa.update({ where: { id: pessoa.id }, data: { nome, nomeNormalizado: normalizarNome(nome) } });
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO', entidade: 'Vendedor', entidadeId: v.id,
      antes: { nome: v.nome, nomePessoa: pessoa.nome }, depois: { nome, nomePessoa: d.tambemPessoa ? nome : pessoa.nome },
      contexto: { operacao: 'corrigir nome', motivo: d.motivo },
    });
    return { pessoaId: pessoa.id };
  });
}
