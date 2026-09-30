import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { definirEscopoBase } from '@/servidor/servicos/regras';
import { desligarVendedor } from '@/servidor/servicos/vendedores';
import { D, apurarTudo, comissoesDa, csv, estrutura, importar, importarCanceladas, importarRelatorio, preparar, relatorioAdm, valores, vendedor } from './ajuda';

const VETERANO_DOC = '11222333000181';
const EXPERT_DOC = '11444777000161';

describe('Expert recebe sobre as vendas do CNPJ Veterano da mesma pessoa', () => {
  it('a partir da data em que virou Expert: 0,8% do Veterano + 0,3% do Expert, ambos pagos pela administradora', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const vet = await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: VETERANO_DOC, categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const exp = await vendedor(admin, { nome: 'Carla Expert', tipo: 'CNPJ', doc: EXPERT_DOC, categoriaId: cat.EXPERT, equipeId: est.equipeId, desde: '2026-09-01', pessoaId: vet.pessoaId });

    await importar(admin, administradoraId, csv([
      { grupo: '1', cota: '1', credito: '100.000,00', venda: '15/08/2026', pagas: 1, docVendedor: VETERANO_DOC, flex: 'INTEGRAL' },
      { grupo: '1', cota: '2', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: VETERANO_DOC, flex: 'INTEGRAL' },
    ]));
    const antes = await prisma.cota.findFirstOrThrow({ where: { cota: '1' } });
    const depois = await prisma.cota.findFirstOrThrow({ where: { cota: '2' } });
    // 1ª parcela no relatório que a administradora paga: uma linha para o CNPJ Veterano, outra para o CNPJ Expert.
    const p1 = { grupo: '1', cota: '2', contrato: '10002I10', credito: 100000, parcela: 1, data: '20/09/2026', venda: '10/09/2026' };
    await importarRelatorio(admin, administradoraId, relatorioAdm([{ ...p1, doc: VETERANO_DOC }, { ...p1, doc: EXPERT_DOC, valor: 300 }]));

    expect(antes.snapExpertVendedorId).toBeNull();
    expect((await comissoesDa(antes.id)).filter((c) => c.destino === 'EXPERT')).toHaveLength(0);

    expect(depois.snapExpertVendedorId).toBe(exp.id);
    const linhas = await comissoesDa(depois.id);
    expect(valores(linhas.filter((c) => c.destino === 'VENDEDOR' || c.destino === 'EXPERT'))).toEqual([
      'VENDEDOR:1:800.00:LIBERADA', 'VENDEDOR:3:400.00:PREVISTA', 'VENDEDOR:4:400.00:PREVISTA', 'VENDEDOR:6:400.00:PREVISTA',
      'EXPERT:1:300.00:LIBERADA', 'EXPERT:3:100.00:PREVISTA', 'EXPERT:4:100.00:PREVISTA',
    ]);
    const expert = linhas.filter((c) => c.destino === 'EXPERT');
    expect(expert.every((c) => !c.pagaPelaWr && c.titularVendedorId === exp.id && c.titularPessoaId === vet.pessoaId)).toBe(true);
    // Supervisão e gerência continuam como antes (sem mudança nas regras delas).
    expect(linhas.some((c) => c.destino === 'SUPERVISAO')).toBe(false);
  });

  it('cadastrar o CNPJ Expert depois da importação recalcula as vendas desde a data; desligado não recebe mais nada', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const vet = await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: VETERANO_DOC, categoriaId: cat.VETERANO, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([
      { grupo: '2', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: VETERANO_DOC, flex: 'INTEGRAL' },
      { grupo: '2', cota: '2', credito: '100.000,00', venda: '20/09/2026', pagas: 1, docVendedor: VETERANO_DOC, flex: 'INTEGRAL' },
    ]));
    const c1 = await prisma.cota.findFirstOrThrow({ where: { grupo: '2', cota: '1' } });
    const c2 = await prisma.cota.findFirstOrThrow({ where: { grupo: '2', cota: '2' } });
    expect((await comissoesDa(c1.id)).filter((c) => c.destino === 'EXPERT')).toHaveLength(0);

    const exp = await vendedor(admin, { nome: 'Carla Expert', tipo: 'CNPJ', doc: EXPERT_DOC, categoriaId: cat.EXPERT, equipeId: est.equipeId, desde: '2026-09-01', pessoaId: vet.pessoaId });
    await apurarTudo();
    expect((await comissoesDa(c1.id)).filter((c) => c.destino === 'EXPERT').map((c) => c.valor.toFixed(2))).toEqual(['300.00', '100.00', '100.00']);
    expect((await comissoesDa(c2.id)).filter((c) => c.destino === 'EXPERT')).toHaveLength(3);

    // A 1ª parcela da venda 1 saiu no relatório antes do desligamento, mas não entrou em folha.
    const p1 = { grupo: '2', cota: '1', contrato: '02001I10', credito: 100000, parcela: 1, data: '12/09/2026', venda: '10/09/2026', doc: EXPERT_DOC, valor: 300 };
    await importarRelatorio(admin, administradoraId, relatorioAdm([p1]));
    await desligarVendedor(admin, { vendedorId: exp.id, data: D('2026-09-15'), motivo: 'deixou de ser Expert' });
    await apurarTudo();
    // Regra da WR: desligou, não recebe mais nada que ainda não foi pago.
    expect((await comissoesDa(c1.id)).filter((c) => c.destino === 'EXPERT')).toHaveLength(0);
    expect((await comissoesDa(c2.id)).filter((c) => c.destino === 'EXPERT')).toHaveLength(0);
    await importarRelatorio(admin, administradoraId, relatorioAdm([{ ...p1, parcela: 3, data: '20/09/2026', valor: 100 }]));
    expect((await comissoesDa(c1.id)).filter((c) => c.destino === 'EXPERT')).toHaveLength(0);
  });

  it('cancelamento: o Expert também devolve (estorno próprio, pela regra do Expert)', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const vet = await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: VETERANO_DOC, categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const exp = await vendedor(admin, { nome: 'Carla Expert', tipo: 'CNPJ', doc: EXPERT_DOC, categoriaId: cat.EXPERT, equipeId: est.equipeId, desde: '2026-09-01', pessoaId: vet.pessoaId });
    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    await importarCanceladas(admin, administradoraId, [
      { grupo: '3', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: VETERANO_DOC, flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '20/09/2026' },
    ]);
    const estornos = await prisma.estorno.findMany({ where: { status: { not: 'INVALIDADO' } }, orderBy: { destino: 'asc' } });
    expect(estornos.map((e) => `${e.destino}:${e.valor.toFixed(2)}`)).toEqual(['VENDEDOR:400.00', 'EXPERT:150.00']);
    expect(estornos.find((e) => e.destino === 'EXPERT')?.titularVendedorId).toBe(exp.id);
  });
});
