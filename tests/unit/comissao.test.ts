import { describe, expect, it } from 'vitest';
import { dec } from '@/lib/dinheiro';
import { deISO } from '@/lib/datas';
import { calcularComissoes, destinosDaCategoria, type CategoriaDaVenda, type EntradaComissao } from '@/dominio/comissao';

const INICIANTE: CategoriaDaVenda = { id: 'c1', codigo: 'INICIANTE', nome: 'Iniciante', pagaPelaWr: true, geraSupervisao: true, geraGerencia: true };
const VETERANO: CategoriaDaVenda = { id: 'c2', codigo: 'VETERANO', nome: 'Veterano', pagaPelaWr: false, geraSupervisao: false, geraGerencia: true };

function entrada(parcial: Partial<EntradaComissao> = {}): EntradaComissao {
  return {
    cota: { id: 'q1', credito: dec('100000'), dataVenda: deISO('2026-09-10') as Date, parcelasPagas: 1 },
    categoria: INICIANTE,
    segmento: { codigo: 'IMOVEIS', nome: 'Imóveis' },
    flex: { id: 'f50', codigo: 'FLEX50', nome: 'Flex 50', percentual: dec('50'), vigenteDe: deISO('2026-09-01') as Date, vigenteAte: null },
    destinos: [
      {
        destino: 'VENDEDOR',
        titular: { pessoaId: 'p1', vendedorId: 'v1', nome: 'ANA' },
        tabela: { id: 't1', vigenteDe: deISO('2026-09-01') as Date, vigenteAte: null, excecao: false, faixas: [1, 2, 3, 4].map((p, i) => ({ parcela: p, percentual: dec(['0.5', '0.4', '0.3', '0.3'][i] as string) })) },
      },
    ],
    ...parcial,
  };
}

describe('motor de comissão', () => {
  it('reproduz o exemplo gravado na memória: R$ 100.000 × 50% = R$ 50.000 × 0,50% = R$ 250,00', () => {
    const r = calcularComissoes(entrada());
    const p1 = r.linhas.find((l) => l.parcela === 1);
    expect(p1?.base.toFixed(2)).toBe('50000.00');
    expect(p1?.valor.toFixed(2)).toBe('250.00');
    expect(p1?.memoria.formula).toBe('R$ 100.000,00 × 50,00% (flex) = R$ 50.000,00 (base) × 0,50% (INICIANTE, 1ª parcela) = R$ 250,00');
    expect(p1?.memoria.dataDoFato).toEqual({ campo: 'dataVenda', valor: '2026-09-10' });
    expect(p1?.memoria.regra.tabelaId).toBe('t1');
  });

  it('uma linha por parcela com faixa; parcela sem faixa não paga', () => {
    const r = calcularComissoes(entrada());
    expect(r.linhas.map((l) => [l.parcela, l.valor.toFixed(2)])).toEqual([[1, '250.00'], [2, '200.00'], [3, '150.00'], [4, '150.00']]);
    expect(r.linhas.some((l) => l.parcela === 5)).toBe(false);
  });

  it('libera só as parcelas que o cliente já pagou', () => {
    const r = calcularComissoes(entrada({ cota: { id: 'q1', credito: dec('100000'), dataVenda: deISO('2026-09-10') as Date, parcelasPagas: 2 } }));
    expect(r.linhas.filter((l) => l.liberada).map((l) => l.parcela)).toEqual([1, 2]);
    expect(r.linhas.find((l) => l.parcela === 3)?.memoria.liberacao.liberada).toBe(false);
  });

  it('flex reduz a base (Integral = crédito cheio)', () => {
    const r = calcularComissoes(entrada({ flex: { id: 'i', codigo: 'INTEGRAL', nome: 'Integral', percentual: dec('100'), vigenteDe: deISO('2026-09-01') as Date, vigenteAte: null } }));
    expect(r.linhas[0]?.valor.toFixed(2)).toBe('500.00');
  });

  it('categoria que não é paga pela WR continua calculando (base do estorno), marcada como administradora', () => {
    const r = calcularComissoes(entrada({ categoria: VETERANO }));
    expect(r.linhas.every((l) => !l.pagaPelaWr)).toBe(true);
    expect(r.linhas[0]?.memoria.quemPaga).toBe('ADMINISTRADORA');
  });

  it('destinos dependem das flags da categoria congelada', () => {
    expect(destinosDaCategoria(INICIANTE)).toEqual(['VENDEDOR', 'SUPERVISAO', 'GERENCIA']);
    expect(destinosDaCategoria(VETERANO)).toEqual(['VENDEDOR', 'GERENCIA']);
    expect(destinosDaCategoria({ ...VETERANO, geraGerencia: false })).toEqual(['VENDEDOR']);
  });

  it('sem tabela ou sem responsável vira pendência — nunca comissão inventada nem zero silencioso', () => {
    const r = calcularComissoes(entrada({
      destinos: [
        { destino: 'VENDEDOR', titular: { pessoaId: 'p1', vendedorId: 'v1', nome: 'ANA' }, tabela: null },
        { destino: 'SUPERVISAO', titular: null, tabela: { id: 't2', vigenteDe: deISO('2026-09-01') as Date, vigenteAte: null, excecao: false, faixas: [{ parcela: 1, percentual: dec('0.3') }] } },
      ],
    }));
    expect(r.linhas).toHaveLength(0);
    expect(r.pendencias.map((p) => p.tipo).sort()).toEqual(['SEM_RESPONSAVEL', 'SEM_TABELA']);
  });

  it('supervisão e gerência são sempre pagas pela WR', () => {
    const r = calcularComissoes(entrada({
      categoria: VETERANO,
      destinos: [{ destino: 'GERENCIA', titular: { pessoaId: 'g', vendedorId: null, nome: 'G' }, tabela: { id: 't3', vigenteDe: deISO('2026-09-01') as Date, vigenteAte: null, excecao: false, faixas: [{ parcela: 1, percentual: dec('0.3') }] } }],
    }));
    expect(r.linhas[0]?.pagaPelaWr).toBe(true);
    expect(r.linhas[0]?.valor.toFixed(2)).toBe('150.00');
  });
});
