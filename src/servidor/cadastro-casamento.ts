import type { Db } from '@/lib/db';
import type { CadastroParaCasamento } from '@/dominio/casamento';

/** Carrega documentos e nomes (com apelidos registrados) para o casamento de vendedor. */
export async function carregarCadastroCasamento(db: Db): Promise<CadastroParaCasamento> {
  const [vendedores, aliases] = await Promise.all([
    db.vendedor.findMany({ select: { id: true, documento: true, nomeNormalizado: true } }),
    db.vendedorAlias.findMany({ select: { vendedorId: true, nomeNormalizado: true } }),
  ]);
  const porDocumento = new Map(vendedores.map((v) => [v.documento, v.id]));
  const porNome = new Map<string, string[]>();
  for (const v of vendedores) porNome.set(v.nomeNormalizado, [...(porNome.get(v.nomeNormalizado) ?? []), v.id]);
  for (const a of aliases) porNome.set(a.nomeNormalizado, [...(porNome.get(a.nomeNormalizado) ?? []), a.vendedorId]);
  return { porDocumento, porNome };
}

