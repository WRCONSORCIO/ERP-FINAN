import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { alterarAlocacao, corrigirEquipe } from '@/servidor/servicos/vendedores';
import { D, apurarTudo, comissoesDa, csv, estrutura, importar, importarRelatorio, preparar, relatorioWr, vendedor } from './ajuda';

describe('equipe cadastrada errada', () => {
  it('"Mudar de equipe" recusa por causa das vendas calculadas; "Corrigir equipe" troca o período e recalcula com o gerente certo', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const erita = await estrutura(admin, 'ERITA');
    const rafael = await estrutura(admin, 'RAFAEL');
    const v = await vendedor(admin, { nome: 'KEILA COSTA COELHO', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: erita.equipeId, desde: '2026-01-01' });
    await importar(admin, administradoraId, csv([{ grupo: '70', cota: '1', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '52998224725', flex: 'INTEGRAL' }]));
    await importarRelatorio(admin, administradoraId, relatorioWr([{ grupo: '70', cota: '1', contrato: '70001I10', credito: 100000, parcela: 1, data: '10/09/2026', venda: '01/09/2026', doc: '52998224725' }]));
    const cota = await prisma.cota.findFirstOrThrow({ where: { grupo: '70' } });
    expect(cota.snapEquipeId).toBe(erita.equipeId);
    const gerenteErita = cota.snapGerentePessoaId;

    await expect(alterarAlocacao(admin, { vendedorId: v.id, equipeId: rafael.equipeId, vigenteDe: D('2026-01-01'), motivo: 'x' })).rejects.toThrow();
    const aloc = await prisma.vendedorAlocacao.findFirstOrThrow({ where: { vendedorId: v.id } });
    const r = await corrigirEquipe(admin, { alocacaoId: aloc.id, equipeId: rafael.equipeId, motivo: 'cadastro errado: é da gerência Rafael' });
    expect(r).toEqual({ vendas: 1, recalculadas: 1 });
    await apurarTudo();

    const depois = await prisma.cota.findUniqueOrThrow({ where: { id: cota.id } });
    expect(depois.snapEquipeId).toBe(rafael.equipeId);
    expect(depois.snapGerentePessoaId).not.toBe(gerenteErita);
    const gerencia = (await comissoesDa(cota.id)).filter((c) => c.destino === 'GERENCIA');
    expect(gerencia.length).toBeGreaterThan(0);
    expect(gerencia.every((c) => c.titularPessoaId === depois.snapGerentePessoaId)).toBe(true);
    expect((await prisma.vendedorAlocacao.findUniqueOrThrow({ where: { id: aloc.id } })).motivo).toMatch(/^correção/);
    await expect(corrigirEquipe(admin, { alocacaoId: aloc.id, equipeId: rafael.equipeId, motivo: 'de novo' })).rejects.toThrow(/já está nesta equipe/);
  });
});
