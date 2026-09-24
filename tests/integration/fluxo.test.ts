import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { fecharFolha, marcarFolhaPaga } from '@/servidor/servicos/folha';
import { definirEscopoBase } from '@/servidor/servicos/regras';
import { movimentarEstorno } from '@/servidor/servicos/estornos';
import { resolverDivergencia, transferirVenda } from '@/servidor/servicos/cotas';
import { vincularNomeImportado } from '@/servidor/servicos/vendedores';
import { apurarTudo, comissoesDa, csv, D, estrutura, importar, preparar, valores, vendedor } from './ajuda';

describe('fluxo financeiro completo', () => {
  it('importa, casa vendedor por documento, congela, apura e libera pela parcela paga', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const ana = await vendedor(admin, { nome: 'Ana Paula Souza', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });

    const r = await importar(admin, administradoraId, csv([
      { grupo: '1564', cota: '969', credito: '100.000,00', venda: '10/09/2026', pagas: 1, vendedor: 'NOME DIFERENTE', docVendedor: '529.982.247-25' },
      { grupo: '1564', cota: '970', credito: '80.000,00', venda: '11/09/2026', pagas: 0, vendedor: 'FULANO SEM CADASTRO' },
    ]));
    expect(r.tipo).toBe('CARTEIRA_CSV');
    const cotaA = await prisma.cota.findFirstOrThrow({ where: { grupo: '1564', cota: '969' } });
    // Snapshot congelado com os oito campos
    expect(cotaA.snapVendedorId).toBe(ana.id);
    expect(cotaA.snapCategoriaId).toBe(cat.INICIANTE);
    expect(cotaA.snapEquipeId).toBe(est.equipeId);
    expect(cotaA.snapGerenciaId).toBe(est.gerenciaId);
    expect(cotaA.snapSupervisorPessoaId).toBe(est.supervisorPessoaId);
    expect(cotaA.snapGerentePessoaId).toBe(est.gerentePessoaId);
    expect(cotaA.snapPagaPelaWr).toBe(true);

    // Iniciante Imóveis: 0,5/0,4/0,3/0,3 · Supervisão 0,3/—/0,1/0,1 · Gerência 0,3 — base = 100.000 × 50% = 50.000
    expect(valores(await comissoesDa(cotaA.id))).toEqual([
      'VENDEDOR:1:250.00:LIBERADA', 'VENDEDOR:2:200.00:PREVISTA', 'VENDEDOR:3:150.00:PREVISTA', 'VENDEDOR:4:150.00:PREVISTA',
      'SUPERVISAO:1:150.00:LIBERADA', 'SUPERVISAO:3:50.00:PREVISTA', 'SUPERVISAO:4:50.00:PREVISTA',
      'GERENCIA:1:150.00:LIBERADA',
    ]);
    const c1 = (await comissoesDa(cotaA.id))[0];
    expect(c1?.parcelasPagasNaLiberacao).toBe(1);
    expect((c1?.memoria as { formula: string }).formula).toContain('= R$ 250,00');

    // Vendedor sem cadastro: pendência, sem comissão
    const cotaB = await prisma.cota.findFirstOrThrow({ where: { grupo: '1564', cota: '970' } });
    expect(await comissoesDa(cotaB.id)).toHaveLength(0);
    expect((await prisma.pendencia.findMany({ where: { cotaId: cotaB.id, resolvidaEm: null } })).map((p) => p.tipo)).toContain('VENDEDOR_SEM_CADASTRO');

    // Decisão registrada: o nome da importação é da Ana → vincula e apura
    await vincularNomeImportado(admin, { nomeImportado: 'FULANO SEM CADASTRO', vendedorId: ana.id });
    await apurarTudo();
    expect((await comissoesDa(cotaB.id)).length).toBeGreaterThan(0);
    expect(await prisma.pendencia.count({ where: { cotaId: cotaB.id, resolvidaEm: null, tipo: 'VENDEDOR_SEM_CADASTRO' } })).toBe(0);
  });

  it('reimportar a mesma base não duplica; mudança atualiza com versão e libera a parcela nova', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    const base = [{ grupo: '10', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725' }];
    await importar(admin, administradoraId, csv(base));
    const segunda = await importar(admin, administradoraId, csv(base));
    expect(segunda.jaEnviadoAntes).toBe(true);
    expect(await prisma.cota.count()).toBe(1);
    const imp2 = await prisma.importacao.findUniqueOrThrow({ where: { id: segunda.importacaoId } });
    expect(imp2.repetidos).toBe(1);
    expect(imp2.novos).toBe(0);
    const cota = await prisma.cota.findFirstOrThrow();
    const antes = await comissoesDa(cota.id);

    await importar(admin, administradoraId, csv([{ ...base[0]!, pagas: 2 }]));
    expect(await prisma.cota.count()).toBe(1);
    expect(await prisma.cotaVersao.count({ where: { cotaId: cota.id } })).toBe(2);
    const depois = await comissoesDa(cota.id);
    expect(depois.map((c) => c.id)).toEqual(antes.map((c) => c.id)); // mesmas linhas (nada recriado)
    expect(depois.find((c) => c.destino === 'VENDEDOR' && c.parcela === 2)?.status).toBe('LIBERADA');
    expect(depois.find((c) => c.destino === 'VENDEDOR' && c.parcela === 2)?.parcelasPagasNaLiberacao).toBe(2);
  });

  it('folha fecha só o liberado pago pela WR, congela e é marcada paga; correção posterior vira ajuste', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const ana = await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    const bruno = await vendedor(admin, { nome: 'Bruno', tipo: 'CPF', doc: '11144477735', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '10', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 1, docVendedor: '52998224725' }]));
    const cota = await prisma.cota.findFirstOrThrow();

    const folha = await fecharFolha(admin, { competencia: '2026-09' });
    expect(folha.quantidade).toBe(3); // vendedor, supervisão e gerência da 1ª parcela
    expect(folha.total.toFixed(2)).toBe('550.00');
    await expect(fecharFolha(admin, { competencia: '2026-09' })).rejects.toThrow(/Não há comissão liberada/);
    await marcarFolhaPaga(admin, { folhaId: folha.id, dataPagamento: D('2026-09-30'), valorPago: '550.00', referencia: 'TED 123', observacao: null });
    expect((await prisma.comissaoApurada.findMany({ where: { folhaId: folha.id } })).every((c) => c.status === 'PAGA')).toBe(true);

    // Transferência depois de paga: a linha paga NÃO muda; entram ajustes (-250 Ana, +250 Bruno)
    await transferirVenda(admin, { cotaId: cota.id, vendedorNovoId: bruno.id, motivo: 'venda era do Bruno' });
    await apurarTudo();
    const vend1 = await prisma.comissaoApurada.findMany({ where: { cotaId: cota.id, destino: 'VENDEDOR', parcela: 1, status: { not: 'CANCELADA' } }, orderBy: { criadoEm: 'asc' } });
    const original = vend1.find((c) => c.ajusteDeId === null);
    expect(original?.status).toBe('PAGA');
    expect(original?.titularVendedorId).toBe(ana.id);
    const ajustes = vend1.filter((c) => c.ajusteDeId !== null).map((c) => `${c.titularVendedorId === ana.id ? 'ana' : 'bruno'}:${c.valor.toFixed(2)}`).sort();
    expect(ajustes).toEqual(['ana:-250.00', 'bruno:250.00']);
    expect(await prisma.cotaTransferencia.count({ where: { cotaId: cota.id } })).toBe(1);
    // Parcelas não pagas foram canceladas e recriadas para o Bruno (histórico mantido)
    const p2 = await prisma.comissaoApurada.findMany({ where: { cotaId: cota.id, destino: 'VENDEDOR', parcela: 2 } });
    expect(p2.map((c) => `${c.status}:${c.titularVendedorId === bruno.id ? 'bruno' : 'ana'}`).sort()).toEqual(['CANCELADA:ana', 'PREVISTA:bruno']);
    // Folha fechada é imutável no banco
    await expect(prisma.folhaComissao.update({ where: { id: folha.id }, data: { total: '1' } })).rejects.toThrow();
  });

  it('cancelamento de veterano gera estorno pela regra (escopo indefinido vira pendência até ser definido) e segue o ciclo', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const linha = { grupo: '20', cota: '5', credito: '200.000,00', venda: '05/09/2026', pagas: 1, docVendedor: '11.222.333/0001-81', flex: 'INTEGRAL' };
    await importar(admin, administradoraId, csv([linha]));
    const cota = await prisma.cota.findFirstOrThrow();
    // Veterano: paga pela administradora (base do estorno) — 200.000 × 0,8% = 1.600; gerência 0,3% = 600 pela WR
    expect(valores(await comissoesDa(cota.id))).toEqual([
      'VENDEDOR:1:1600.00:LIBERADA', 'VENDEDOR:3:800.00:PREVISTA', 'VENDEDOR:4:800.00:PREVISTA', 'VENDEDOR:6:800.00:PREVISTA', 'GERENCIA:1:600.00:LIBERADA',
    ]);
    expect((await comissoesDa(cota.id)).find((c) => c.destino === 'VENDEDOR')?.pagaPelaWr).toBe(false);

    await importar(admin, administradoraId, csv([{ ...linha, situacao: 'CANCELADO', cancelamento: '20/09/2026' }]));
    expect(await prisma.estorno.count()).toBe(0);
    expect(await prisma.pendencia.count({ where: { cotaId: cota.id, tipo: 'ESTORNO_SEM_CONFIGURACAO', resolvidaEm: null } })).toBe(1);
    // Parcelas futuras da venda cancelada são canceladas (nunca serão pagas)
    expect(valores(await comissoesDa(cota.id))).toEqual(['VENDEDOR:1:1600.00:LIBERADA', 'GERENCIA:1:600.00:LIBERADA']);

    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    await apurarTudo();
    const estornos = await prisma.estorno.findMany();
    expect(estornos).toHaveLength(1); // gerência não participa (configuração)
    expect(estornos[0]).toMatchObject({ destino: 'VENDEDOR', tipo: 'CANCELAMENTO', status: 'A_COBRAR', parcelasPagas: 1 });
    expect(estornos[0]?.comissaoBase.toFixed(2)).toBe('1600.00');
    expect(estornos[0]?.valor.toFixed(2)).toBe('800.00');
    expect(estornos[0]?.dataEvento.toISOString().slice(0, 10)).toBe('2026-09-20');

    // Reapurar não cobra duas vezes
    await importar(admin, administradoraId, csv([{ ...linha, situacao: 'CANCELADO', cancelamento: '20/09/2026', cliente: 'NOME CORRIGIDO' }]));
    expect(await prisma.estorno.count({ where: { status: { not: 'INVALIDADO' } } })).toBe(1);

    // Ciclo: a cobrar → em cobrança → quitado; estorno cobrado nunca é invalidado
    const e = estornos[0]!;
    await movimentarEstorno(admin, { estornoId: e.id, para: 'EM_COBRANCA', forma: 'DESCONTO_EM_FOLHA', referencia: 'folha out/26', motivo: 'combinado com o vendedor' });
    await movimentarEstorno(admin, { estornoId: e.id, para: 'QUITADO', valor: '800.00', referencia: 'recibo 9', motivo: 'quitado' });
    await expect(movimentarEstorno(admin, { estornoId: e.id, para: 'PERDOADO', motivo: 'tentativa' })).rejects.toThrow();
    await expect(prisma.estorno.update({ where: { id: e.id }, data: { status: 'INVALIDADO', invalidadoEm: new Date() } })).rejects.toThrow();
    expect(await prisma.estornoMovimento.count({ where: { estornoId: e.id } })).toBe(3);
  });

  it('venda em recuperação: estorno por recuperação mesmo fora do critério de parcelas', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const v = await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    await prisma.periodoRecuperacao.create({ data: { vendedorId: v.id, inicio: D('2026-09-01'), fim: D('2026-09-30') } });
    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    const linha = { grupo: '30', cota: '1', credito: '100.000,00', venda: '10/09/2026', pagas: 3, docVendedor: '11222333000181', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '25/09/2026' };
    await importar(admin, administradoraId, csv([linha]));
    const cota = await prisma.cota.findFirstOrThrow();
    expect(cota.snapRecuperacao).toBe(true);
    const e = await prisma.estorno.findFirstOrThrow();
    // parcelas recebidas: 1ª (0,8%) + 3ª (0,4%) de 100.000 = 1.200 × 50% = 600
    expect(e.tipo).toBe('RECUPERACAO');
    expect(e.comissaoBase.toFixed(2)).toBe('1200.00');
    expect(e.valor.toFixed(2)).toBe('600.00');
  });

  it('vendedor corrigido pela administradora vira divergência visível, nunca troca em silêncio', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    const ana = await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    const bruno = await vendedor(admin, { nome: 'Bruno', tipo: 'CPF', doc: '11144477735', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    const linha = { grupo: '40', cota: '1', credito: '50.000,00', venda: '10/09/2026', pagas: 0, docVendedor: '52998224725' };
    await importar(admin, administradoraId, csv([linha]));
    await importar(admin, administradoraId, csv([{ ...linha, docVendedor: '11144477735', vendedor: 'BRUNO' }]));
    const cota = await prisma.cota.findFirstOrThrow();
    expect(cota.vendedorId).toBe(ana.id);
    const div = await prisma.divergenciaVendedor.findFirstOrThrow();
    expect(div.status).toBe('ABERTA');
    expect(await prisma.notificacao.count({ where: { tipo: 'VENDEDOR_CORRIGIDO' } })).toBeGreaterThan(0);
    await resolverDivergencia(admin, { id: div.id, decisao: 'ACEITAR', observacao: 'confirmado' });
    await apurarTudo();
    expect((await prisma.cota.findFirstOrThrow()).vendedorId).toBe(bruno.id);
    expect(await prisma.cotaTransferencia.count({ where: { origem: 'DIVERGENCIA_IMPORTACAO' } })).toBe(1);
  });
});
