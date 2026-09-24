import { describe, expect, it } from 'vitest';
import { aplicarPercentual, dec, formatarMoeda, formatarPercentual, lerMoedaTexto, moeda, somar } from '@/lib/dinheiro';

describe('dinheiro (Decimal, ROUND_HALF_UP)', () => {
  it('100.000 × 50% × 0,50% = 250,00 (exemplo da especificação)', () => {
    const base = aplicarPercentual('100000', '50');
    expect(base.toFixed(2)).toBe('50000.00');
    expect(aplicarPercentual(base, '0.5').toFixed(2)).toBe('250.00');
  });

  it('arredonda meio centavo para cima (ROUND_HALF_UP)', () => {
    expect(moeda('0.005').toFixed(2)).toBe('0.01');
    expect(moeda('0.004').toFixed(2)).toBe('0.00');
    expect(moeda('-0.005').toFixed(2)).toBe('-0.01');
    expect(moeda('2.675').toFixed(2)).toBe('2.68'); // em ponto flutuante daria 2.67
  });

  it('0,01 e somas de várias parcelas não perdem centavos', () => {
    expect(somar(Array.from({ length: 10 }, () => '0.1')).toFixed(2)).toBe('1.00');
    expect(somar(['0.01', '0.02', '0.03']).toFixed(2)).toBe('0.06');
    expect(somar(Array.from({ length: 1000 }, () => '0.01')).toFixed(2)).toBe('10.00');
  });

  it('valores grandes e com muitas casas', () => {
    expect(aplicarPercentual('99999999999.99', '100').toFixed(2)).toBe('99999999999.99');
    expect(aplicarPercentual('123456.789', '0.3333').toFixed(2)).toBe('411.48');
    expect(dec('30000000').minus('29999999.99').toFixed(2)).toBe('0.01');
  });

  it('formata em reais e percentual brasileiro', () => {
    expect(formatarMoeda('1234.56')).toBe('R$ 1.234,56');
    expect(formatarMoeda('-58899524')).toBe('-R$ 58.899.524,00');
    expect(formatarMoeda(null)).toBe('—');
    expect(formatarPercentual('0.5')).toBe('0,50%');
    expect(formatarPercentual('50')).toBe('50,00%');
  });

  it('lê texto monetário brasileiro sem adivinhar', () => {
    expect(lerMoedaTexto('R$ 1.234,56')?.toFixed(2)).toBe('1234.56');
    expect(lerMoedaTexto('220.000,00')?.toFixed(2)).toBe('220000.00');
    expect(lerMoedaTexto('1234.56')?.toFixed(2)).toBe('1234.56');
    expect(lerMoedaTexto('12,00-')?.toFixed(2)).toBe('-12.00');
    expect(lerMoedaTexto('(5,00)')?.toFixed(2)).toBe('-5.00');
    expect(lerMoedaTexto('abc')).toBeNull();
    expect(lerMoedaTexto('')).toBeNull();
    expect(lerMoedaTexto(null)).toBeNull();
  });
});

import { urlDoBanco } from '@/lib/db';
describe('conexão com o pooler da Supabase', () => {
  it('acrescenta pgbouncer=true e connection_limit=1 na porta 6543, sem mexer no resto', () => {
    const u = urlDoBanco('postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres');
    expect(u).toContain('pgbouncer=true');
    expect(u).toContain('connection_limit=1');
    expect(urlDoBanco('postgresql://u:p@host:6543/db?pgbouncer=true&connection_limit=3')).toContain('connection_limit=3');
    expect(urlDoBanco('postgresql://u:p@host:5432/db')).toBe('postgresql://u:p@host:5432/db');
  });
});
