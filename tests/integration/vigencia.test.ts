import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { abrirVigenciaConfigEstorno, abrirVigenciaRegraEstorno, abrirVigenciaTabela, definirEscopoBase, simularTabela } from '@/servidor/servicos/regras';
import { alterarCategoria, corrigirInicioCategoria } from '@/servidor/servicos/vendedores';
import { corrigirRegraEstorno, excluirVigencia } from '@/servidor/servicos/vigencias';
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
    await abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', participante: null, titularVendedorId: null, percentual: '30', vigenteDe: D('2026-09-15') });
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
    await expect(abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', participante: null, titularVendedorId: null, percentual: '40', vigenteDe: D('2026-09-18') })).rejects.toThrow(/estorno apurado/);
  });

  it('percentual do estorno por categoria: Expert tem o próprio, Veterano segue o padrão; exceção do vendedor vence a categoria', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const vet = await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    await vendedor(admin, { nome: 'Bruno ME', tipo: 'CNPJ', doc: '11444777000161', categoriaId: cat.EXPERT, equipeId: est.equipeId });
    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    await abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', participante: 'EXPERT', titularVendedorId: null, percentual: '70', vigenteDe: D('2026-09-10') });
    await expect(abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', participante: 'NAO_EXISTE', titularVendedorId: null, percentual: '10', vigenteDe: D('2026-09-10') })).rejects.toThrow(/desconhecido/);
    await expect(abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', participante: 'EXPERT', titularVendedorId: vet.id, percentual: '10', vigenteDe: D('2026-09-10') })).rejects.toThrow(/não os dois/);
    await importar(admin, administradoraId, csv([
      { grupo: '4', cota: '1', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '20/09/2026' },
      { grupo: '4', cota: '2', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11444777000161', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '20/09/2026' },
      // Cancelada antes da vigência do percentual do Expert: usa o padrão
      { grupo: '4', cota: '3', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11444777000161', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '05/09/2026' },
    ]));
    const estornoDa = (cota: string) => prisma.estorno.findFirstOrThrow({ where: { cota: { cota }, destino: 'VENDEDOR', status: { not: 'INVALIDADO' } } });
    const [e1, e2, e3] = [await estornoDa('1'), await estornoDa('2'), await estornoDa('3')];
    expect(e1.percentual.toFixed(2)).toBe('50.00');
    expect(e2.percentual.toFixed(2)).toBe('70.00');
    expect(e2.valor.toFixed(2)).toBe(e2.comissaoBase.times(0.7).toFixed(2));
    expect((e2.memoria as { regra: { participante: string } }).regra.participante).toBe('EXPERT');
    expect(e3.percentual.toFixed(2)).toBe('50.00');

    // Exceção individual vence o percentual da categoria (e não reescreve o estorno já apurado)
    await abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', participante: null, titularVendedorId: vet.id, percentual: '20', vigenteDe: D('2026-09-21') });
    await importar(admin, administradoraId, csv([
      { grupo: '4', cota: '4', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '22/09/2026' },
    ]));
    expect((await estornoDa('4')).percentual.toFixed(2)).toBe('20.00');
    expect((await estornoDa('1')).percentual.toFixed(2)).toBe('50.00');
    // Sobreposição do mesmo tipo e categoria é barrada pelo banco
    await expect(prisma.regraEstorno.create({ data: { tipo: 'CANCELAMENTO', participante: 'EXPERT', percentual: '1', vigenteDe: D('2026-09-25') } })).rejects.toThrow();
  });

  it('vigência sem uso pode ser corrigida (inclusive para trás) ou excluída; usada, não', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const padrao = await prisma.regraEstorno.findFirstOrThrow({ where: { tipo: 'CANCELAMENTO', participante: null, titularVendedorId: null } });
    // Nova vigência 30% a partir de 15/09 e depois excluída: a de 50% volta a ficar aberta
    const nova = await abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', participante: null, titularVendedorId: null, percentual: '30', vigenteDe: D('2026-09-15') });
    expect((await prisma.regraEstorno.findUniqueOrThrow({ where: { id: padrao.id } })).vigenteAte).not.toBeNull();
    await excluirVigencia(admin, { entidade: 'REGRA_ESTORNO', id: nova.id, motivo: 'lançada errada' });
    expect((await prisma.regraEstorno.findUniqueOrThrow({ where: { id: padrao.id } })).vigenteAte).toBeNull();
    expect(await prisma.auditLog.count({ where: { entidade: 'RegraEstorno', entidadeId: nova.id, acao: 'EXCLUSAO' } })).toBe(1);

    // Corrigir para trás (a alteração real era anterior à carga) e com outro percentual
    await corrigirRegraEstorno(admin, { id: padrao.id, percentual: '40', vigenteDe: D('2025-06-01'), vigenteAte: null, motivo: 'regra vigente desde junho/2025' });

    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    await importar(admin, administradoraId, csv([
      { grupo: '5', cota: '1', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '20/09/2026' },
    ]));
    const e = await prisma.estorno.findFirstOrThrow({ where: { destino: 'VENDEDOR' } });
    expect(e.percentual.toFixed(2)).toBe('40.00');
    // Agora usada: não corrige nem exclui
    await expect(corrigirRegraEstorno(admin, { id: padrao.id, percentual: '45', vigenteDe: D('2025-06-01'), vigenteAte: null, motivo: 'tentativa' })).rejects.toThrow(/já foi usada/);
    await expect(excluirVigencia(admin, { entidade: 'REGRA_ESTORNO', id: padrao.id, motivo: 'tentativa' })).rejects.toThrow(/já foi usada/);
    await expect(excluirVigencia(admin, { entidade: 'CONFIG_ESTORNO', id: cfg.id, motivo: 'tentativa' })).rejects.toThrow(/já foi usada/);
  });

  it('regra com data passada é encaixada no histórico; mesma data substitui a não usada; recuperação com menos de 6 pagas', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    // Mesma data da regra em vigor (ainda não usada) = substitui, já com o escopo e a regra de recuperação
    await abrirVigenciaConfigEstorno(admin, { participantes: ['VETERANO', 'EXPERT'], criterioCancelamento: 'IGUAL', limiteParcelas: 1, criterioRecuperacao: 'ABAIXO_DE', limiteRecuperacao: 6, escopoBase: 'PARCELAS_RECEBIDAS', vigenteDe: cfg.vigenteDe });
    expect(await prisma.configuracaoEstorno.count()).toBe(1);
    await expect(abrirVigenciaConfigEstorno(admin, { participantes: ['VETERANO'], criterioCancelamento: 'IGUAL', limiteParcelas: 1, criterioRecuperacao: 'ABAIXO_DE', limiteRecuperacao: null, escopoBase: 'PARCELAS_RECEBIDAS', vigenteDe: D('2026-10-01') })).rejects.toThrow(/número de parcelas/);

    // Percentual 40% desde 2025-01-01 (antes do padrão atual de 50%): termina na véspera do atual
    const antigo = await abrirVigenciaRegraEstorno(admin, { tipo: 'CANCELAMENTO', participante: null, titularVendedorId: null, percentual: '40', vigenteDe: D('2025-01-01') });
    const atual = await prisma.regraEstorno.findFirstOrThrow({ where: { tipo: 'CANCELAMENTO', participante: null, vigenteDe: { gt: D('2025-01-01') } } });
    expect(antigo.vigenteAte?.getTime()).toBe(D('2025-12-31').getTime());
    expect(atual.vigenteDe.getTime()).toBe(D('2026-01-01').getTime());
    expect(atual.vigenteAte).toBeNull();

    const periodo = await prisma.periodoRecuperacao.count();
    expect(periodo).toBe(0);
    await importar(admin, administradoraId, csv([
      { grupo: '6', cota: '1', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '20/09/2026' },
    ]));
    expect((await prisma.estorno.findFirstOrThrow({ where: { destino: 'VENDEDOR' } })).percentual.toFixed(2)).toBe('50.00');
  });

  it('flex reduz a base (Flex 10 = 90%, Flex 30 = 70%); venda sem flex é Integral; não existe Flex 100', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    expect(await prisma.modalidadeFlex.count({ where: { codigo: 'FLEX100' } })).toBe(0);
    await importar(admin, administradoraId, csv([
      { grupo: '7', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725', flex: 'FLEX 10' },
      { grupo: '7', cota: '2', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725', flex: 'FLEX 30' },
      { grupo: '7', cota: '3', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725', flex: '' },
    ]));
    const primeira = async (cota: string) => {
      const c = await prisma.cota.findFirstOrThrow({ where: { grupo: '7', cota } });
      return (await comissoesDa(c.id)).find((x) => x.destino === 'VENDEDOR' && x.parcela === 1)?.valor.toFixed(2);
    };
    // Iniciante Imóveis, 1ª parcela 0,50%
    expect(await primeira('1')).toBe('450.00'); // 100.000 × 90% × 0,50%
    expect(await primeira('2')).toBe('350.00'); // 100.000 × 70% × 0,50%
    expect(await primeira('3')).toBe('500.00'); // sem flex = Integral: 100.000 × 100% × 0,50%
  });

  it('categoria do documento: nova vigência, snapshot antigo intocado e trava contra reescrever venda apurada', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const v = await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '3', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '11222333000181' }]));
    // CPF não pode ser Veterano; CNPJ não pode ser Iniciante (regra da WR)
    await expect(alterarCategoria(admin, { vendedorId: v.id, categoriaId: cat.INICIANTE, vigenteDe: D('2026-10-01'), motivo: 'teste', promocao: false })).rejects.toThrow(/não é aceita/);
    // Promover a partir de data com venda apurada: recusado
    await expect(alterarCategoria(admin, { vendedorId: v.id, categoriaId: cat.EXPERT, vigenteDe: D('2026-09-01'), motivo: 'teste', promocao: true })).rejects.toThrow(/já foi calculada/);
    await alterarCategoria(admin, { vendedorId: v.id, categoriaId: cat.EXPERT, vigenteDe: D('2026-10-01'), motivo: 'meta atingida', promocao: true });
    const cota = await prisma.cota.findFirstOrThrow();
    expect(cota.snapCategoriaId).toBe(cat.VETERANO);
    expect(await prisma.auditLog.count({ where: { acao: 'PROMOCAO' } })).toBe(1);
    // Corrigir data: não pode atropelar o anterior nem tirar a regra da venda apurada
    const nova = await prisma.vendedorCategoria.findFirstOrThrow({ where: { vendedorId: v.id, categoriaId: cat.EXPERT } });
    await expect(corrigirInicioCategoria(admin, { vigenciaId: nova.id, novoInicio: D('2026-01-01'), motivo: 'erro' })).rejects.toThrow(/passaria por cima/);
    await expect(corrigirInicioCategoria(admin, { vigenciaId: nova.id, novoInicio: D('2026-09-05'), motivo: 'erro' })).rejects.toThrow(/Tiraria a regra/);
    await corrigirInicioCategoria(admin, { vigenciaId: nova.id, novoInicio: D('2026-09-20'), motivo: 'data correta' });
    const anterior = await prisma.vendedorCategoria.findFirstOrThrow({ where: { vendedorId: v.id, categoriaId: cat.VETERANO } });
    expect(anterior.vigenteAte?.toISOString().slice(0, 10)).toBe('2026-09-19');
  });
});
