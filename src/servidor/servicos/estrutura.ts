import { z } from 'zod';
import { prisma } from '@/lib/db';
import { formatarData } from '@/lib/datas';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { normalizarNome } from '@/lib/texto';
import { somenteDigitos, cnpjValido } from '@/lib/documento';
import { planejarNaLinhaDoTempo } from '@/dominio/vigencia';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { zData, zId, zIdOpcional, zTexto, zTextoOpcional } from './esquemas';

export const esquemaGerencia = z.object({ nome: zTexto(80) });
export const esquemaRenomear = z.object({ id: zId, nome: zTexto(80) });
export const esquemaStatusUnidade = z.object({ id: zId, status: z.enum(['ATIVO', 'INATIVO']) });
export const esquemaId = z.object({ id: zId });
export const esquemaEquipe = z.object({ nome: zTexto(80), gerenciaId: zId });
export const esquemaResponsavel = z.object({
  papel: z.enum(['GERENTE', 'SUPERVISOR']),
  unidadeId: zId,
  pessoaId: zIdOpcional,
  novoNome: zTextoOpcional(120),
  vigenteDe: zData,
});
export const esquemaEncerrarResponsavel = z.object({ id: zId, vigenteAte: zData });
export const esquemaAdministradora = z.object({ codigo: zTexto(20), nome: zTexto(120), cnpj: zTextoOpcional(20) });

export async function criarGerencia(s: Sessao, d: z.infer<typeof esquemaGerencia>) {
  exigir(s, 'gerencias', 'editar');
  return prisma.$transaction(async (tx) => {
    const g = await tx.gerencia.create({ data: { nome: d.nome.toUpperCase() } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'Gerencia', entidadeId: g.id, depois: g });
    return g;
  });
}

export async function renomearGerencia(s: Sessao, d: z.infer<typeof esquemaRenomear>) {
  exigir(s, 'gerencias', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.gerencia.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const g = await tx.gerencia.update({ where: { id: d.id }, data: { nome: d.nome.toUpperCase() } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'Gerencia', entidadeId: g.id, antes, depois: g });
  });
}

export async function alterarStatusGerencia(s: Sessao, d: z.infer<typeof esquemaStatusUnidade>) {
  exigir(s, 'gerencias', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.gerencia.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    if (d.status === 'INATIVO' && (await tx.equipe.count({ where: { gerenciaId: d.id, status: 'ATIVO' } })) > 0) {
      throw new ErroDeDominio('Desative as equipes desta gerência antes de desativá-la.');
    }
    const g = await tx.gerencia.update({ where: { id: d.id }, data: { status: d.status } });
    await auditar(tx, { sessao: s, acao: d.status === 'INATIVO' ? 'DESATIVACAO' : 'REATIVACAO', entidade: 'Gerencia', entidadeId: g.id, antes, depois: g });
  });
}

/** Quem já explica um pagamento não se apaga — só unidade sem nenhum vínculo pode ser excluída. */
export async function excluirGerencia(s: Sessao, d: z.infer<typeof esquemaId>) {
  exigir(s, 'gerencias', 'editar');
  return prisma.$transaction(async (tx) => {
    const g = await tx.gerencia.findUnique({
      where: { id: d.id },
      include: { _count: { select: { equipes: true, responsaveis: true, usuarios: true, cotasSnapshot: true, bonus: true } } },
    });
    if (!g) throw new ErroNaoEncontrado();
    const usos = Object.values(g._count).reduce((a, b) => a + b, 0);
    if (usos > 0) throw new ErroDeDominio('Esta gerência tem histórico (equipes, responsáveis, vendas ou acessos). Desative em vez de excluir.');
    await tx.gerencia.delete({ where: { id: d.id } });
    await auditar(tx, { sessao: s, acao: 'EXCLUSAO', entidade: 'Gerencia', entidadeId: d.id, antes: g });
  });
}

export async function criarEquipe(s: Sessao, d: z.infer<typeof esquemaEquipe>) {
  exigir(s, 'equipes', 'editar');
  return prisma.$transaction(async (tx) => {
    const g = await tx.gerencia.findUnique({ where: { id: d.gerenciaId } });
    if (!g || g.status !== 'ATIVO') throw new ErroDeDominio('Gerência inexistente ou inativa.');
    const e = await tx.equipe.create({ data: { nome: d.nome.toUpperCase(), gerenciaId: d.gerenciaId } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'Equipe', entidadeId: e.id, depois: e });
    return e;
  });
}

export async function renomearEquipe(s: Sessao, d: z.infer<typeof esquemaRenomear>) {
  exigir(s, 'equipes', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.equipe.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    const e = await tx.equipe.update({ where: { id: d.id }, data: { nome: d.nome.toUpperCase() } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'Equipe', entidadeId: e.id, antes, depois: e });
  });
}

export async function alterarStatusEquipe(s: Sessao, d: z.infer<typeof esquemaStatusUnidade>) {
  exigir(s, 'equipes', 'editar');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.equipe.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    if (d.status === 'INATIVO') {
      const alocados = await tx.vendedorAlocacao.count({ where: { equipeId: d.id, vigenteAte: null, vendedor: { status: 'ATIVO' } } });
      if (alocados > 0) throw new ErroDeDominio(`Há ${alocados} vendedor(es) ativo(s) alocado(s) nesta equipe. Transfira-os antes de desativar.`);
    }
    const e = await tx.equipe.update({ where: { id: d.id }, data: { status: d.status } });
    await auditar(tx, { sessao: s, acao: d.status === 'INATIVO' ? 'DESATIVACAO' : 'REATIVACAO', entidade: 'Equipe', entidadeId: e.id, antes, depois: e });
  });
}

