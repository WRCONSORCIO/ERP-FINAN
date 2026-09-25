import { aplicarPercentual, formatarMoeda, formatarPercentual, paraTexto, somar, ZERO, type Dec } from '@/lib/dinheiro';
import { formatarData, paraISO } from '@/lib/datas';
import type { Destino, TitularResolvido } from './comissao';

export type TipoEstorno = 'RECUPERACAO' | 'CANCELAMENTO';
export type Criterio = 'IGUAL' | 'ABAIXO_DE';
export type EscopoBase = 'PARCELAS_RECEBIDAS' | 'PRIMEIRA_PARCELA' | 'TOTAL_TABELA';

export const ROTULO_ESCOPO: Record<EscopoBase, string> = {
  PARCELAS_RECEBIDAS: 'parcelas recebidas',
  PRIMEIRA_PARCELA: 'só a primeira parcela',
  TOTAL_TABELA: 'total da tabela',
};

export interface ConfigEstorno {
  id: string;
  participantes: readonly string[];
  criterio: Criterio;
  limiteParcelas: number;
  escopoBase: EscopoBase | null;
  vigenteDe: Date;
  vigenteAte: Date | null;
}

export interface RegraEstornoResolvida {
  id: string;
  percentual: Dec;
  excecao: boolean;
  /** Participante da regra (categoria, SUPERVISAO ou GERENCIA); null = regra padrão. */
  participante?: string | null;
  vigenteDe: Date;
  vigenteAte: Date | null;
}

/** Recuperação tem precedência; cancelamento depende do critério; limite zero desliga o cancelamento. */
export function tipoDeEstorno(
  cota: { cancelada: boolean; parcelasPagas: number; recuperacao: boolean },
  config: Pick<ConfigEstorno, 'criterio' | 'limiteParcelas'>,
): TipoEstorno | null {
  if (!cota.cancelada) return null;
  if (cota.recuperacao) return 'RECUPERACAO';
  if (config.limiteParcelas <= 0) return null;
  if (config.criterio === 'IGUAL') return cota.parcelasPagas === config.limiteParcelas ? 'CANCELAMENTO' : null;
  return cota.parcelasPagas < config.limiteParcelas ? 'CANCELAMENTO' : null;
}

/** Comissão que serve de base ao estorno, conforme o escopo configurado. */
export function comissaoBaseDoEstorno(
  escopo: EscopoBase,
  comissoes: ReadonlyArray<{ parcela: number; valor: Dec }>,
  parcelasPagas: number,
): Dec {
  switch (escopo) {
    case 'PARCELAS_RECEBIDAS':
      return somar(comissoes.filter((c) => c.parcela <= parcelasPagas).map((c) => c.valor));
    case 'PRIMEIRA_PARCELA':
      return comissoes.find((c) => c.parcela === 1)?.valor ?? ZERO;
    case 'TOTAL_TABELA':
      return somar(comissoes.map((c) => c.valor));
  }
}

export interface EntradaEstorno {
  cota: { id: string; cancelada: boolean; dataCancelamento: Date | null; parcelasPagas: number; recuperacao: boolean; origemDataCancelamento: string | null };
  config: ConfigEstorno | null;
  destinos: ReadonlyArray<{
    destino: Destino;
    /** Código que a lista de participantes usa: código da categoria (vendedor) ou SUPERVISAO/GERENCIA. */
    participante: string;
    titular: TitularResolvido | null;
    regra: RegraEstornoResolvida | null;
    /** Comissões apuradas com a tabela da DATA DA VENDA (todas as faixas). Null = comissão não apurável. */
    comissoes: ReadonlyArray<{ parcela: number; valor: Dec; percentual: Dec }> | null;
  }>;
}

export interface LinhaEstorno {
  destino: Destino;
  tipo: TipoEstorno;
  titular: TitularResolvido | null;
  regraId: string;
  configuracaoId: string;
  comissaoBase: Dec;
  percentual: Dec;
  valor: Dec;
  memoria: Record<string, unknown>;
}

export interface PendenciaEstorno {
  tipo: 'ESTORNO_SEM_CONFIGURACAO' | 'ESTORNO_SEM_REGRA' | 'ESTORNO_SEM_TITULAR' | 'SEM_TABELA';
  destino: Destino | null;
  descricao: string;
}

/**
 * Motor de estorno (6.6). Percentual pela data do CANCELAMENTO; base pela comissão da data da VENDA.
 * Função pura: não sabe de banco. Nunca devolve dois estornos para o mesmo destino.
 */
