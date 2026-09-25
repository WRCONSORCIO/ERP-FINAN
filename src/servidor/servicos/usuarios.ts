import { z } from 'zod';
import { prisma, type Tx } from '@/lib/db';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { conferirSenha, gerarHash, gerarSenhaProvisoria, validarSenha } from '@/lib/senha';
import { PERFIS } from '@/lib/permissoes';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { zBooleano, zId, zIdOpcional, zTexto } from './esquemas';

export const esquemaUsuario = z.object({
  nome: zTexto(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  perfil: z.enum(PERFIS),
  gerenciaId: zIdOpcional,
  equipeId: zIdOpcional,
});
export const esquemaAlterarUsuario = esquemaUsuario.omit({ email: true }).extend({ id: zId });
export const esquemaAtivoUsuario = z.object({ id: zId, ativo: zBooleano });
export const esquemaTrocarSenha = z.object({ id: zId });
export const esquemaMinhaSenha = z.object({ atual: z.string().min(1, 'Obrigatório'), nova: z.string(), confirmacao: z.string() });

function escopoCoerente(d: { perfil: string; gerenciaId: string | null; equipeId: string | null }) {
  return {
    gerenciaId: d.perfil === 'GERENTE' ? d.gerenciaId : null,
    equipeId: d.perfil === 'SUPERVISOR' ? d.equipeId : null,
  };
}

async function contarAdminsAtivos(tx: Tx) {
  return tx.usuario.count({ where: { perfil: 'ADMINISTRADOR', ativo: true } });
}

/** Cria o acesso e devolve a senha provisória — exibida UMA única vez, entregue em mãos. */
export async function criarUsuario(s: Sessao, d: z.infer<typeof esquemaUsuario>) {
  exigir(s, 'usuarios', 'tudo');
  const escopo = escopoCoerente(d);
  if (d.perfil === 'GERENTE' && !escopo.gerenciaId) throw new ErroDeDominio('Escolha a gerência deste gerente — sem ela, ele não vê nada.');
  if (d.perfil === 'SUPERVISOR' && !escopo.equipeId) throw new ErroDeDominio('Escolha a equipe deste supervisor — sem ela, ele não vê nada.');
  const senha = gerarSenhaProvisoria();
  const senhaHash = await gerarHash(senha);
  return prisma.$transaction(async (tx) => {
    if (await tx.usuario.findUnique({ where: { email: d.email } })) throw new ErroDeDominio('Já existe acesso com este e-mail.');
    const u = await tx.usuario.create({ data: { nome: d.nome, email: d.email, perfil: d.perfil, ...escopo, senhaHash } });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'Usuario', entidadeId: u.id, depois: u });
    return { usuarioId: u.id, senhaProvisoria: senha };
  });
}

/** Trava: nunca rebaixar o último administrador ativo. Mudar perfil/escopo derruba as sessões abertas. */
export async function alterarUsuario(s: Sessao, d: z.infer<typeof esquemaAlterarUsuario>) {
  exigir(s, 'usuarios', 'tudo');
  const escopo = escopoCoerente(d);
  return prisma.$transaction(async (tx) => {
    const antes = await tx.usuario.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    if (antes.perfil === 'ADMINISTRADOR' && antes.ativo && d.perfil !== 'ADMINISTRADOR' && (await contarAdminsAtivos(tx)) <= 1) {
      throw new ErroDeDominio('Este é o último administrador ativo: o sistema recusa rebaixá-lo.');
    }
    const mudouAcesso = antes.perfil !== d.perfil || antes.gerenciaId !== escopo.gerenciaId || antes.equipeId !== escopo.equipeId;
    const depois = await tx.usuario.update({
      where: { id: d.id },
      data: { nome: d.nome, perfil: d.perfil, ...escopo, ...(mudouAcesso ? { versaoSessao: { increment: 1 } } : {}) },
    });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'Usuario', entidadeId: d.id, antes, depois });
  });
}

export async function alterarAtivoUsuario(s: Sessao, d: z.infer<typeof esquemaAtivoUsuario>) {
  exigir(s, 'usuarios', 'tudo');
  return prisma.$transaction(async (tx) => {
    const antes = await tx.usuario.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado();
    if (!d.ativo && antes.perfil === 'ADMINISTRADOR' && antes.ativo && (await contarAdminsAtivos(tx)) <= 1) {
      throw new ErroDeDominio('Este é o último administrador ativo: o sistema recusa desativá-lo.');
    }
    const depois = await tx.usuario.update({ where: { id: d.id }, data: { ativo: d.ativo, versaoSessao: { increment: 1 } } });
    await auditar(tx, { sessao: s, acao: d.ativo ? 'REATIVACAO' : 'DESATIVACAO', entidade: 'Usuario', entidadeId: d.id, antes, depois });
  });
}

/** Sem recuperação automática: o administrador gera uma senha nova e a entrega em mãos. */
export async function redefinirSenha(s: Sessao, d: z.infer<typeof esquemaTrocarSenha>) {
  exigir(s, 'usuarios', 'tudo');
  const senha = gerarSenhaProvisoria();
  const senhaHash = await gerarHash(senha);
  return prisma.$transaction(async (tx) => {
    const u = await tx.usuario.findUnique({ where: { id: d.id } });
    if (!u) throw new ErroNaoEncontrado();
    await tx.usuario.update({ where: { id: d.id }, data: { senhaHash, versaoSessao: { increment: 1 } } });
    await auditar(tx, { sessao: s, acao: 'TROCA_SENHA', entidade: 'Usuario', entidadeId: d.id, contexto: { operacao: 'redefinição pelo administrador' } });
    return { senhaProvisoria: senha };
  });
}

/** O próprio usuário troca a senha provisória. */
export async function trocarMinhaSenha(s: Sessao, d: z.infer<typeof esquemaMinhaSenha>) {
  const erro = validarSenha(d.nova);
  if (erro) throw new ErroDeDominio(erro);
  if (d.nova !== d.confirmacao) throw new ErroDeDominio('A confirmação não confere com a nova senha.');
  const u = await prisma.usuario.findUnique({ where: { id: s.usuarioId } });
  if (!u || !(await conferirSenha(d.atual, u.senhaHash))) throw new ErroDeDominio('Senha atual incorreta.');
  const senhaHash = await gerarHash(d.nova);
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { senhaHash, versaoSessao: { increment: 1 } } });
    await auditar(tx, { sessao: s, acao: 'TROCA_SENHA', entidade: 'Usuario', entidadeId: u.id, contexto: { operacao: 'troca pelo próprio usuário' } });
  });
}
