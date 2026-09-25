import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ErroDePermissao } from '@/lib/erros';
import { conferirSenha, gerarHash } from '@/lib/senha';
import { listarCarteira, fichaDaCota, whereCarteira, lerFiltroCarteira } from '@/servidor/consultas/carteira';
import { aPagar } from '@/servidor/consultas/a-pagar';
import { listarVendedores } from '@/servidor/consultas/vendedores';
import { painel } from '@/servidor/consultas/dashboard';
import { buscaGlobal } from '@/servidor/consultas/busca';
import { periodoDoMes, type Periodo } from '@/lib/datas';
import { sessaoDoToken } from '@/servidor/sessao-banco';
import { autenticar, MENSAGEM_LOGIN_BLOQUEADO, MENSAGEM_LOGIN_INVALIDO } from '@/servidor/autenticacao';
import { alterarAtivoUsuario, alterarUsuario, criarUsuario } from '@/servidor/servicos/usuarios';
import { cadastrarVendedor } from '@/servidor/servicos/vendedores';
import { fecharFolha } from '@/servidor/servicos/folha';
import { transferirVenda } from '@/servidor/servicos/cotas';
import { csv, D, estrutura, importar, preparar, sessao, vendedor } from './ajuda';

async function cenarioDuasGerencias() {
  const base = await preparar();
  const A = await estrutura(base.admin, 'A');
  const B = await estrutura(base.admin, 'B');
  const va = await vendedor(base.admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: base.cat.INICIANTE, equipeId: A.equipeId });
  const vb = await vendedor(base.admin, { nome: 'Bruno', tipo: 'CPF', doc: '11144477735', categoriaId: base.cat.INICIANTE, equipeId: B.equipeId });
  await importar(base.admin, base.administradoraId, csv([
    { grupo: '1', cota: '1', cliente: 'CLIENTE DA A', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725' },
    { grupo: '1', cota: '2', cliente: 'CLIENTE DA B', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '11144477735' },
  ]));
  const cotaA = await prisma.cota.findFirstOrThrow({ where: { cota: '1' } });
  const cotaB = await prisma.cota.findFirstOrThrow({ where: { cota: '2' } });
  return { ...base, A, B, va, vb, cotaA, cotaB };
}

describe('recorte de visibilidade no SQL', () => {
  it('gerente A não enxerga a gerência B (listas, ficha, A Pagar, vendedores, busca, dashboard e exportação)', async () => {
    const c = await cenarioDuasGerencias();
    const gerenteA = await sessao('GERENTE', { gerenciaId: c.A.gerenciaId });
    const lista = await listarCarteira(gerenteA, {});
    expect(lista.cotas.map((x) => x.clienteNome)).toEqual(['CLIENTE DA A']);
    expect(await fichaDaCota(gerenteA, c.cotaB.id)).toBeNull();
    expect(await fichaDaCota(gerenteA, c.cotaA.id)).not.toBeNull();
    const pagar = await aPagar(gerenteA);
    expect(pagar.linhas.some((l) => l.nome === 'BRUNO')).toBe(false);
    const vend = await listarVendedores(gerenteA, '');
    expect(vend.ativos.map((l) => l.pessoa.nome)).toEqual(['ANA']);
    expect((await buscaGlobal(gerenteA, 'CLIENTE DA')).cotas).toHaveLength(1);
    const p = await painel(gerenteA, periodoDoMes('2026-09') as Periodo);
    expect(p.atual.cotas).toBe(1);
    expect(await prisma.cota.count({ where: whereCarteira(gerenteA, lerFiltroCarteira({})) })).toBe(1);
  });

  it('supervisor A não enxerga a equipe B; gerente/supervisor sem unidade não enxerga nada', async () => {
    const c = await cenarioDuasGerencias();
    const supA = await sessao('SUPERVISOR', { equipeId: c.A.equipeId });
    expect((await listarCarteira(supA, {})).total).toBe(1);
    expect(await fichaDaCota(supA, c.cotaB.id)).toBeNull();
    const semUnidade = await sessao('GERENTE');
    expect((await listarCarteira(semUnidade, {})).total).toBe(0);
    expect((await aPagar(semUnidade)).linhas).toHaveLength(0);
    expect((await listarVendedores(await sessao('SUPERVISOR'), '')).ativos).toHaveLength(0);
    const fin = await sessao('FINANCEIRO');
    expect((await listarCarteira(fin, {})).total).toBe(2);
  });

  it('usuário sem permissão não consegue chamar o serviço diretamente (a Server Action é só a porta)', async () => {
    const c = await cenarioDuasGerencias();
    const fin = await sessao('FINANCEIRO');
    const sup = await sessao('SUPERVISOR', { equipeId: c.A.equipeId });
    const gerente = await sessao('GERENTE', { gerenciaId: c.A.gerenciaId });
    await expect(cadastrarVendedor(fin, { pessoaId: null, tipoDocumento: 'CPF', documento: '39053344705', nome: 'X', categoriaId: c.cat.INICIANTE, equipeId: c.A.equipeId, vigenteDe: D('2026-01-01') })).rejects.toBeInstanceOf(ErroDePermissao);
    await expect(fecharFolha(sup, { competencia: '2026-09' })).rejects.toBeInstanceOf(ErroDePermissao);
    await expect(transferirVenda(gerente, { cotaId: c.cotaA.id, vendedorNovoId: c.vb.id, motivo: 'tentativa' })).rejects.toBeInstanceOf(ErroDePermissao);
    await expect(criarUsuario(fin, { nome: 'x', email: 'x@x.com', perfil: 'ADMINISTRADOR', gerenciaId: null, equipeId: null })).rejects.toBeInstanceOf(ErroDePermissao);
    await expect(listarCarteira(await sessao('CADASTRO'), {})).rejects.toBeInstanceOf(ErroDePermissao);
  });
});

