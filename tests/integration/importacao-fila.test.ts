import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { processarFila, enfileirarApuracao } from '@/servidor/fila';
import { receberArquivo, reconciliarBonus } from '@/servidor/importacao';
import { definirEscopoBase } from '@/servidor/servicos/regras';
import { transferirVenda } from '@/servidor/servicos/cotas';
import { cancelamentosDoRelatorio } from '@/servidor/consultas/estornos';
import { periodoDoMes } from '@/lib/datas';
import { apurarTudo, csv, estrutura, importar, preparar, vendedor } from './ajuda';

const PDF = new Uint8Array(Buffer.from('%PDF-1.4 conteúdo de teste'));

describe('importações', () => {
  it('arquivo não reconhecido pelo conteúdo é recusado (nome não importa)', async () => {
    const { admin, administradoraId } = await preparar();
    await expect(receberArquivo(admin, { administradoraId, nomeArquivo: 'base.csv', bytes: new Uint8Array(Buffer.from('x,y\n1,2\n')) })).rejects.toThrow(/reconhecer/);
    await expect(receberArquivo(admin, { administradoraId, nomeArquivo: 'CV056E.pdf', bytes: PDF }, { extrairPdf: async () => ['RELATÓRIO QUALQUER'] })).rejects.toThrow(/reconhecer/);
  });

  it('CV056E: cancelamento (negativo) cancela a venda ativa, gera o estorno do vendedor pelas regras e é comparado com o da WR; reimportar não duplica', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'A');
    await vendedor(admin, { nome: 'Carla ME', tipo: 'CNPJ', doc: '11222333000181', categoriaId: cat.VETERANO, equipeId: est.equipeId });
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId });
    const cfg = await prisma.configuracaoEstorno.findFirstOrThrow();
    await definirEscopoBase(admin, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });
    // Na base as duas vendas ainda estão ATIVAS com 1 parcela paga.
    const base = csv([
      { grupo: '1564', cota: '969', contrato: '12345I10', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL' },
      { grupo: '1564', cota: '970', contrato: '12346I10', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '52998224725', flex: 'INTEGRAL' },
    ]);
    await importar(admin, administradoraId, base);
    const linhas = [
      'SERVOPA ADMINISTRADORA DE CONSORCIOS LTDA CV056E HORA: 20:12 PAGINA: 1',
      'VENDEDOR (CPF/CNPJ): 11.222.333/0001-81 - CARLA ME',
      '12345I10 E CLIENTE 1564/969 / 31 90000.0000',
      '1564.0969.1 CREDITO P/IMOVEL 7 100.000,00 1.000,00- 0,00 0,00 1,0000',
      'CANCELAMENTO DE PLANO 22/09/2026 01/09/2026 I',
      'Total do Vendedor ......: 1.000,00- 0,00 0,00',
      'VENDEDOR (CPF/CNPJ): 529.982.247-25 - ANA',
      '12346I10 E CLIENTE 1564/970 / 31 90000.0000',
      '1564.0970.1 CREDITO P/IMOVEL 7 100.000,00 1.000,00- 0,00 0,00 1,0000',
      'CANCELAMENTO DE PLANO 22/09/2026 01/09/2026 I',
      '12347I10 E CLIENTE FORA DA CARTEIRA / 31 90000.0000',
      '1564.0999.1 CREDITO P/IMOVEL 7 100.000,00 50,00 1.500,00 0,00 0,00 1,5000',
      'INCLUSAO DE PLANO 22/09/2026 20/09/2026 I',
      'Total do Vendedor ......: 500,00 0,00 0,00',
    ];
    const r = await importar(admin, administradoraId, PDF, 'fechamento.pdf', async () => linhas);
    expect(r.tipo).toBe('FECHAMENTO_CV056E');
    expect(r.diferencaConferencia).toBe('0');
    const lanc = await prisma.lancamentoAdministradora.findMany({ orderBy: { cota: 'asc' } });
    expect(lanc.map((l) => `${l.cota}|${l.tipo}|${l.parcela}|${l.valor.toFixed(2)}|${l.cotaId ? 'vinculada' : 'sem vínculo'}`)).toEqual([
      '969|CANCELAMENTO|null|-1000.00|vinculada', '970|CANCELAMENTO|null|-1000.00|vinculada', '999|COMISSAO_PARCELA|1|1500.00|sem vínculo',
    ]);
    const vet = await prisma.cota.findFirstOrThrow({ where: { cota: '969' } });
    expect(vet.cancelada).toBe(true);
    expect(vet.dataCancelamento?.toISOString().slice(0, 10)).toBe('2026-09-22');
    // Estorno do vendedor pela regra do SISTEMA (50% da comissão de 0,8% = R$ 400), não o valor da WR (R$ 1.000).
    const e = await prisma.estorno.findFirstOrThrow({ where: { cotaId: vet.id } });
    expect(e.valor.toFixed(2)).toBe('400.00');
    expect(e.dataDebitoAdm?.toISOString().slice(0, 10)).toBe('2026-09-22');
    expect(await prisma.estorno.count({ where: { cota: { cota: '970' } } })).toBe(0); // Iniciante não devolve

    const rel = await cancelamentosDoRelatorio(admin, periodoDoMes('2026-09')!);
    expect(rel.itens.map((i) => `${i.cota}|${i.estornoWr.toFixed(2)}|${i.estornoVendedor.toFixed(2)}`).sort()).toEqual(['969|1000.00|400.00', '970|1000.00|0.00']);
    expect(rel.itens.find((i) => i.cota === '970')?.situacao).toMatch(/Sem estorno do vendedor pelas regras \(Iniciante · 1 parcela/);

    // Base atrasada (venda ainda "ativa", com outra mudança) não desfaz o cancelamento do relatório.
    await importar(admin, administradoraId, csv([
      { grupo: '1564', cota: '969', contrato: '12345I10', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL', cliente: 'NOME NOVO' },
    ]));
    expect((await prisma.cota.findUniqueOrThrow({ where: { id: vet.id } })).cancelada).toBe(true);

    await importar(admin, administradoraId, PDF, 'fechamento.pdf', async () => linhas);
    expect(await prisma.lancamentoAdministradora.count()).toBe(3);

    const div = await importar(admin, administradoraId, new Uint8Array(Buffer.from('%PDF-1.4 outro')), 'fech2.pdf', async () => [...linhas.slice(0, 5), 'Total do Vendedor ......: 999,00 0,00 0,00']);
    expect(div.diferencaConferencia).toBe('1999');
    expect(await prisma.notificacao.count({ where: { tipo: 'DIVERGENCIA_IMPORTACAO' } })).toBeGreaterThan(0);
  });

  it('GC070A: bônus é da WR, atribuição congelada na importação e não reescrita pela transferência; sem vínculo pode ser reconciliado', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const A = await estrutura(admin, 'A');
    const B = await estrutura(admin, 'B');
    await vendedor(admin, { nome: 'Ana', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: A.equipeId });
    const vb = await vendedor(admin, { nome: 'Bruno', tipo: 'CPF', doc: '11144477735', categoriaId: cat.INICIANTE, equipeId: B.equipeId });
    await importar(admin, administradoraId, csv([{ grupo: '1500', cota: '10', contrato: '99887I66', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '52998224725' }]));
    const bonus = [
      'SERVOPA ADMINISTRADORA DE CONSORCIOS LTDA GC070A HORA: 22:46 PAGINA: 1',
      '1500.0010-1 99887I66 CLIENTE TESTE P 001 01/09/2026 1.000,00 2,50 25,00 50,00',
      '1500.0077-2 11112I22 OUTRO CLIENTE P 002 02/09/2026 400,00 2,50 10,00',
      'TOTAL DO SEGMENTO: 35,00',
    ];
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
    await importar(admin, administradoraId, csv([{ grupo: '1500', cota: '77', contrato: '11112I22', credito: '50.000,00', venda: '02/09/2026', pagas: 0, docVendedor: '11144477735' }]));
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
