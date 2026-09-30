import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { competenciaDe, hoje } from '@/lib/datas';
import { conferenciasPendentes } from '@/servidor/consultas/a-pagar';
import { decidirConferencia } from '@/servidor/servicos/cotas';
import { fecharFolha } from '@/servidor/servicos/folha';
import { apurarTudo, csv, estrutura, importar, preparar, vendedor } from './ajuda';

const linha = (cota: string, pagas: number, doc = '52998224725') =>
  ({ grupo: '40', cota, credito: '100.000,00', venda: '01/09/2026', pagas, docVendedor: doc, flex: 'INTEGRAL' });

const doVendedor = async (cota: string, parcela: number) =>
  prisma.comissaoApurada.findMany({ where: { cota: { cota }, destino: 'VENDEDOR', parcela }, orderBy: { criadoEm: 'asc' } });

describe('2ª parcela do Iniciante: a WR não recebe, então pagar o vendedor exige conferência', () => {
  it('cliente pagou a 2ª → fica prevista com aviso; Pagar libera; Não pagar cancela; decisão revisável até a folha', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });

    await importar(admin, administradoraId, csv([linha('1', 1), linha('2', 1)]));
    const c1 = await prisma.cota.findFirstOrThrow({ where: { cota: '1' } });
    expect(c1.snapParcelasConferencia).toEqual([2]);
    expect(await conferenciasPendentes(admin)).toHaveLength(0); // cliente ainda não pagou a 2ª

    // O cliente paga a 2ª parcela: a 1ª já estava liberada; a 2ª fica PREVISTA aguardando conferência.
    await importar(admin, administradoraId, csv([linha('1', 2), linha('2', 3)]));
    expect((await doVendedor('1', 2)).map((c) => c.status)).toEqual(['PREVISTA']);
    expect((await doVendedor('2', 3)).map((c) => c.status)).toEqual(['LIBERADA']); // só a 2ª exige conferência
    const pend = await conferenciasPendentes(admin);
    expect(pend.map((p) => `${p.cota.cota}|${p.parcela}|${p.valor?.toFixed(2)}`).sort()).toEqual(['1|2|400.00', '2|2|400.00']);

    // Pagar → liberada; o aviso some.
    await decidirConferencia(admin, { cotaId: c1.id, parcela: 2, decisao: 'PAGAR', motivo: 'cliente pagou a 2ª' });
    await apurarTudo();
    expect((await doVendedor('1', 2)).filter((c) => c.status !== 'CANCELADA').map((c) => c.status)).toEqual(['LIBERADA']);
    expect((await conferenciasPendentes(admin)).map((p) => p.cota.cota)).toEqual(['2']);

    // Não pagar → a linha é cancelada com o motivo; revisar para Pagar recria liberada.
    const c2 = await prisma.cota.findFirstOrThrow({ where: { cota: '2' } });
    await decidirConferencia(admin, { cotaId: c2.id, parcela: 2, decisao: 'NAO_PAGAR', motivo: 'combinado com o vendedor' });
    await apurarTudo();
    const cancelada = await doVendedor('2', 2);
    expect(cancelada.map((c) => c.status)).toEqual(['CANCELADA']);
    expect(cancelada[0]?.motivoCancelamento).toMatch(/Conferência manual: decidido não pagar/);
    expect(await conferenciasPendentes(admin)).toHaveLength(0);
    await decidirConferencia(admin, { cotaId: c2.id, parcela: 2, decisao: 'PAGAR', motivo: 'revisto' });
    await apurarTudo();
    expect((await doVendedor('2', 2)).map((c) => c.status)).toEqual(['CANCELADA', 'LIBERADA']);
    expect(await prisma.auditLog.count({ where: { entidade: 'ConferenciaParcela' } })).toBe(3);

    // Parcela que não exige conferência e venda de Veterano: recusado.
    await expect(decidirConferencia(admin, { cotaId: c1.id, parcela: 3, decisao: 'PAGAR', motivo: 'x' })).rejects.toThrow(/não exige conferência/);

    // Depois de entrar em folha fechada, a decisão não muda mais.
    await fecharFolha(admin, { competencia: competenciaDe(hoje()) });
    await expect(decidirConferencia(admin, { cotaId: c1.id, parcela: 2, decisao: 'NAO_PAGAR', motivo: 'tarde demais' })).rejects.toThrow(/folha fechada/);
  });

  it('venda cancelada não passa pela conferência: a 2ª parcela sai como não paga (salvo decisão manual de pagar)', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Camila', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    // Estava na conferência (cliente pagou a 2ª) e depois a venda cancelou.
    await importar(admin, administradoraId, csv([linha('1', 2)]));
    expect(await conferenciasPendentes(admin)).toHaveLength(1);
    await importar(admin, administradoraId, csv([{ ...linha('1', 2), situacao: 'CANCELADO', cancelamento: '05/03/2026' }]));
    expect(await conferenciasPendentes(admin)).toHaveLength(0);
    const seg = await doVendedor('1', 2);
    expect(seg.map((c) => c.status)).toEqual(['CANCELADA']);
    expect(seg[0]?.motivoCancelamento).toMatch(/Venda cancelada/);
    expect((await doVendedor('1', 1)).map((c) => c.status)).toEqual(['LIBERADA']); // a 1ª, paga antes do cancelamento, continua

    // Já chega cancelada com "2 parcelas pagas" na base: nem entra na lista.
    await importar(admin, administradoraId, csv([{ ...linha('2', 2), situacao: 'CANCELADO', cancelamento: '05/03/2026' }]));
    expect(await conferenciasPendentes(admin)).toHaveLength(0);
    expect(await prisma.comissaoApurada.count({ where: { cota: { cota: '2' }, destino: 'VENDEDOR', parcela: 2, status: { not: 'CANCELADA' } } })).toBe(0);

    // Exceção: alguém decide pagar mesmo assim.
    const c2 = await prisma.cota.findFirstOrThrow({ where: { cota: '2' } });
    await decidirConferencia(admin, { cotaId: c2.id, parcela: 2, decisao: 'PAGAR', motivo: 'exceção combinada' });
    await apurarTudo();
    expect((await doVendedor('2', 2)).filter((c) => c.status !== 'CANCELADA').map((c) => c.status)).toEqual(['LIBERADA']);
  });

  it('Veterano e categorias sem a regra não são afetados', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([linha('9', 4, '11222333000181')]));
    const c = await prisma.cota.findFirstOrThrow({ where: { cota: '9' } });
    expect(c.snapParcelasConferencia).toEqual([]);
    expect(await prisma.comissaoApurada.count({ where: { cotaId: c.id, destino: 'VENDEDOR', status: 'LIBERADA' } })).toBe(3); // 1ª, 3ª e 4ª
    expect(await conferenciasPendentes(admin)).toHaveLength(0);
  });
});
