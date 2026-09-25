import { diaAnterior, formatarData, vigenteEm } from '@/lib/datas';
import { ErroDeDominio } from '@/lib/erros';

export interface ComVigencia {
  vigenteDe: Date;
  vigenteAte: Date | null;
}

/**
 * Resolve a regra que valia NA DATA DO FATO (Princípio 4). Nunca "hoje" implícito.
 * Mais de uma vigente é violação de integridade (o banco impede com EXCLUDE) e interrompe o cálculo.
 */
export function resolverVigente<T extends ComVigencia>(lista: readonly T[], data: Date): T | null {
  const validas = lista.filter((r) => vigenteEm(data, r.vigenteDe, r.vigenteAte));
  if (validas.length > 1) {
    throw new ErroDeDominio(`Mais de uma vigência válida em ${formatarData(data)} — integridade violada.`, 'VIGENCIA_DUPLICADA');
  }
  return validas[0] ?? null;
}

export interface PlanoNovaVigencia {
  /** Data a gravar como vigenteAte da vigência atual (dia anterior ao início da nova), ou null se nada a encerrar. */
  encerrarAtualEm: Date | null;
}

/**
 * Princípio 3: alterar uma regra encerra a vigência atual no dia anterior e abre outra.
 * Nunca sobrescreve: se a nova começaria no mesmo dia ou antes da atual, é recusada.
 */
export function planejarNovaVigencia(atual: ComVigencia | null, inicioNova: Date): PlanoNovaVigencia {
  if (!atual) return { encerrarAtualEm: null };
  if (inicioNova.getTime() <= atual.vigenteDe.getTime()) {
    throw new ErroDeDominio(
      `A nova vigência precisa começar depois de ${formatarData(atual.vigenteDe)} (início da vigência atual). ` +
        'Alterar a regra não reescreve o passado. Se a vigência atual ainda não foi usada em nenhum cálculo, ' +
        'use "Corrigir / excluir" na linha dela para mudar a data de início.',
      'VIGENCIA_RETROATIVA',
    );
  }
  if (atual.vigenteAte !== null && atual.vigenteAte.getTime() < inicioNova.getTime()) {
    return { encerrarAtualEm: null };
  }
  return { encerrarAtualEm: diaAnterior(inicioNova) };
}

/** Vigência começando no futuro não vale para venda nenhuma hoje. */
export function ehVigenciaFutura(v: ComVigencia, hoje: Date): boolean {
  return v.vigenteDe.getTime() > hoje.getTime();
}

export interface PlanoLinhaDoTempo<T> {
  /** Já existe um período começando exatamente nesta data. */
  mesma: T | null;
  /** Período que cobre a data e será encerrado na véspera (se houver). */
  anterior: T | null;
  encerrarAnteriorEm: Date | null;
  /** Fim do novo período: o fim que o anterior tinha, ou a véspera do seguinte, ou aberto. */
  vigenteAte: Date | null;
  /** Próximo período, quando a data cai antes dele (sem período cobrindo a data). */
  seguinte: T | null;
}

/**
 * Encaixa um período novo em qualquer ponto da linha do tempo (inclusive no passado):
 * depois de um período, encerra-o na véspera; antes de um período, termina na véspera dele.
 * Quem chama confere se o encaixe tiraria a regra de algum fato já calculado.
 */
export function planejarNaLinhaDoTempo<T extends ComVigencia>(lista: readonly T[], inicio: Date): PlanoLinhaDoTempo<T> {
  const t = inicio.getTime();
  const mesma = lista.find((v) => v.vigenteDe.getTime() === t) ?? null;
  if (mesma) return { mesma, anterior: null, encerrarAnteriorEm: null, vigenteAte: mesma.vigenteAte, seguinte: null };
  const anterior = [...lista].filter((v) => v.vigenteDe.getTime() < t).sort((a, b) => b.vigenteDe.getTime() - a.vigenteDe.getTime())[0] ?? null;
  const seguinte = [...lista].filter((v) => v.vigenteDe.getTime() > t).sort((a, b) => a.vigenteDe.getTime() - b.vigenteDe.getTime())[0] ?? null;
  if (anterior && (anterior.vigenteAte === null || anterior.vigenteAte.getTime() >= t)) {
    return { mesma: null, anterior, encerrarAnteriorEm: diaAnterior(inicio), vigenteAte: anterior.vigenteAte, seguinte: null };
  }
  return { mesma: null, anterior: null, encerrarAnteriorEm: null, vigenteAte: seguinte ? diaAnterior(seguinte.vigenteDe) : null, seguinte };
}
