import type { Db } from '@/lib/db';
import { resolverVigente } from '@/dominio/vigencia';
import { normalizarNome } from '@/lib/texto';
import { vigenteEm } from '@/lib/datas';

export interface SnapshotResolvido {
  snapVendedorId: string | null;
  snapCategoriaId: string | null;
  snapSegmentoId: string | null;
  snapModalidadeFlexId: string | null;
  snapEquipeId: string | null;
  snapGerenciaId: string | null;
  snapSupervisorPessoaId: string | null;
  snapGerentePessoaId: string | null;
  snapRecuperacao: boolean;
  snapPagaPelaWr: boolean | null;
  snapGeraSupervisao: boolean | null;
  snapGeraGerencia: boolean | null;
  snapParcelasConferencia: number[];
  snapExpertVendedorId: string | null;
  snapExpertCategoriaId: string | null;
  snapExpertPagaPelaWr: boolean | null;
}

/**
 * Regra da WR: o CNPJ de categoria que "recebe sobre outros documentos" (Expert) não vende; recebe o %
 * da categoria dele sobre as vendas dos outros CNPJ da mesma pessoa (Veterano), desde a data em que a
 * categoria passou a valer. Resolvido na DATA DA VENDA e congelado junto com o resto.
 */
type DocumentoComCategorias = {
  id: string; tipoDocumento: string; desligadoEm: Date | null;
  categorias: Array<{ vigenteDe: Date; vigenteAte: Date | null; categoria: { id: string; pagaPelaWr: boolean; recebeSobreOutrosDocumentos: boolean } }>;
};

/** Parte pura: dado os documentos da pessoa, qual recebe sobre a venda feita por `vendedorId` nesta data. */
export function expertNaData(
  documentos: readonly DocumentoComCategorias[], vendedorId: string, dataVenda: Date, categoriaDaVenda: { recebeSobreOutrosDocumentos: boolean } | null,
): Pick<SnapshotResolvido, 'snapExpertVendedorId' | 'snapExpertCategoriaId' | 'snapExpertPagaPelaWr'> {
  const vazio = { snapExpertVendedorId: null, snapExpertCategoriaId: null, snapExpertPagaPelaWr: null };
  const vendedor = documentos.find((d) => d.id === vendedorId);
  if (!vendedor || !categoriaDaVenda || categoriaDaVenda.recebeSobreOutrosDocumentos) return vazio;
  for (const o of documentos) {
    if (o.id === vendedorId || o.tipoDocumento !== vendedor.tipoDocumento) continue;
    if (o.desligadoEm && o.desligadoEm <= dataVenda) continue;
    const cat = resolverVigente(o.categorias, dataVenda)?.categoria;
    if (cat?.recebeSobreOutrosDocumentos) return { snapExpertVendedorId: o.id, snapExpertCategoriaId: cat.id, snapExpertPagaPelaWr: cat.pagaPelaWr };
  }
  return vazio;
}

export async function documentosDaPessoa(db: Db, pessoaId: string): Promise<DocumentoComCategorias[]> {
  return db.vendedor.findMany({
    where: { pessoaId },
    select: { id: true, tipoDocumento: true, desligadoEm: true, categorias: { select: { vigenteDe: true, vigenteAte: true, categoria: { select: { id: true, pagaPelaWr: true, recebeSobreOutrosDocumentos: true } } } } },
    orderBy: { criadoEm: 'asc' },
  });
}

export async function resolverExpert(
  db: Db, vendedorId: string, dataVenda: Date, categoriaDaVenda: { recebeSobreOutrosDocumentos: boolean } | null,
): Promise<Pick<SnapshotResolvido, 'snapExpertVendedorId' | 'snapExpertCategoriaId' | 'snapExpertPagaPelaWr'>> {
  const v = await db.vendedor.findUnique({ where: { id: vendedorId }, select: { pessoaId: true } });
  if (!v) return { snapExpertVendedorId: null, snapExpertCategoriaId: null, snapExpertPagaPelaWr: null };
  return expertNaData(await documentosDaPessoa(db, v.pessoaId), vendedorId, dataVenda, categoriaDaVenda);
}

/** Modalidade usada quando a venda vem sem flex no arquivo. */
export const CODIGO_FLEX_INTEGRAL = 'INTEGRAL';