describe('sessão e login', () => {
  it('sessão reconferida no banco: desativar, rebaixar ou trocar escopo vale sem logout', async () => {
    const { admin } = await preparar();
    const est = await estrutura(admin, 'A');
    const u = await criarUsuario(admin, { nome: 'Gerente', email: 'g@wr.local', perfil: 'GERENTE', gerenciaId: est.gerenciaId, equipeId: null });
    const token = { sub: u.usuarioId, perfil: 'ADMINISTRADOR' as const, gerenciaId: null, equipeId: null, v: 1 };
    // O perfil do token não vale: vale o do banco
    expect((await sessaoDoToken(prisma, token, null))?.perfil).toBe('GERENTE');
    await alterarUsuario(admin, { id: u.usuarioId, nome: 'Gerente', perfil: 'SUPERVISOR', gerenciaId: null, equipeId: est.equipeId });
    expect(await sessaoDoToken(prisma, token, null)).toBeNull(); // versão mudou
    const v2 = { ...token, v: 2 };
    expect((await sessaoDoToken(prisma, v2, null))?.perfil).toBe('SUPERVISOR');
    await alterarAtivoUsuario(admin, { id: u.usuarioId, ativo: false });
    expect(await sessaoDoToken(prisma, { ...token, v: 3 }, null)).toBeNull();
  });

  it('nunca desativa nem rebaixa o último administrador ativo', async () => {
    const admin = await sessao('ADMINISTRADOR');
    await expect(alterarAtivoUsuario(admin, { id: admin.usuarioId, ativo: false })).rejects.toThrow(/último administrador/);
    await expect(alterarUsuario(admin, { id: admin.usuarioId, nome: 'x', perfil: 'FINANCEIRO', gerenciaId: null, equipeId: null })).rejects.toThrow(/último administrador/);
  });

  it('senha provisória exibida uma vez, bcrypt custo 12; login com mensagem genérica, auditado e com bloqueio', async () => {
    const admin = await sessao('ADMINISTRADOR');
    const r = await criarUsuario(admin, { nome: 'Fin', email: 'fin@wr.local', perfil: 'FINANCEIRO', gerenciaId: null, equipeId: null });
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: r.usuarioId } });
    expect(u.senhaHash.startsWith('$2')).toBe(true);
    expect(u.senhaHash.split('$')[2]).toBe('12');
    expect(await conferirSenha(r.senhaProvisoria, u.senhaHash)).toBe(true);

    const inexistente = await autenticar({ email: 'naoexiste@wr.local', senha: 'qualquer-coisa', ip: '10.0.0.1' }, { semEspera: true });
    const errada = await autenticar({ email: 'fin@wr.local', senha: 'errada-errada', ip: '10.0.0.1' }, { semEspera: true });
    expect(inexistente).toEqual({ ok: false, mensagem: MENSAGEM_LOGIN_INVALIDO, esperaMs: 0 });
    expect(errada).toEqual(inexistente);
    const certo = await autenticar({ email: 'FIN@wr.local', senha: r.senhaProvisoria, ip: '10.0.0.1' }, { semEspera: true });
    expect(certo.ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { acao: 'LOGIN_FALHA' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { acao: 'LOGIN' } })).toBe(1);

    for (let i = 0; i < 5; i++) await autenticar({ email: 'fin@wr.local', senha: 'errada-errada', ip: '10.0.0.2' }, { semEspera: true });
    const bloqueado = await autenticar({ email: 'fin@wr.local', senha: r.senhaProvisoria, ip: '10.0.0.3' }, { semEspera: true });
    expect(bloqueado).toMatchObject({ ok: false, mensagem: MENSAGEM_LOGIN_BLOQUEADO });
    expect(await prisma.auditLog.count({ where: { acao: 'LOGIN_BLOQUEADO' } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.notificacao.count({ where: { tipo: 'BLOQUEIO_LOGIN' } })).toBeGreaterThan(0);
    await prisma.usuario.update({ where: { id: u.id }, data: { senhaHash: await gerarHash('outra-senha-longa') } });
  });
});
