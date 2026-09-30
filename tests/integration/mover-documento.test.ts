import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { moverDocumento } from '@/servidor/servicos/vendedores';
import { apurarTudo, csv, estrutura, importar, preparar, vendedor } from './ajuda';

describe('documento cadastrado na pessoa errada', () => {
  it('CNPJ criado como pessoa nova em vez de junto do CPF: mover leva o histórico e as comissões para a pessoa certa', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const cpf = await vendedor(admin, { nome: 'Mateus Oliveira', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    const cnpj = await vendedor(admin, { nome: 'Mateus Oliveira ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId }); // pessoa nova, por engano
    expect(cnpj.pessoaId).not.toBe(cpf.pessoaId);
    await importar(admin, administradoraId, csv([{ grupo: '50', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL' }]));
    expect((await prisma.comissaoApurada.findFirstOrThrow({ where: { destino: 'VENDEDOR', status: { not: 'CANCELADA' } } })).titularPessoaId).toBe(cnpj.pessoaId);

    const r = await moverDocumento(admin, { vendedorId: cnpj.id, pessoaDestinoId: cpf.pessoaId, motivo: 'Cadastrado na pessoa errada' });
    expect(r).toMatchObject({ pessoaDestinoId: cpf.pessoaId, vendas: 1, origemFicouVazia: true });
    await apurarTudo();

    const ativas = await prisma.comissaoApurada.findMany({ where: { destino: 'VENDEDOR', status: { not: 'CANCELADA' } }, orderBy: { parcela: 'asc' } });
    expect(new Set(ativas.map((c) => c.titularPessoaId))).toEqual(new Set([cpf.pessoaId]));
    expect(ativas.map((c) => `${c.parcela}:${c.valor.toFixed(2)}`)).toEqual(['1:800.00', '3:400.00', '4:400.00', '6:400.00']); // mesma regra (Veterano), só o titular mudou
    expect(await prisma.vendedor.count({ where: { pessoaId: cpf.pessoaId } })).toBe(2);
    expect(await prisma.pessoaVinculo.count({ where: { vendedorId: cnpj.id, pessoaId: cpf.pessoaId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entidade: 'Vendedor', entidadeId: cnpj.id, acao: 'ALTERACAO' } })).toBe(1);
    await expect(moverDocumento(admin, { vendedorId: cnpj.id, pessoaDestinoId: cpf.pessoaId, motivo: 'de novo' })).rejects.toThrow(/já está nesta pessoa/);
  });

  it('CNPJ Expert em pessoa separada: ao mover para a pessoa do Veterano, as vendas passam a gerar os 0,3% do Expert', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const vet = await vendedor(admin, { nome: 'Lucas ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const exp = await vendedor(admin, { nome: 'Lucas Expert', tipo: 'CNPJ', doc: '11444777000161', categoriaId: cat.EXPERT, equipeId: est.equipeId, desde: '2026-09-01' }); // pessoa separada, por engano
    await importar(admin, administradoraId, csv([{ grupo: '51', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL' }]));
    expect(await prisma.comissaoApurada.count({ where: { destino: 'EXPERT', status: { not: 'CANCELADA' } } })).toBe(0);

    await moverDocumento(admin, { vendedorId: exp.id, pessoaDestinoId: vet.pessoaId, motivo: 'Expert é a mesma pessoa do Veterano' });
    await apurarTudo();
    const expert = await prisma.comissaoApurada.findMany({ where: { destino: 'EXPERT', status: { not: 'CANCELADA' } }, orderBy: { parcela: 'asc' } });
    expect(expert.map((c) => `${c.parcela}:${c.valor.toFixed(2)}`)).toEqual(['1:300.00', '3:100.00', '4:100.00']);
    expect(expert.every((c) => c.titularVendedorId === exp.id && c.titularPessoaId === vet.pessoaId)).toBe(true);
  });
});