/** Casa o texto do arquivo com um cadastro por código ou alias normalizado. */
export function casarPorAlias<T extends { codigo: string; nome: string; aliases: string[] }>(texto: string | null, lista: readonly T[]): T[] {
  const n = normalizarNome(texto);
  if (n === '') return [];
  return lista.filter((x) => [x.codigo, x.nome, ...x.aliases].some((a) => normalizarNome(a) === n));
}

/**
 * Resolve os oito campos do snapshot pelo cadastro, NA DATA DA VENDA (6.3).
 * Usado apenas por: criação pela importação, transferência de vendedor e recongelamento.
 */
export async function resolverSnapshot(db: Db, p: { vendedorId: string | null; dataVenda: Date; segmentoTexto: string | null; flexTexto: string | null }): Promise<SnapshotResolvido> {
  const snap: SnapshotResolvido = {
    snapVendedorId: p.vendedorId, snapCategoriaId: null, snapSegmentoId: null, snapModalidadeFlexId: null,
    snapEquipeId: null, snapGerenciaId: null, snapSupervisorPessoaId: null, snapGerentePessoaId: null, snapRecuperacao: false,
    snapPagaPelaWr: null, snapGeraSupervisao: null, snapGeraGerencia: null, snapParcelasConferencia: [],
    snapExpertVendedorId: null, snapExpertCategoriaId: null, snapExpertPagaPelaWr: null,
  };

  const segmentos = await db.segmento.findMany({ where: { ativo: true } });
  const seg = casarPorAlias(p.segmentoTexto, segmentos);
  if (seg.length === 1) snap.snapSegmentoId = (seg[0] as (typeof segmentos)[number]).id;

  const flexVigentes = (await db.modalidadeFlex.findMany()).filter((f) => vigenteEm(p.dataVenda, f.vigenteDe, f.vigenteAte));
  // Regra da WR: venda sem flex no arquivo é Integral (comissão sobre o crédito cheio).
  const flex = normalizarNome(p.flexTexto) === ''
    ? flexVigentes.filter((f) => f.codigo === CODIGO_FLEX_INTEGRAL)
    : casarPorAlias(p.flexTexto, flexVigentes);
  if (flex.length === 1) snap.snapModalidadeFlexId = (flex[0] as (typeof flexVigentes)[number]).id;

  if (!p.vendedorId) return snap;

  const [categorias, alocacoes, recuperacoes] = await Promise.all([
    db.vendedorCategoria.findMany({ where: { vendedorId: p.vendedorId }, include: { categoria: true } }),
    db.vendedorAlocacao.findMany({ where: { vendedorId: p.vendedorId }, include: { equipe: true } }),
    db.periodoRecuperacao.findMany({ where: { vendedorId: p.vendedorId, canceladoEm: null } }),
  ]);
  const cat = resolverVigente(categorias, p.dataVenda)?.categoria ?? null;
  if (cat) {
    snap.snapCategoriaId = cat.id;
    snap.snapPagaPelaWr = cat.pagaPelaWr;
    snap.snapGeraSupervisao = cat.geraSupervisao;
    snap.snapGeraGerencia = cat.geraGerencia;
    snap.snapParcelasConferencia = [...cat.parcelasConferenciaManual];
  }
  snap.snapRecuperacao = recuperacoes.some((r) => vigenteEm(p.dataVenda, r.inicio, r.fim));
  Object.assign(snap, await resolverExpert(db, p.vendedorId, p.dataVenda, cat));

  const aloc = resolverVigente(alocacoes, p.dataVenda);
  if (aloc) {
    snap.snapEquipeId = aloc.equipeId;
    snap.snapGerenciaId = aloc.equipe.gerenciaId;
    const responsaveis = await db.responsavelUnidade.findMany({
      where: { OR: [{ papel: 'SUPERVISOR', equipeId: aloc.equipeId }, { papel: 'GERENTE', gerenciaId: aloc.equipe.gerenciaId }] },
    });
    snap.snapSupervisorPessoaId = resolverVigente(responsaveis.filter((r) => r.papel === 'SUPERVISOR'), p.dataVenda)?.pessoaId ?? null;
    snap.snapGerentePessoaId = resolverVigente(responsaveis.filter((r) => r.papel === 'GERENTE'), p.dataVenda)?.pessoaId ?? null;
  }
  return snap;
}
