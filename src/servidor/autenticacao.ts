import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { conferirSenha, hashParaTempoConstante } from '@/lib/senha';
import { assinarToken } from '@/lib/sessao-token';
import type { PerfilCodigo } from '@/lib/permissoes';
import { auditar } from './auditoria';
import { limitesLogin } from './configuracao';
import { notificar } from './notificacoes';

export const MENSAGEM_LOGIN_INVALIDO = 'E-mail ou senha inválidos.';
export const MENSAGEM_LOGIN_BLOQUEADO = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';

export type ResultadoLogin =
  | { ok: true; token: string; usuarioId: string }
  | { ok: false; mensagem: string; esperaMs: number };

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Login: mensagem sempre igual; e-mail inexistente também paga o custo do bcrypt (tempo equivalente).
 * Toda tentativa vai para a auditoria. Espera progressiva por e-mail e bloqueio temporário por e-mail e por IP.
 */
export async function autenticar(p: { email: string; senha: string; ip: string }, opcoes: { semEspera?: boolean } = {}): Promise<ResultadoLogin> {
  const email = p.email.trim().toLowerCase().slice(0, 254);
  const limites = await limitesLogin(prisma);
  const desde = new Date(Date.now() - limites.janelaMinutos * 60_000);
  const [falhasEmail, falhasIp] = await Promise.all([
    prisma.loginTentativa.count({ where: { email, sucesso: false, criadoEm: { gte: desde } } }),
    prisma.loginTentativa.count({ where: { ip: p.ip, sucesso: false, criadoEm: { gte: desde } } }),
  ]);

  const bloqueado = falhasEmail >= limites.falhasParaBloqueioEmail || falhasIp >= limites.falhasParaBloqueioIp;
  if (bloqueado) {
    // Mesmo bloqueado, o custo do bcrypt é pago: o tempo não revela nada.
    await conferirSenha(p.senha, await hashParaTempoConstante());
    await prisma.$transaction(async (tx) => {
      await tx.loginTentativa.create({ data: { email, ip: p.ip, sucesso: false } });
      await auditar(tx, { sessao: null, acao: 'LOGIN_BLOQUEADO', entidade: 'Usuario', email, ip: p.ip, contexto: { falhasEmail, falhasIp } });
      await notificar(tx, {
        tipo: 'BLOQUEIO_LOGIN', severidade: 'CRITICA', titulo: 'Login bloqueado por excesso de tentativas',
        mensagem: `E-mail ${email} / IP ${p.ip}: ${Math.max(falhasEmail, falhasIp)} falhas em ${limites.janelaMinutos} min.`,
        link: '/auditoria?acao=LOGIN_FALHA', chave: `bloqueio-${email}-${p.ip}-${Math.floor(Date.now() / (limites.bloqueioMinutos * 60_000))}`, perfis: ['ADMINISTRADOR'],
      });
    });
    return { ok: false, mensagem: MENSAGEM_LOGIN_BLOQUEADO, esperaMs: limites.bloqueioMinutos * 60_000 };
  }

  // Espera progressiva a partir da N-ésima falha: 1s, 2s, 4s (máx. 8s).
  if (falhasEmail >= limites.falhasParaAtraso && !opcoes.semEspera) {
    await esperar(Math.min(1000 * 2 ** (falhasEmail - limites.falhasParaAtraso), 8000));
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  const hash = usuario?.senhaHash ?? (await hashParaTempoConstante());
  const senhaOk = await conferirSenha(p.senha, hash);
  const ok = usuario !== null && usuario.ativo && senhaOk;

  if (!ok || !usuario) {
    await prisma.$transaction(async (tx) => {
      await tx.loginTentativa.create({ data: { email, ip: p.ip, sucesso: false } });
      await auditar(tx, {
        sessao: null, acao: 'LOGIN_FALHA', entidade: 'Usuario', entidadeId: usuario?.id ?? null, email, ip: p.ip,
        contexto: { motivo: !usuario ? 'email_inexistente' : !usuario.ativo ? 'usuario_inativo' : 'senha_incorreta' },
      });
    });
    log.aviso('login.falha', { ip: p.ip });
    return { ok: false, mensagem: MENSAGEM_LOGIN_INVALIDO, esperaMs: 0 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.loginTentativa.create({ data: { email, ip: p.ip, sucesso: true } });
    await tx.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });
    await auditar(tx, { sessao: null, acao: 'LOGIN', entidade: 'Usuario', entidadeId: usuario.id, email, ip: p.ip });
  });
  const token = await assinarToken({
    sub: usuario.id, perfil: usuario.perfil as PerfilCodigo, gerenciaId: usuario.gerenciaId, equipeId: usuario.equipeId, v: usuario.versaoSessao,
  });
  return { ok: true, token, usuarioId: usuario.id };
}
