import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { abrirVigenciaRegraEstorno, abrirVigenciaTabela, definirEscopoBase, simularTabela } from '@/servidor/servicos/regras';
import { alterarCategoria, corrigirInicioCategoria } from '@/servidor/servicos/vendedores';
import { comissoesDa, csv, D, estrutura, importar, preparar, vendedor } from './ajuda';

describe('vigência: a regra é resolvida pela data do fato', () => {
  it('venda anterior usa a regra antiga; venda a partir da nova vigência usa a nova; passado não muda', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '1', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725' }]));

    const seg = await prisma.segmento.findFirstOrThrow({ where: { codigo: 'IMOVEIS' } });
    const entrada = { destino: 'VENDEDOR' as const, segmentoId: seg.id, categoriaId: cat.INICIANTE, titularVendedorId: null, titularPessoaId: null, observacao: null,
      p1: '1', p2: null, p3: null, p4: null, p5: null, p6: null, p7: null, p8: null, p9: null, p10: null, p11: null, p12: null };
    // Não pode começar numa data em que já existe venda apurada com a tabela atual
    await expect(abrirVigenciaTabela(admin, { ...entrada, vigenteDe: D('2026-09-05') })).rejects.toThrow(/já foi apurada/);
    // Simulação não grava nada
    const sim = await simularTabela(admin, { ...entrada, vigenteDe: D('2026-09-15') });
    expect(sim.totalAtual).toBe('750');
    expect(sim.totalNovo).toBe('500');
    expect(await prisma.tabelaComissao.count()).toBe(10);

    await abrirVigenciaTabela(admin, { ...entrada, vigenteDe: D('2026-09-15') });
    const antiga = await prisma.tabelaComissao.findFirstOrThrow({ where: { categoriaId: cat.INICIANTE, segmentoId: seg.id, vigenteDe: D('2026-01-01') } });
    expect(antiga.vigenteAte?.toISOString().slice(0, 10)).toBe('2026-09-14');

    await importar(admin, administradoraId, csv([
      { grupo: '1', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725' },
      { grupo: '1', cota: '2', credito: '100.000,00', venda: '16/09/2026', pagas: 1, docVendedor: '52998224725' },
    ]));
    const [c1, c2] = await Promise.all([
      prisma.cota.findFirstOrThrow({ where: { cota: '1' } }), prisma.cota.findFirstOrThrow({ where: { cota: '2' } }),
    ]);
    expect((await comissoesDa(c1.id)).find((c) => c.destino === 'VENDEDOR' && c.parcela === 1)?.valor.toFixed(2)).toBe('250.00');
    expect((await comissoesDa(c2.id)).find((c) => c.destino === 'VENDEDOR' && c.parcela === 1)?.valor.toFixed(2)).toBe('500.00');
    expect((await comissoesDa(c2.id)).filter((c) => c.destino === 'VENDEDOR')).toHaveLength(1);
    // A sobreposição é barrada pelo próprio banco
    await expect(prisma.tabelaComissao.create({ data: { destino: 'VENDEDOR', segmentoId: seg.id, categoriaId: cat.INICIANTE, vigenteDe: D('2026-09-20') } })).rejects.toThrow();
  });

  it('percentual do estorno pela data do CANCELAMENTO; base pela comissão da data da venda', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    await abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', titularVendedorId: null, percentual: '30', vigenteDe: D('2026-09-15') });
    await importar(admin, administradoraId, csv([
      { grupo: '2', cota: '1', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '14/09/2026' },
      { grupo: '2', cota: '2', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '20/09/2026' },
    ]));
    const antigo = await prisma.estorno.findFirstOrThrow({ where: { cota: { cota: '1' } } });
    const atual = await prisma.estorno.findFirstOrThrow({ where: { cota: { cota: '2' } } });
    expect(antigo.percentual.toFixed(2)).toBe('50.00');
    expect(antigo.valor.toFixed(2)).toBe('400.00');
    expect(atual.percentual.toFixed(2)).toBe('30.00');
    expect(atual.valor.toFixed(2)).toBe('240.00');
    // Não pode abrir vigência que tiraria a regra de estorno já apurado
    await expect(abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', titularVendedorId: null, percentual: '40', vigenteDe: D('2026-09-18') })).rejects.toThrow(/estorno apurado/);
  });

  it('categoria do documento: nova vigência, snapshot antigo intocado e trava contra reescrever venda apurada', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const v = await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '3', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '11222333000181' }]));
    // CPF não pode ser Veterano; CNPJ não pode ser Iniciante (regra da WR)
    await expect(alterarCategoria(admin, { vendedorId: v.id, categoriaId: cat.INICIANTE, vigenteDe: D('2026-10-01'), motivo: 'teste', promocao: false })).rejects.toThrow(/não é aceita/);
    // Promover a partir de data com venda apurada: recusado
    await expect(alterarCategoria(admin, { vendedorId: v.id, categoriaId: cat.EXPERT, vigenteDe: D('2026-09-01'), motivo: 'teste', promocao: true })).rejects.toThrow(/já foi apurada/);
    await alterarCategoria(admin, { vendedorId: v.id, categoriaId: cat.EXPERT, vigenteDe: D('2026-10-01'), motivo: 'meta atingida', promocao: true });
    const cota = await prisma.cota.findFirstOrThrow();
    expect(cota.snapCategoriaId).toBe(cat.VETERANO);
    expect(await prisma.auditLog.count({ where: { acao: 'PROMOCAO' } })).toBe(1);
    // Corrigir data: não pode atropelar o anterior nem tirar a regra da venda apurada
    const nova = await prisma.vendedorCategoria.findFirstOrThrow({ where: { vendedorId: v.id, categoriaId: cat.EXPERT } });
    await expect(corrigirInicioCategoria(admin, { vigenciaId: nova.id, novoInicio: D('2026-01-01'), motivo: 'erro' })).rejects.toThrow(/atropelaria/);
    await expect(corrigirInicioCategoria(admin, { vigenciaId: nova.id, novoInicio: D('2026-09-05'), motivo: 'erro' })).rejects.toThrow(/Tiraria a regra/);
    await corrigirInicioCategoria(admin, { vigenciaId: nova.id, novoInicio: D('2026-09-20'), motivo: 'data correta' });
    const anterior = await prisma.vendedorCategoria.findFirstOrThrow({ where: { vendedorId: v.id, categoriaId: cat.VETERANO } });
    expect(anterior.vigenteAte?.toISOString().slice(0, 10)).toBe('2026-09-19');
  });
});
