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
  it('lê linhas, confere contra o total do rodapé em Decimal e guarda o que não reconhece', () => {
    const linhas = [
      'CV056E FECHAMENTO',
      '1564 0969-1 12345678 PAULO PEREIRA 1 COMISSAO PARCELA 10/09/2026 1.025,44',
      '1564 2975 12345679 SCARLET CRISTINA 1 CANCELAMENTO DE PLANO 12/09/2026 250,10-',
      '1564/0999 texto estranho 99,99',
      'TOTAL GERAL 775,34',
    ];
    const r = lerRelatorioPdf(linhas, LAYOUT_CV056E_INICIAL);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]?.dados).toMatchObject({ grupo: '1564', cota: '969', tipo: 'COMISSAO PARCELA', valor: '1025.44', data: '2026-09-10' });
    expect(r.linhas[1]?.dados.valor).toBe('-250.1');
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]?.original).toContain('texto estranho');
    expect(r.totalArquivo?.toFixed(2)).toBe('775.34');
    expect(r.totalReconhecido.toFixed(2)).toBe('775.34');
  });
});
