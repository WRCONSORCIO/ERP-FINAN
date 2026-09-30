import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodificarTexto, lerCsv } from '@/dominio/importacao/csv';
import { hashLinhaCarteira, lerCarteira, pareceCarteira } from '@/dominio/importacao/carteira';
import { lerRelatorioPdf } from '@/dominio/importacao/pdf';
import { detectarTipoPdf } from '@/dominio/importacao/deteccao';
import { LAYOUT_CARTEIRA_INICIAL, LAYOUT_CV056E_INICIAL, LAYOUT_CV069E_INICIAL, LAYOUT_GC070A_INICIAL } from '@/dominio/importacao/layouts';

const bytes = new Uint8Array(readFileSync('tests/fixtures/carteira-sintetica.csv'));

describe('base de clientes (CSV Latin-1, ;)', () => {
  it('decodifica Latin-1 e reconhece pelo conteúdo', () => {
    const texto = decodificarTexto(bytes);
    expect(texto).toContain('VALOR DO CRÉDITO');
    expect(pareceCarteira(texto, LAYOUT_CARTEIRA_INICIAL)).toBe(true);
    expect(pareceCarteira('a,b,c\n1,2,3', LAYOUT_CARTEIRA_INICIAL)).toBe(false);
  });
  it('lê as 40 linhas, marca canceladas e preserva dinheiro como texto decimal', () => {
    const r = lerCarteira(decodificarTexto(bytes), LAYOUT_CARTEIRA_INICIAL);
    expect(r.faltando).toEqual([]);
    expect(r.linhas).toHaveLength(40);
    expect(r.erros).toHaveLength(0);
    const l = r.linhas[0]?.dados;
    expect(l?.credito).toMatch(/^\d+(\.\d+)?$/);
    expect(r.linhas.filter((x) => x.dados.cancelada)).toHaveLength(3);
    expect(r.linhas.find((x) => x.dados.cancelada)?.dados.dataCancelamento).toBe('2026-09-15');
  });
  it('linha inválida vai para a lista de erros com o conteúdo original (nada some)', () => {
    const csv = 'NOME;CPF;GRUPO;COTA;CONTRATO;CREDITO;DATA VENDA;PARCELAS PAGAS;SITUACAO;VENDEDOR\nFULANO;123;1500;1;99;abc;01/09/2026;0;ATIVO;X\n';
    const r = lerCarteira(csv, LAYOUT_CARTEIRA_INICIAL);
    expect(r.linhas).toHaveLength(0);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]?.original).toContain('FULANO');
  });
  it('coluna obrigatória ausente é informada', () => {
    const r = lerCarteira('GRUPO;COTA;CPF;CREDITO\n1;2;3;4\n', LAYOUT_CARTEIRA_INICIAL);
    expect(r.faltando).toContain('contrato');
  });
  it('hash de conteúdo é estável e muda quando a linha muda', () => {
    const r = lerCarteira(decodificarTexto(bytes), LAYOUT_CARTEIRA_INICIAL);
    const a = r.linhas[0]?.dados;
    if (!a) throw new Error('sem linha');
    expect(hashLinhaCarteira(a)).toBe(hashLinhaCarteira({ ...a }));
    expect(hashLinhaCarteira(a)).not.toBe(hashLinhaCarteira({ ...a, parcelasPagas: a.parcelasPagas + 1 }));
  });
  it('CSV com aspas e ; dentro do campo', () => {
    expect(lerCsv('a;"b;c";"d ""e"""\n')).toEqual([['a', 'b;c', 'd "e"']]);
  });
});

describe('base de clientes no layout da Servopa (DT_VENDA, NR_GRUPO, TX_FLEX...)', () => {
  const cab = 'DT_VENDA;NR_GRUPO;NR_COTA;NR_CONTRATO;DS_SITUACAO;VL_CREDITO;DS_SEGMENTO;QT_PARCELAS_PAGAS;NM_CPFCNPJ_CONSORCIADO;NM_CONSORCIADO;ST_FLEX;TX_FLEX;NM_CPFCNPJ_VENDEDOR;NM_VENDEDOR;DT_CANCELAMENTO';
  const texto = [
    cab,
    '28/08/2026;1578;0720-7;80084I10  ;ATIVO     ;R$100.000,00      ;IMOVEL    ;001;529.982.247-25    ;CLIENTE UM   ;S;50   ;11.222.333/0001-81;11.222.333 FULANO ;          ',
    '01/09/2026;1577;0848-9;84973I10  ;ATIVO     ;R$150.000,00      ;MOVEL     ;002;111.444.777-35    ;CLIENTE DOIS ;N;     ;529.982.247-25;BELTRANO ;          ',
    '31/08/2026;1575;1312-2;84000I10  ;ESTORNADO ;R$80.000,00       ;IMOVEL    ;000;529.982.247-25    ;CLIENTE TRES ;S;10   ;529.982.247-25;BELTRANO ;23/09/2026',
  ].join('\r\n');
  it('lê todas as colunas, flex só com o número e ESTORNADO como cancelada', () => {
    const r = lerCarteira(texto, LAYOUT_CARTEIRA_INICIAL);
    expect(r.faltando).toEqual([]);
    expect(r.erros).toEqual([]);
    const [a, b, c] = r.linhas.map((l) => l.dados);
    expect(a).toMatchObject({ grupo: '1578', cota: '720', contrato: '80084I10', credito: '100000', parcelasPagas: 1, flex: 'FLEX 50', segmento: 'IMOVEL', vendedorDocumento: '11222333000181', cancelada: false });
    expect(b).toMatchObject({ flex: null, segmento: 'MOVEL', parcelasPagas: 2 });
    expect(c).toMatchObject({ cancelada: true, dataCancelamento: '2026-09-23', flex: 'FLEX 10' });
  });
});

