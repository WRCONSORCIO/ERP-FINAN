import { describe, expect, it } from 'vitest';
import { dec } from '@/lib/dinheiro';
import { deISO } from '@/lib/datas';
import { calcularEstornos, comissaoBaseDoEstorno, tipoDeEstorno, type ConfigEstorno, type EntradaEstorno } from '@/dominio/estorno';

const CFG: ConfigEstorno = { id: 'cfg', participantes: ['VETERANO', 'EXPERT'], criterio: 'IGUAL', limiteParcelas: 1, escopoBase: 'PARCELAS_RECEBIDAS', vigenteDe: deISO('2026-09-01') as Date, vigenteAte: null };
const COMISSOES = [{ parcela: 1, valor: dec('400'), percentual: dec('0.8') }, { parcela: 3, valor: dec('200'), percentual: dec('0.4') }, { parcela: 4, valor: dec('200'), percentual: dec('0.4') }];

function entrada(p: Partial<EntradaEstorno['cota']> = {}, cfg: ConfigEstorno | null = CFG, extra: Partial<EntradaEstorno['destinos'][number]> = {}): EntradaEstorno {
  return {
    cota: { id: 'q', cancelada: true, dataCancelamento: deISO('2026-09-20') as Date, parcelasPagas: 1, recuperacao: false, origemDataCancelamento: 'base', ...p },
    config: cfg,
    destinos: [{ destino: 'VENDEDOR', participante: 'VETERANO', titular: { pessoaId: 'p', vendedorId: 'v', nome: 'V' }, regra: { id: 'r', percentual: dec('50'), excecao: false, vigenteDe: deISO('2026-09-01') as Date, vigenteAte: null }, comissoes: COMISSOES, ...extra }],
  };
}

describe('motor de estorno', () => {
  it('recuperação tem precedência sobre a contagem de parcelas', () => {
    expect(tipoDeEstorno({ cancelada: true, parcelasPagas: 5, recuperacao: true }, CFG)).toBe('RECUPERACAO');
    expect(tipoDeEstorno({ cancelada: true, parcelasPagas: 1, recuperacao: false }, CFG)).toBe('CANCELAMENTO');
    expect(tipoDeEstorno({ cancelada: true, parcelasPagas: 2, recuperacao: false }, CFG)).toBeNull();
    expect(tipoDeEstorno({ cancelada: false, parcelasPagas: 1, recuperacao: true }, CFG)).toBeNull();
  });
  it('critério ABAIXO_DE e limite zero desliga', () => {
    expect(tipoDeEstorno({ cancelada: true, parcelasPagas: 0, recuperacao: false }, { criterio: 'ABAIXO_DE', limiteParcelas: 1 })).toBe('CANCELAMENTO');
    expect(tipoDeEstorno({ cancelada: true, parcelasPagas: 1, recuperacao: false }, { criterio: 'ABAIXO_DE', limiteParcelas: 1 })).toBeNull();
    expect(tipoDeEstorno({ cancelada: true, parcelasPagas: 0, recuperacao: false }, { criterio: 'IGUAL', limiteParcelas: 0 })).toBeNull();
  });
  it('escopos da base', () => {
    expect(comissaoBaseDoEstorno('PARCELAS_RECEBIDAS', COMISSOES, 1).toFixed(2)).toBe('400.00');
    expect(comissaoBaseDoEstorno('PARCELAS_RECEBIDAS', COMISSOES, 3).toFixed(2)).toBe('600.00');
    expect(comissaoBaseDoEstorno('PRIMEIRA_PARCELA', COMISSOES, 3).toFixed(2)).toBe('400.00');
    expect(comissaoBaseDoEstorno('TOTAL_TABELA', COMISSOES, 0).toFixed(2)).toBe('800.00');
  });
  it('estorno = comissão base × percentual (50% de R$ 400 = R$ 200)', () => {
    const r = calcularEstornos(entrada());
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]?.valor.toFixed(2)).toBe('200.00');
    expect(r.linhas[0]?.tipo).toBe('CANCELAMENTO');
    expect(String(r.linhas[0]?.memoria.formula)).toContain('R$ 400,00');
  });
  it('quem não participa não é estornado (configuração, não código)', () => {
    expect(calcularEstornos(entrada({}, { ...CFG, participantes: ['EXPERT'] })).linhas).toHaveLength(0);
  });
  it('sem titular: o estorno é criado SEM TITULAR e vira pendência (nunca some)', () => {
    const r = calcularEstornos(entrada({}, CFG, { titular: null }));
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]?.titular).toBeNull();
    expect(r.pendencias.map((p) => p.tipo)).toContain('ESTORNO_SEM_TITULAR');
  });
  it('sem configuração, sem escopo ou sem regra: pendência, nada calculado', () => {
    expect(calcularEstornos(entrada({}, null)).pendencias[0]?.tipo).toBe('ESTORNO_SEM_CONFIGURACAO');
    expect(calcularEstornos(entrada({}, { ...CFG, escopoBase: null })).pendencias[0]?.tipo).toBe('ESTORNO_SEM_CONFIGURACAO');
    expect(calcularEstornos(entrada({}, CFG, { regra: null })).pendencias[0]?.tipo).toBe('ESTORNO_SEM_REGRA');
  });
  it('venda não cancelada não gera estorno', () => {
    expect(calcularEstornos(entrada({ cancelada: false })).linhas).toHaveLength(0);
  });
});
