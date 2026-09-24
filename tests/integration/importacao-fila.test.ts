import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { processarFila, enfileirarApuracao } from '@/servidor/fila';
import { receberArquivo, reconciliarBonus } from '@/servidor/importacao';
import { definirEscopoBase } from '@/servidor/servicos/regras';
import { transferirVenda } from '@/servidor/servicos/cotas';
import { apurarTudo, csv, estrutura, importar, preparar, vendedor } from './ajuda';

const PDF = new Uint8Array(Buffer.from('%PDF-1.4 conteúdo de teste'));

describe('importações', () => {
  it('arquivo não reconhecido pelo conteúdo é recusado (nome não importa)', async () => {
    const { admin, administradoraId } = await preparar();
    await expect(receberArquivo(admin, { administradoraId, nomeArquivo: 'base.csv', bytes: new Uint8Array(Buffer.from('x,y\n1,2\n')) })).rejects.toThrow(/reconhecer/);
    await expect(receberArquivo(admin, { administradoraId, nomeArquivo: 'CV056E.pdf', bytes: PDF }, { extrairPdf: async () => ['RELATÓRIO QUALQUER'] })).rejects.toThrow(/reconhecer/);
  });

  it('CV056E: lançamento de cancelamento dá a competência da cobrança do estorno; reimportar não duplica; divergência de conferência notificada', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    await importar(admin, administradoraId, csv([{ grupo: '1564', cota: '969', contrato: '12345678', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL', situacao: 'CANCELADO', cancelamento: '20/09/2026' }]));
    const linhas = [
      'SERVOPA — CV056E FECHAMENTO',
      '1564 0969 12345678 CLIENTE TESTE 1 CANCELAMENTO DE PLANO 22/09/2026 250,00-',
      '1564 0969 12345678 CLIENTE TESTE 1 COMISSAO PARCELA 05/09/2026 500,00',
      'TOTAL GERAL 250,00',
    ];
    const r = await importar(admin, administradoraId, PDF, 'fechamento.pdf', async () => linhas);
    expect(r.tipo).toBe('FECHAMENTO_CV056E');
    expect(r.diferencaConferencia).toBe('0');
    const lanc = await prisma.lancamentoAdministradora.findMany({ orderBy: { tipo: 'asc' } });
    expect(lanc.map((l) => `${l.tipo}|${l.tipoOrigemTexto}|${l.valor.toFixed(2)}`).sort()).toEqual(['CANCELAMENTO|CANCELAMENTO DE PLANO|-250.00', 'COMISSAO_PARCELA|COMISSAO PARCELA|500.00']);
    expect(lanc.every((l) => l.cotaId !== null)).toBe(true);
    const e = await prisma.estorno.findFirstOrThrow();
    expect(e.dataDebitoAdm?.toISOString().slice(0, 10)).toBe('2026-09-22');

    await importar(admin, administradoraId, PDF, 'fechamento.pdf', async () => linhas);
    expect(await prisma.lancamentoAdministradora.count()).toBe(2);

    const div = await importar(admin, administradoraId, new Uint8Array(Buffer.from('%PDF-1.4 outro')), 'fech2.pdf', async () => [...linhas.slice(0, 3), 'TOTAL GERAL 999,00']);
    expect(div.diferencaConferencia).toBe('749');
    expect(await prisma.notificacao.count({ where: { tipo: 'DIVERGENCIA_IMPORTACAO' } })).toBeGreaterThan(0);
  });

  it('GC070A: bônus é da WR, atribuição congelada na importação e não reescrita pela transferência; sem vínculo pode ser reconciliado', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const A = await estrutura(admin, 'A');
    const B = await estrutura(admin, 'B');
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: A.equipeId });
    const vb = await vendedor(admin, { nome: 'Bruno', tipo: 'CPF', doc: '11144477735', categoriaId: cat.INICIANTE, equipeId: B.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '1500', cota: '10', contrato: '99887766', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '52998224725' }]));
    const bonus = ['GC070A BONUS INCENTIVO', 'CLIENTE TESTE 1500 0010 99887766 ANA 1 1.000,00 2,5 25,00', 'OUTRO CLIENTE 1500 0077 11112222 2 400,00 2,5 10,00', 'TOTAL GERAL 35,00'];
    const r = await importar(admin, administradoraId, PDF, 'bonus.pdf', async () => bonus);
    expect(r.tipo).toBe('BONUS_GC070A');
    const b1 = await prisma.bonusIncentivo.findFirstOrThrow({ where: { cota: '10' } });
    expect(b1.gerenciaId).toBe(A.gerenciaId);
    expect(b1.valorBonus.toFixed(2)).toBe('25.00');
    expect(await prisma.comissaoApurada.count({ where: { valor: '25' } })).toBe(0); // não vira comissão de ninguém
    const cota = await prisma.cota.findFirstOrThrow();
    await transferirVenda(admin, { cotaId: cota.id, vendedorNovoId: vb.id, motivo: 'correção' });
    await apurarTudo();
    expect((await prisma.bonusIncentivo.findUniqueOrThrow({ where: { id: b1.id } })).gerenciaId).toBe(A.gerenciaId);
    // Sem vínculo → reconciliado depois que a cota chega
    expect((await prisma.bonusIncentivo.findFirstOrThrow({ where: { cota: '77' } })).cotaId).toBeNull();
    await importar(admin, administradoraId, csv([{ grupo: '1500', cota: '77', contrato: '11112222', credito: '50.000,00', venda: '02/09/2026', pagas: 0, docVendedor: '11144477735' }]));
    const rec = await reconciliarBonus(admin);
    expect(rec.reconciliados).toBe(1);
    expect((await prisma.bonusIncentivo.findFirstOrThrow({ where: { cota: '77' } })).gerenciaId).toBe(B.gerenciaId);
  });
});

describe('fila de recálculo', () => {
  it('uma falha não interrompe o lote, registra a tentativa e agenda nova tentativa com espera', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '1', cota: '1', credito: '10.000,00', venda: '01/09/2026', pagas: 0, docVendedor: '52998224725' }]));
    const cota = await prisma.cota.findFirstOrThrow();
    await prisma.eventoDominio.create({ data: { tipo: 'APURAR_COTA', payload: {} } }); // sem cota: vai falhar
    await enfileirarApuracao(prisma, cota.id, 'teste');
    await enfileirarApuracao(prisma, cota.id, 'duplicado'); // idempotente
    expect(await prisma.eventoDominio.count({ where: { status: 'PENDENTE' } })).toBe(2);
    const r = await processarFila(10);
    expect(r).toMatchObject({ processados: 2, concluidos: 1, falhas: 1 });
    const falho = await prisma.eventoDominio.findFirstOrThrow({ where: { cotaId: null } });
    expect(falho.status).toBe('PENDENTE');
    expect(falho.tentativas).toBe(1);
    expect(falho.proximaTentativaEm.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.eventoEntrega.count({ where: { eventoId: falho.id, sucesso: false } })).toBe(1);
    expect((await processarFila(10)).processados).toBe(0); // respeita a espera
  });
});
