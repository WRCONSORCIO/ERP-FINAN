import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { alterarCategoria } from '@/servidor/servicos/vendedores';
import { csv, D, estrutura, importar, preparar, vendedor } from './ajuda';

describe('integridade garantida pelo PostgreSQL', () => {
  it('vigências sobrepostas e fim antes do início são recusados pelo banco', async () => {
    const { admin, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const v = await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await expect(prisma.vendedorCategoria.create({ data: { vendedorId: v.id, categoriaId: cat.INICIANTE, vigenteDe: D('2026-06-01') } })).rejects.toThrow(/sobreposicao|exclusion/i);
    await expect(prisma.vendedorAlocacao.create({ data: { vendedorId: v.id, equipeId: est.equipeId, vigenteDe: D('2026-06-01') } })).rejects.toThrow();
    await expect(prisma.periodoRecuperacao.create({ data: { vendedorId: v.id, inicio: D('2026-06-10'), fim: D('2026-06-01') } })).rejects.toThrow(/ck_recuperacao_vigencia/);
    await prisma.periodoRecuperacao.create({ data: { vendedorId: v.id, inicio: D('2026-06-01'), fim: D('2026-06-30') } });
    await expect(prisma.periodoRecuperacao.create({ data: { vendedorId: v.id, inicio: D('2026-06-15') } })).rejects.toThrow();
    // Período cancelado é ignorado pela exclusão
    await prisma.periodoRecuperacao.updateMany({ where: { vendedorId: v.id }, data: { canceladoEm: new Date() } });
    await prisma.periodoRecuperacao.create({ data: { vendedorId: v.id, inicio: D('2026-06-15') } });
  });

  it('papel coerente: supervisor responde por equipe, gerente por gerência', async () => {
    const { admin } = await preparar();
    const est = await estrutura(admin, 'A');
    const p = await prisma.pessoa.create({ data: { nome: 'X', nomeNormalizado: 'X' } });
    await expect(prisma.responsavelUnidade.create({ data: { papel: 'SUPERVISOR', gerenciaId: est.gerenciaId, pessoaId: p.id, vigenteDe: D('2027-01-01') } })).rejects.toThrow(/ck_responsavel_papel/);
    await expect(prisma.usuario.create({ data: { nome: 'x', email: 'x@x', senhaHash: 'x', perfil: 'GERENTE', equipeId: est.equipeId } })).rejects.toThrow(/ck_usuario_escopo/);
  });

  it('cota única, nunca apagada; comissão e estorno únicos; valores imutáveis; quem paga coerente', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '1', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725' }]));
    const cota = await prisma.cota.findFirstOrThrow();
    const { id: _id, criadoEm: _c, atualizadoEm: _a, ...copia } = cota;
    await expect(prisma.cota.create({ data: copia })).rejects.toThrow();
    await expect(prisma.cota.delete({ where: { id: cota.id } })).rejects.toThrow(/não se apaga/);
    const c1 = await prisma.comissaoApurada.findFirstOrThrow({ where: { cotaId: cota.id, destino: 'VENDEDOR', parcela: 1 } });
    const { id: _i, criadoEm: _cc, ...dup } = c1;
    await expect(prisma.comissaoApurada.create({ data: { ...dup, memoria: {} } })).rejects.toThrow();
    await expect(prisma.comissaoApurada.update({ where: { id: c1.id }, data: { valor: '999' } })).rejects.toThrow(/imutáveis/);
    await expect(prisma.comissaoApurada.delete({ where: { id: c1.id } })).rejects.toThrow(/não se apaga/);
    await expect(prisma.comissaoApurada.create({ data: { ...dup, parcela: 9, pagaPelaWr: false, memoria: {} } })).rejects.toThrow(/Quem paga incoerente/);
    await expect(prisma.faixaComissao.create({ data: { tabelaId: c1.tabelaId, parcela: 0, percentual: '1' } })).rejects.toThrow(/ck_faixa_parcela/);
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    const categoria = await prisma.categoriaVendedor.findFirstOrThrow();
    await expect(prisma.categoriaVendedor.update({ where: { id: categoria.id }, data: { codigo: 'OUTRO' } })).rejects.toThrow(/nunca muda/);
  });

  it('auditoria gravada na mesma transação do fato: falhou, não há auditoria; deu certo, há antes e depois', async () => {
    const { admin, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const v = await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    const antes = await prisma.auditLog.count();
    await expect(alterarCategoria(admin, { vendedorId: v.id, categoriaId: cat.INICIANTE, vigenteDe: D('2025-01-01'), motivo: 'x', promocao: false })).rejects.toThrow();
    expect(await prisma.auditLog.count()).toBe(antes);
    const eq2 = await prisma.equipe.create({ data: { nome: 'OUTRA', gerenciaId: est.gerenciaId } });
    const { alterarAlocacao } = await import('@/servidor/servicos/vendedores');
    await alterarAlocacao(admin, { vendedorId: v.id, equipeId: eq2.id, vigenteDe: D('2026-10-01'), motivo: 'mudou de equipe' });
    const a = await prisma.auditLog.findFirstOrThrow({ where: { acao: 'ALTERACAO_ALOCACAO' } });
    expect(a.usuarioId).toBe(admin.usuarioId);
    expect(a.antes).toMatchObject({ equipe: 'E A' });
    expect(a.depois).toMatchObject({ equipe: 'OUTRA' });
  });
});
