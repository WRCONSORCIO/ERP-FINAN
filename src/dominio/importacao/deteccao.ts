import type { LayoutCarteira, LayoutPdf } from './layouts';
import { pareceCarteira } from './carteira';

export type TipoArquivo = 'CARTEIRA_CSV' | 'FECHAMENTO_CV056E' | 'COMISSAO_VENDEDOR_CV069E' | 'BONUS_GC070A';

export const ROTULO_TIPO_ARQUIVO: Record<TipoArquivo, string> = {
  CARTEIRA_CSV: 'Base de clientes',
  FECHAMENTO_CV056E: 'CV056E · fechamento',
  COMISSAO_VENDEDOR_CV069E: 'CV069E · comissão do vendedor',
  BONUS_GC070A: 'GC070A · bônus incentivo',
};

export function ehPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

/** O tipo é reconhecido pelo CONTEÚDO, nunca pelo nome do arquivo. */
export function detectarTipoPdf(linhas: readonly string[], layouts: Record<'FECHAMENTO_CV056E' | 'COMISSAO_VENDEDOR_CV069E' | 'BONUS_GC070A', LayoutPdf>): TipoArquivo | null {
  const cabecalho = linhas.slice(0, 60).join(' ').toUpperCase();
  const achados = (Object.entries(layouts) as Array<[TipoArquivo, LayoutPdf]>).filter(([, l]) => cabecalho.includes(l.marcador.toUpperCase()));
  return achados.length === 1 ? (achados[0] as [TipoArquivo, LayoutPdf])[0] : null;
}

export function detectarTipoTexto(texto: string, layout: LayoutCarteira): TipoArquivo | null {
  return pareceCarteira(texto, layout) ? 'CARTEIRA_CSV' : null;
}
