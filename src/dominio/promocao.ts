import { CEM, dec, ZERO, type Dec } from '@/lib/dinheiro';

export interface MetaVigente {
  categoriaOrigemId: string;
  categoriaAlvoId: string;
  categoriaAlvoNome: string;
  volumeMinimo: Dec;
  alertaAoFaltar: Dec;
  documentoExigido: 'CPF' | 'CNPJ' | null;
}

export interface SituacaoPromocao {
  proximaCategoria: string | null;
  meta: Dec | null;
  falta: Dec | null;
  progressoPct: Dec | null; // 0..100
  atingiu: boolean;
  proxima: boolean; // dentro do limiar de alerta
  documentoExigido: 'CPF' | 'CNPJ' | null;
}

/**
 * 6.7: o volume conta a carteira completa da pessoa, sempre pelo crédito total (flex não reduz).
 * A promoção nunca é automática — aqui só se sinaliza.
 * `categoriaAtualId` é o degrau mais alto entre os documentos ativos da pessoa.
 */
export function situacaoDePromocao(volume: Dec, categoriaAtualId: string | null, metas: readonly MetaVigente[]): SituacaoPromocao {
  const meta = categoriaAtualId ? metas.find((m) => m.categoriaOrigemId === categoriaAtualId) : undefined;
  if (!meta) {
    return { proximaCategoria: null, meta: null, falta: null, progressoPct: null, atingiu: false, proxima: false, documentoExigido: null };
  }
  const faltaBruta = meta.volumeMinimo.minus(volume);
  const falta = faltaBruta.isNegative() ? ZERO : faltaBruta;
  const progresso = volume.gte(meta.volumeMinimo) ? CEM : volume.times(CEM).dividedBy(meta.volumeMinimo).toDecimalPlaces(1);
  const atingiu = falta.isZero();
  return {
    proximaCategoria: meta.categoriaAlvoNome,
    meta: meta.volumeMinimo,
    falta,
    progressoPct: dec(progresso),
    atingiu,
    proxima: !atingiu && falta.lte(meta.alertaAoFaltar),
    documentoExigido: meta.documentoExigido,
  };
}
