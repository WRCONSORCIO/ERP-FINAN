import { describe, expect, it } from 'vitest';
import { agruparPessoas, casaUnidade, lerLinhasLote, semelhanca } from '@/dominio/cadastro-lote';

const CAB = ['CPF/CNPJ', 'Nome do vendedor', 'Primeira venda', 'GERENCIA', 'EQUIPE', 'CATEGORIA'];

describe('cadastro em lote: leitura da planilha', () => {
  it('lê documento, datas (texto, data do Excel e número de série) e aponta erros', () => {
    const l = lerLinhasLote([
      ['título qualquer'],
      CAB,
      ['529.982.247-25', 'ana  souza', '10/08/2026', 'rafael', 'tauanne', 'iniciante'],
      ['11.222.333/0001-81', 'ANA SOUZA', new Date('2026-09-01T00:00:00Z'), 'RAFAEL', 'TAUANNE', 'VETERANO'],
      ['111.111.111-11', 'INVALIDO', '10/08/2026', 'R', 'T', 'INICIANTE'],
      ['11444777000161', 'SEM DATA', '', 'R', 'T', 'EXPERT'],
      ['529.982.247-25', 'REPETIDO', 46000, 'R', 'T', 'INICIANTE'],
    ]);
    expect(l.map((x) => [x.linha, x.tipo, x.nome, x.inicio, x.erro])).toEqual([
      [3, 'CPF', 'ANA SOUZA', '2026-08-10', null],
      [4, 'CNPJ', 'ANA SOUZA', '2026-09-01', null],
      [5, 'CPF', 'INVALIDO', '2026-08-10', 'CPF/CNPJ inválido'],
      [6, 'CNPJ', 'SEM DATA', null, 'Data da primeira venda inválida'],
      [7, 'CPF', 'REPETIDO', '2025-12-09', 'Documento repetido (já está na linha 3)'],
    ]);
    expect(() => lerLinhasLote([['A', 'B']])).toThrow(/cabeçalho/);
  });
});

describe('cadastro em lote: quem é a mesma pessoa', () => {
  const linha = (documento: string, nome: string) => ({ linha: 0, documento, tipo: null, nome, inicio: '2026-01-01', gerencia: 'G', equipe: 'E', categoria: 'C', mesmaPessoa: null, erro: null });

  it('nome igual ou parecido junta; razão social junta com o dono; homônimo parcial não junta', () => {
    expect(semelhanca('JULIA MARIANE OLIVEIRA DA PAIXAO', 'JULIA MARIANNE OLIVEIRA DA PAIXAO')).toBe('PARECIDO');
    expect(semelhanca('JULIA DE OLIVEIRA COELHO', 'JULIA MARIANE OLIVEIRA DA PAIXAO')).toBeNull();
    expect(semelhanca('LUANA SOUZA CONSULTORIA EM VENDAS LTDA', 'LUANA IZAURITA DE SOUZA')).toBe('PARECIDO');
    expect(semelhanca('GROWING CONSORTIUM LTDA', 'GABRIEL SOUZA')).toBeNull();

    const g = agruparPessoas([
      linha('1', 'TAUANNE SOUZA DOS SANTOS'), linha('2', 'TAUANNE SOUZA DOS SANTOS GOMES'), linha('3', 'TAUANNE REPRESENTACOES LTDA'),
      linha('4', 'JULIA DE OLIVEIRA COELHO'), linha('5', 'JULIA MARIANE OLIVEIRA DA PAIXAO'), linha('6', 'JULIA MARIANNE OLIVEIRA DA PAIXAO'),
      linha('7', 'KEILA COSTA COELHO'),
    ], [{ pessoaId: 'p1', nome: 'KEILA COSTA COELHO', documentos: ['10937317616'] }]);
    const mesma = (a: string, b: string) => g.grupo.get(a) === g.grupo.get(b);
    expect(mesma('1', '2') && mesma('2', '3')).toBe(true);
    expect(mesma('5', '6')).toBe(true);
    expect(mesma('4', '5')).toBe(false);
    expect(g.pessoaExistente.get('7')?.pessoaId).toBe('p1');
    expect(g.aproximados.has('4')).toBe(false);
  });

  it('dois candidatos parecidos: não junta (fica para mover depois)', () => {
    const g = agruparPessoas([linha('1', 'ANA MARIA SILVA'), linha('2', 'ANA MARIA SILVA SANTOS'), linha('3', 'ANA MARIA SILVA COSTA')], []);
    // Cada uma tem dois candidatos parecidos: nenhuma é juntada sozinha.
    expect(new Set(['1', '2', '3'].map((d) => g.grupo.get(d))).size).toBe(3);
  });

  it('gerência/equipe pelo nome, com ou sem o prefixo', () => {
    expect(casaUnidade('GERENCIA RAFAEL', 'RAFAEL')).toBe(true);
    expect(casaUnidade('TAUANNE', 'tauanne')).toBe(true);
    expect(casaUnidade('GERENCIA RAFAEL', 'RAFAELA')).toBe(false);
  });
});
