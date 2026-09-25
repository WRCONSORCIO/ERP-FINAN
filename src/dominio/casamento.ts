import { somenteDigitos, tipoDoDocumento } from '@/lib/documento';
import { normalizarNome } from '@/lib/texto';

export interface CadastroParaCasamento {
  porDocumento: ReadonlyMap<string, string>; // documento → vendedorId
  porNome: ReadonlyMap<string, readonly string[]>; // nome normalizado (nome ou alias) → vendedorIds
}

export type ResultadoCasamento =
  | { vendedorId: string; criterio: 'DOCUMENTO' | 'NOME' }
  | { vendedorId: null; motivo: 'SEM_VENDEDOR' | 'SEM_CADASTRO' | 'AMBIGUO' | 'DOCUMENTO_SEM_CADASTRO' };

/**
 * Casamento de vendedor (8.2). Documento primeiro. Nome só como alternativa, normalizando
 * apenas acento, caixa e espaço — e só quando o nome aponta para UM documento.
 * Nunca por semelhança: nome parecido não é o mesmo vendedor.
 */
export function casarVendedor(nome: string | null | undefined, documento: string | null | undefined, cad: CadastroParaCasamento): ResultadoCasamento {
  const doc = somenteDigitos(documento);
  if (doc !== '' && tipoDoDocumento(doc)) {
    const id = cad.porDocumento.get(doc);
    if (id) return { vendedorId: id, criterio: 'DOCUMENTO' };
    // Documento informado e sem cadastro: não cai para o nome (o documento é mais forte).
    return { vendedorId: null, motivo: 'DOCUMENTO_SEM_CADASTRO' };
  }
  const n = normalizarNome(nome);
  if (n === '') return { vendedorId: null, motivo: 'SEM_VENDEDOR' };
  const ids = cad.porNome.get(n) ?? [];
  const unicos = [...new Set(ids)];
  if (unicos.length === 1) return { vendedorId: unicos[0] as string, criterio: 'NOME' };
  if (unicos.length > 1) return { vendedorId: null, motivo: 'AMBIGUO' };
  return { vendedorId: null, motivo: 'SEM_CADASTRO' };
}