describe('relatórios PDF (layout configurável)', () => {
  const layouts = { FECHAMENTO_CV056E: LAYOUT_CV056E_INICIAL, COMISSAO_VENDEDOR_CV069E: LAYOUT_CV069E_INICIAL, BONUS_GC070A: LAYOUT_GC070A_INICIAL };
  it('reconhece o tipo pelo conteúdo, não pelo nome', () => {
    expect(detectarTipoPdf(['SERVOPA', 'RELATÓRIO CV056E - FECHAMENTO'], layouts)).toBe('FECHAMENTO_CV056E');
    expect(detectarTipoPdf(['GC070A BÔNUS'], layouts)).toBe('BONUS_GC070A');
    expect(detectarTipoPdf(['outro relatório'], layouts)).toBeNull();
  });
  const cabecalhoPagina = (rel: string, pagina: number) => [
    `SERVOPA ADMINISTRADORA DE CONSORCIOS LTDA ${rel} HORA: 20:12 PAGINA: ${pagina}`,
    'ATIVIDADE : CV - COMISSAO DE VEN COMISSAO SOBRE VENDAS EMISSAO: 22/07/2026',
    'SOLICITANTE: 000108 - FULANA',
    '------------------------------------------------------------------------------------------------',
    'PRESTADORA: WRCON VENDEDOR:WRCON -WR VENDAS DE COTAS DE CONSORCIOS LTDA N. MATRICULA: CPF/CNPJ:42.726.684/0001-53',
    'CONTRATO D E NOME DO CLIENTE CONTATO',
    'COTA OBJETO VL.CREDITO %FLEX VLR.COMISSAO VLR.DSR VLR.SEGURO (%)',
    'ORIGEM PARC DT PAGAM DT CONTAB DT.CHEQUE DT VENDA CLAOBJ ASS',
    '------------------------------------------------------------------------------------------------',
  ];
  it('CV056E (comissão da WR): venda em 3 linhas, vendedor do cabeçalho, quebra de página no meio, sem flex e cancelamento negativo', () => {
    const linhas = [
      ...cabecalhoPagina('CV056E', 1),
      'VENDEDOR (CPF/CNPJ): 529.982.247-25 - FULANO DE TAL',
      '75255I10 E CLIENTE UM / 71 90000.0000',
      '1574.2754.4 CREDITO P/IMOVEL 7 110.000,00 50,00 825,00 0,00 0,00 1,5000',
      'INCLUSAO DE PLANO 22/07/2026 22/07/2026 I',
      '78857I09 E CLIENTE DOIS / 17 745866582',
      ...cabecalhoPagina('CV056E', 2),
      '1565.2310.8 CREDITO P/IMOVEL 019 250.000,00 50,00 625,00 0,00 0,00 0,5000',
      'PAGAMENTO COMISSAO 9 22/07/2026 30/10/2025 I',
      '02327I10 E CLIENTE TRES / 31 98876.3001',
      '1556.3831.9 CREDITO P/IMOVEL 019 268.790,00 1.343,95 0,00 0,00 0,5000',
      'PAGAMENTO COMISSAO 3 22/07/2026 27/04/2026 28/04/2026 I 27',
      '-------------- ----------- -----------',
      'Total do Vendedor ......: 2.793,95 0,00 0,00',
      '- - - - - - - - - - - - - - - -',
      'VENDEDOR (CPF/CNPJ): 11.222.333/0001-81 - 11.222.333 BELTRANO',
      '66088I10 E CLIENTE QUATRO / 33 99952.3200',
      '1572.0638.6 CREDITO P/IMOVEL 022 500.000,00 50,00 2.500,00- 0,00 0,00 1,0000',
      'CANCELAMENTO DE PLANO 22/07/2026 10/06/2026 I',
      '-------------- ----------- -----------',
      'Total do Vendedor ......: 2.500,00- 0,00 0,00',
      '--------------- ----------- -----------',
      '293,95 0,00 0,00',
      'VLR. COMISSAO: 293,95',
      'TOTAL LIQUIDO: 293,95',
    ];
    const r = lerRelatorioPdf(linhas, LAYOUT_CV056E_INICIAL);
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => l.dados)).toEqual([
      expect.objectContaining({ grupo: '1574', cota: '2754', contrato: '75255I10', consorciado: 'CLIENTE UM', vendedorDocumento: '52998224725', vendedor: 'FULANO DE TAL', tipo: 'INCLUSAO DE PLANO', parcela: null, data: '2026-07-22', dataVenda: '2026-07-22', valorEvento: '110000', flex: '50', valor: '825', percentual: '1.5' }),
      expect.objectContaining({ grupo: '1565', cota: '2310', consorciado: 'CLIENTE DOIS', tipo: 'PAGAMENTO COMISSAO', parcela: 9, dataVenda: '2025-10-30', valor: '625' }),
      expect.objectContaining({ grupo: '1556', cota: '3831', flex: null, parcela: 3, dataVenda: '2026-04-28', valor: '1343.95' }),
      expect.objectContaining({ grupo: '1572', cota: '638', vendedorDocumento: '11222333000181', tipo: 'CANCELAMENTO DE PLANO', parcela: null, dataVenda: '2026-06-10', valor: '-2500' }),
    ]);
    expect(r.totalArquivo?.toFixed(2)).toBe('293.95');
    expect(r.totalReconhecido.toFixed(2)).toBe('293.95');
  });
  it('CV069E (comissão paga pela administradora): cota na 1ª linha; sem parcela = 1ª parcela', () => {
    const linhas = [
      ...cabecalhoPagina('CV069E', 13),
      'VENDEDOR (CPF/CNPJ): 43.139.859/0001-99 - FULANO VETERANO',
      '1553.0425 -9 E CLIENTE UM / 31 98375.1912',
      '43196I10 507.895,00 50,00 1.015,79 0,00 0,00 0,4000',
      '3 22/07/2026 22/04/2026 I',
      '1556.3150 -1 E CLIENTE DOIS / 31 90000.0000',
      '72039I10 285.665,00 50,00 1.142,66 0,00 0,00 0,8000',
      '22/07/2026 13/07/2026 I',
      'Total do Vendedor ......: 2.158,45 0,00 0,00',
      '* * NAO EMITIR NOTA FISCAL * *',
    ];
    const r = lerRelatorioPdf(linhas, LAYOUT_CV069E_INICIAL);
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => l.dados)).toEqual([
      expect.objectContaining({ grupo: '1553', cota: '425', contrato: '43196I10', vendedorDocumento: '43139859000199', parcela: 3, flex: '50', valor: '1015.79', percentual: '0.4', dataVenda: '2026-04-22' }),
      expect.objectContaining({ grupo: '1556', cota: '3150', parcela: null, valor: '1142.66', percentual: '0.8' }),
    ]);
    expect(r.totalArquivo?.toFixed(2)).toBe(r.totalReconhecido.toFixed(2));
  });
  it('GC070A (bônus): uma linha por cota; soma só o total do segmento', () => {
    const linhas = [
      'SERVOPA ADMINISTRADORA DE CONSORCIOS LTDA GC070A HORA: 22:46 PAGINA: 1',
      'PERIODO APURACAO: 01/06/2026 A 30/06/2026',
      'COTA CONTRATO CONSORCIADO TP PAR DT.INC.SIS VLR.EVENTO % INCENTIVO VLR.INCENTIVO % FLEX',
      'SEGMENTO: I M O V E L',
      '1533.0106-7 26930I09 CLIENTE UM P 018 09/01/2025 222.667,00 0,50 1.113,34',
      '1570.0783-9 26693I10 EMPRESA LTDA D 012 19/02/2026 160.000,00 0,50 800,00 50,00',
      'TOTAL DO SEGMENTO: 1.913,34',
      'VLR. COMISSAO: 1.913,34',
      'I.R. (-): 28,70-',
      'TOTAL LIQUIDO: 1.884,64',
    ];
    const r = lerRelatorioPdf(linhas, LAYOUT_GC070A_INICIAL);
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => l.dados)).toEqual([
      expect.objectContaining({ grupo: '1533', cota: '106', contrato: '26930I09', consorciado: 'CLIENTE UM', tipo: 'P', parcela: 18, valorEvento: '222667', percentual: '0.5', valor: '1113.34' }),
      expect.objectContaining({ grupo: '1570', cota: '783', consorciado: 'EMPRESA LTDA', tipo: 'D', parcela: 12, valor: '800' }),
    ]);
    expect(r.totalArquivo?.toFixed(2)).toBe('1913.34');
  });
  it('venda que não casa com o layout vira erro visível, com o texto original', () => {
    const r = lerRelatorioPdf([...cabecalhoPagina('CV056E', 1), '75255I10 E CLIENTE / 1', '1574.2754.4 texto estranho 99,99', 'INCLUSAO DE PLANO 22/07/2026 I'], LAYOUT_CV056E_INICIAL);
    expect(r.linhas).toHaveLength(0);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]?.original).toContain('texto estranho');
  });
});
