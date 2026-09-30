import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { definirEscopoBase } from '@/servidor/servicos/regras';
import { desligarVendedor, reativarVendedor } from '@/servidor/servicos/vendedores';
import { D, apurarTudo, comissoesDa, csv, estrutura, importar, importarCanceladas, importarRelatorio, preparar, relatorioWr, vendedor } from './ajuda';

const VETERANO = '11222333000181';
const INICIANTE = '52998224725';

describe('regras da WR: dinheiro só pelo relatório; desligado não recebe nem paga estorno', () => {
  it('estorno só existe quando o cancelamento aparece no relatório; vendedor desligado não paga estorno', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const v = await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: VETERANO, categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    const linha = { grupo: '50', cota: '1', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: VETERANO, flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '20/09/2026' };
    const linha2 = { ...linha, cota: '2' };

    // Cancelada só na base: nenhum estorno.
    await importar(admin, administradoraId, csv([linha, linha2]));
    expect(await prisma.estorno.count({ where: { status: { not: 'INVALIDADO' } } })).toBe(0);

    // O cancelamento da venda 1 aparece no relatório: o estorno passa a existir, com a data do relatório.
    await importarCanceladas(admin, administradoraId, [linha], '05/10/2026');
    const e = await prisma.estorno.findFirstOrThrow({ where: { status: { not: 'INVALIDADO' } } });
    expect(e.valor.toFixed(2)).toBe('400.00');
    expect(e.dataDebitoAdm?.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(await prisma.estorno.count({ where: { status: { not: 'INVALIDADO' }, cota: { cota: '2' } } })).toBe(0);

    // Desligado: o estorno a cobrar sai; o cancelamento da venda 2 no relatório também não gera cobrança.
    await desligarVendedor(admin, { vendedorId: v.id, data: D('2026-10-10'), motivo: 'saiu da WR' });
    await apurarTudo();
    await importarCanceladas(admin, administradoraId, [linha2], '12/10/2026');
    expect(await prisma.estorno.count({ where: { status: { not: 'INVALIDADO' } } })).toBe(0);
    expect((await prisma.estorno.findUniqueOrThrow({ where: { id: e.id } })).motivoInvalidacao).toMatch(/desligado/);

    // Reativado por engano: volta a valer.
    await reativarVendedor(admin, { vendedorId: v.id, motivo: 'desligado por engano' });
    await apurarTudo();
    expect(await prisma.estorno.count({ where: { status: { not: 'INVALIDADO' } } })).toBe(2);
  });

  it('Iniciante desligado não recebe mais nada que não foi pago (nem o já liberado); supervisão/gerência seguem recebendo', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const v = await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: INICIANTE, categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '51', cota: '1', credito: '100.000,00', venda: '01/09/2026', pagas: 3, docVendedor: INICIANTE, flex: 'INTEGRAL' }]));
    const cota = await prisma.cota.findFirstOrThrow();
    const p = { grupo: '51', cota: '1', contrato: '51001I10', credito: 100000, venda: '01/09/2026', doc: INICIANTE };
    await importarRelatorio(admin, administradoraId, relatorioWr([{ ...p, parcela: 1, data: '10/09/2026' }]));
    await desligarVendedor(admin, { vendedorId: v.id, data: D('2026-09-15'), motivo: 'saiu da WR' });
    await apurarTudo();
    // A 3ª parcela só aparece no relatório depois do desligamento.
    await importarRelatorio(admin, administradoraId, relatorioWr([{ ...p, parcela: 3, data: '20/09/2026' }]));
    expect((await comissoesDa(cota.id)).filter((c) => c.destino === 'VENDEDOR')).toHaveLength(0);
    expect(await conferencias(cota.id)).toBe(0); // a 2ª parcela nem vai para a conferência
    const canceladas = await prisma.comissaoApurada.findMany({ where: { cotaId: cota.id, destino: 'VENDEDOR', status: 'CANCELADA' } });
    expect(canceladas.some((c) => /desligado/.test(c.motivoCancelamento ?? ''))).toBe(true);
    // Supervisão/gerência não são afetadas pelo desligamento do vendedor.
    expect((await comissoesDa(cota.id)).some((c) => c.destino === 'GERENCIA' && c.status === 'LIBERADA')).toBe(true);
    expect(await prisma.comissaoApurada.count({ where: { cotaId: cota.id, destino: { not: 'VENDEDOR' }, motivoCancelamento: { contains: 'desligado' } } })).toBe(0);
  });
});

const conferencias = (cotaId: string) => prisma.pendencia.count({ where: { cotaId, tipo: 'CONFERENCIA_PARCELA', resolvidaEm: null } });
