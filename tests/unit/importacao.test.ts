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