export function calcularEstornos(e: EntradaEstorno): { linhas: LinhaEstorno[]; pendencias: PendenciaEstorno[] } {
  const linhas: LinhaEstorno[] = [];
  const pendencias: PendenciaEstorno[] = [];
  if (!e.cota.cancelada || !e.cota.dataCancelamento) return { linhas, pendencias };

  if (!e.config) {
    pendencias.push({ tipo: 'ESTORNO_SEM_CONFIGURACAO', destino: null, descricao: `Sem configuração de estorno vigente em ${formatarData(e.cota.dataCancelamento)}` });
    return { linhas, pendencias };
  }
  const tipo = tipoDeEstorno(e.cota, e.config);
  if (!tipo) return { linhas, pendencias };

  const participantes = new Set(e.config.participantes);
  for (const d of e.destinos) {
    if (!participantes.has(d.participante)) continue;
    if (!e.config.escopoBase) {
      pendencias.push({ tipo: 'ESTORNO_SEM_CONFIGURACAO', destino: d.destino, descricao: 'Escopo da base do estorno não definido em Configurações › Estornos' });
      continue;
    }
    if (!d.regra) {
      pendencias.push({ tipo: 'ESTORNO_SEM_REGRA', destino: d.destino, descricao: `Sem percentual de estorno (${tipo.toLowerCase()}) vigente em ${formatarData(e.cota.dataCancelamento)}` });
      continue;
    }
    if (!d.comissoes) {
      pendencias.push({ tipo: 'SEM_TABELA', destino: d.destino, descricao: 'Comissão da venda não apurável: não há base para o estorno' });
      continue;
    }
    const comissaoBase = comissaoBaseDoEstorno(e.config.escopoBase, d.comissoes, e.cota.parcelasPagas);
    const valor = aplicarPercentual(comissaoBase, d.regra.percentual);
    if (valor.isZero()) continue; // nada a devolver
    if (!d.titular) {
      pendencias.push({ tipo: 'ESTORNO_SEM_TITULAR', destino: d.destino, descricao: `Estorno de ${formatarMoeda(valor)} sem titular cadastrado — não está sendo cobrado de ninguém` });
    }
    const parcelasUsadas = d.comissoes
      .filter((c) => (e.config?.escopoBase === 'PARCELAS_RECEBIDAS' ? c.parcela <= e.cota.parcelasPagas : e.config?.escopoBase === 'PRIMEIRA_PARCELA' ? c.parcela === 1 : true))
      .map((c) => ({ parcela: c.parcela, percentual: paraTexto(c.percentual), valor: paraTexto(c.valor) }));
    linhas.push({
      destino: d.destino,
      tipo,
      titular: d.titular,
      regraId: d.regra.id,
      configuracaoId: e.config.id,
      comissaoBase,
      percentual: d.regra.percentual,
      valor,
      memoria: {
        formula: `${formatarMoeda(comissaoBase)} (comissão base: ${ROTULO_ESCOPO[e.config.escopoBase]}) × ${formatarPercentual(d.regra.percentual)} (${tipo === 'RECUPERACAO' ? 'recuperação' : 'cancelamento'}) = ${formatarMoeda(valor)}`,
        tipo,
        motivoDoTipo: tipo === 'RECUPERACAO'
          ? 'Venda marcada como feita em período de recuperação (precedência sobre a contagem de parcelas)'
          : `Cancelamento com ${e.cota.parcelasPagas} parcela(s) paga(s) — critério ${e.config.criterio === 'IGUAL' ? 'igual a' : 'abaixo de'} ${e.config.limiteParcelas}`,
        parcelasPagas: e.cota.parcelasPagas,
        escopoBase: e.config.escopoBase,
        comissoesUsadas: parcelasUsadas,
        comissaoBase: paraTexto(comissaoBase),
        percentual: paraTexto(d.regra.percentual),
        valor: paraTexto(valor),
        regra: { regraId: d.regra.id, excecaoIndividual: d.regra.excecao, participante: d.regra.participante ?? 'padrão', vigenteDe: paraISO(d.regra.vigenteDe), vigenteAte: d.regra.vigenteAte ? paraISO(d.regra.vigenteAte) : null },
        configuracao: { id: e.config.id, participantes: [...e.config.participantes], vigenteDe: paraISO(e.config.vigenteDe), vigenteAte: e.config.vigenteAte ? paraISO(e.config.vigenteAte) : null },
        dataDoFato: { percentual: 'dataCancelamento', dataCancelamento: paraISO(e.cota.dataCancelamento), origemDaData: e.cota.origemDataCancelamento, base: 'comissão apurada com a tabela da data da venda' },
        titular: d.titular ? { pessoaId: d.titular.pessoaId, vendedorId: d.titular.vendedorId, nome: d.titular.nome } : 'SEM TITULAR',
      },
    });
  }
  return { linhas, pendencias };
}