export async function excluirEquipe(s: Sessao, d: z.infer<typeof esquemaId>) {
  exigir(s, 'equipes', 'editar');
  return prisma.$transaction(async (tx) => {
    const e = await tx.equipe.findUnique({
      where: { id: d.id },
      include: { _count: { select: { alocacoes: true, responsaveis: true, usuarios: true, cotasSnapshot: true, bonus: true } } },
    });
    if (!e) throw new ErroNaoEncontrado();
    const usos = Object.values(e._count).reduce((a, b) => a + b, 0);
    if (usos > 0) throw new ErroDeDominio('Esta equipe tem histórico (vendedores, responsáveis, vendas ou acessos). Desative em vez de excluir.');
    await tx.equipe.delete({ where: { id: d.id } });
    await auditar(tx, { sessao: s, acao: 'EXCLUSAO', entidade: 'Equipe', entidadeId: d.id, antes: e });
  });
}

/**
 * Define o responsável de uma unidade com vigência. Supervisor responde por equipe; gerente, por gerência
 * (trava também no banco). O anterior é encerrado no dia anterior — nunca sobrescrito.
 */
export async function definirResponsavel(s: Sessao, d: z.infer<typeof esquemaResponsavel>) {
  exigir(s, d.papel === 'GERENTE' ? 'gerencias' : 'equipes', 'editar');
  if (!d.pessoaId && !d.novoNome) throw new ErroDeDominio('Escolha uma pessoa ou informe o nome de uma nova.');
  return prisma.$transaction(async (tx) => {
    const unidade = d.papel === 'GERENTE'
      ? await tx.gerencia.findUnique({ where: { id: d.unidadeId } })
      : await tx.equipe.findUnique({ where: { id: d.unidadeId } });
    if (!unidade || unidade.status !== 'ATIVO') throw new ErroDeDominio('Unidade inexistente ou inativa.');
    let pessoaId = d.pessoaId;
    if (!pessoaId) {
      const p = await tx.pessoa.create({ data: { nome: (d.novoNome as string).toUpperCase(), nomeNormalizado: normalizarNome(d.novoNome) } });
      await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'Pessoa', entidadeId: p.id, depois: p });
      pessoaId = p.id;
    } else if (!(await tx.pessoa.findUnique({ where: { id: pessoaId } }))) {
      throw new ErroNaoEncontrado('Pessoa não encontrada.');
    }
    const filtro = d.papel === 'GERENTE' ? { papel: 'GERENTE' as const, gerenciaId: d.unidadeId } : { papel: 'SUPERVISOR' as const, equipeId: d.unidadeId };
    const lista = await tx.responsavelUnidade.findMany({ where: filtro });
    const plano = planejarNaLinhaDoTempo(lista, d.vigenteDe);
    if (plano.mesma) throw new ErroDeDominio(`Já existe responsável começando em ${formatarData(d.vigenteDe)}. Escolha outra data.`);
    const atual = plano.anterior;
    if (atual && plano.encerrarAnteriorEm) {
      await tx.responsavelUnidade.update({ where: { id: atual.id }, data: { vigenteAte: plano.encerrarAnteriorEm } });
    }
    const novo = await tx.responsavelUnidade.create({
      data: { ...filtro, pessoaId, vigenteDe: d.vigenteDe, vigenteAte: plano.vigenteAte, criadoPorId: s.usuarioId },
    });
    await auditar(tx, {
      sessao: s, acao: 'ALTERACAO', entidade: 'ResponsavelUnidade', entidadeId: novo.id,
      antes: atual ? { ...atual, vigenteAte: plano.encerrarAnteriorEm } : null, depois: novo,
      contexto: { observacao: 'Vendas já calculadas mantêm o responsável da época; as que estavam sem responsável são resolvidas em Processar pendências.' },
    });
    return novo;
  });
}

export async function encerrarResponsavel(s: Sessao, d: z.infer<typeof esquemaEncerrarResponsavel>) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.responsavelUnidade.findUnique({ where: { id: d.id } });
    if (!r) throw new ErroNaoEncontrado();
    exigir(s, r.papel === 'GERENTE' ? 'gerencias' : 'equipes', 'editar');
    if (r.vigenteAte) throw new ErroDeDominio(`Esta responsabilidade já foi encerrada em ${formatarData(r.vigenteAte)}.`);
    if (d.vigenteAte < r.vigenteDe) throw new ErroDeDominio('O fim não pode ser antes do início.');
    const depois = await tx.responsavelUnidade.update({ where: { id: d.id }, data: { vigenteAte: d.vigenteAte } });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'ResponsavelUnidade', entidadeId: d.id, antes: r, depois });
  });
}

export async function cadastrarAdministradora(s: Sessao, d: z.infer<typeof esquemaAdministradora>) {
  exigir(s, 'gerencias', 'editar');
  const cnpj = d.cnpj ? somenteDigitos(d.cnpj) : null;
  if (cnpj && !cnpjValido(cnpj)) throw new ErroDeDominio('CNPJ inválido.');
  return prisma.$transaction(async (tx) => {
    const a = await tx.administradora.create({ data: { codigo: d.codigo.toUpperCase(), nome: d.nome, cnpj } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'Administradora', entidadeId: a.id, depois: a });
    return a;
  });
}
