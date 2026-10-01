import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { fecharFolha } from '@/servidor/servicos/folha';
import { apurarTudo, comissoesDa, csv, D, estrutura, importar, importarRelatorio, preparar, relatorioWr, valores, vendedor } from './ajuda';

const DOC = '52998224725';
const venda = (cota: string, pagas: number) => ({ grupo: '1570', cota, contrato: `7${cota.padStart(4, '0')}I10`, credito: '300.000,00', venda: '22/06/2026', pagas, docVendedor: DOC });
const rel = (cota: string, parcela: number, data: string) => ({ grupo: '1570', cota, contrato: `7${cota.padStart(4, '0')}I10`, credito: 300000, parcela, data, venda: '22/06/2026', doc: DOC });

describe('comissão liberada pelo relatório da administradora, não pela base de clientes', () => {
  it('antecipação: a base diz 4 parcelas pagas, mas só libera o que veio no relatório da WR', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Gabriel', tipo: 'CPF', doc: DOC, categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([venda('3500', 4)])); // a 4ª "paga" foi antecipação da parcela 220
    const cota = await prisma.cota.findFirstOrThrow();
    expect((await comissoesDa(cota.id)).every((c) => c.status === 'PREVISTA')).toBe(true); // sem relatório, nada a pagar

    await importarRelatorio(admin, administradoraId, relatorioWr([rel('3500', 1, '10/07/2026'), rel('3500', 3, '10/09/2026')]));
    const vend = valores((await comissoesDa(cota.id)).filter((c) => c.destino === 'VENDEDOR'));
    // A 2ª (que exige conferência) venceu em julho, antes do início do sistema: venda "velha", não entra.
    expect(vend).toEqual(['VENDEDOR:1:750.00:LIBERADA', 'VENDEDOR:3:450.00:LIBERADA', 'VENDEDOR:4:450.00:PREVISTA']);
    const datas = (await comissoesDa(cota.id)).filter((c) => c.status === 'LIBERADA' && c.destino === 'VENDEDOR').map((c) => c.liberadaEm?.toISOString().slice(0, 10));
    expect(datas).toEqual(['2026-07-10', '2026-09-10']);
  });

  it('o que tinha sido liberado só pela base volta a prevista; relatório importado antes da base é ligado depois', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Gabriel', tipo: 'CPF', doc: DOC, categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    // Relatório chega primeiro (a venda ainda não está na carteira): fica guardado sem vínculo.
    await importarRelatorio(admin, administradoraId, relatorioWr([rel('3600', 1, '10/09/2026')]));
    expect(await prisma.lancamentoAdministradora.count({ where: { cotaId: null } })).toBe(1);
    await importar(admin, administradoraId, csv([venda('3600', 1)]));
    const cota = await prisma.cota.findFirstOrThrow();
    // O relatório é append-only: fica sem vínculo gravado, mas é encontrado pelo grupo/cota/contrato e libera a comissão.
    expect((await comissoesDa(cota.id)).find((c) => c.destino === 'VENDEDOR' && c.parcela === 1)?.status).toBe('LIBERADA');

    // Simula uma linha liberada pela regra antiga (base), sem relatório: a reapuração devolve para prevista.
    const p3 = (await comissoesDa(cota.id)).find((c) => c.destino === 'VENDEDOR' && c.parcela === 3)!;
    await prisma.comissaoApurada.update({ where: { id: p3.id }, data: { status: 'LIBERADA', liberadaEm: D('2026-09-01'), parcelasPagasNaLiberacao: 3 } });
    await importar(admin, administradoraId, csv([{ ...venda('3600', 1), cliente: 'NOME ATUALIZADO' }]));
    const depois = (await comissoesDa(cota.id)).find((c) => c.id === p3.id)!;
    expect(depois.status).toBe('PREVISTA');
    expect(depois.liberadaEm).toBeNull();
  });

  it('folha do dia 20: entra o que veio nos relatórios até a data de corte; o resto fica para a próxima', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Gabriel', tipo: 'CPF', doc: DOC, categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([venda('3700', 1), venda('3701', 1)]));
    await importarRelatorio(admin, administradoraId, relatorioWr([rel('3700', 1, '10/09/2026'), rel('3701', 1, '22/09/2026')]));
    const folha = await fecharFolha(admin, { competencia: '2026-09' }); // corte padrão: relatórios até 10/09
    const naFolha = await prisma.comissaoApurada.findMany({ where: { folhaId: folha.id }, include: { cota: true } });
    expect([...new Set(naFolha.map((c) => c.cota.cota))]).toEqual(['3700']);
    expect(await prisma.comissaoApurada.count({ where: { cota: { cota: '3701' }, status: 'LIBERADA', folhaId: null } })).toBeGreaterThan(0);
    await apurarTudo();
  });
});
