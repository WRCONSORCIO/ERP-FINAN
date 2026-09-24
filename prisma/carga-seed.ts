/** Aplica a carga inicial (idempotente). Usado pelo seed e pela suíte de integração. */
import type { PrismaClient } from '@prisma/client';
import { ADMINISTRADORA, CATEGORIAS, CONFIGURACAO_ESTORNO, METAS_PROMOCAO, MODALIDADES_FLEX, REGRAS_ESTORNO, SEGMENTOS, TABELAS_COMISSAO, VIGENCIA_INICIO_PADRAO } from './carga-inicial';
import { CHAVES_LAYOUT, LAYOUT_CARTEIRA_INICIAL, LAYOUT_CV056E_INICIAL, LAYOUT_CV069E_INICIAL, LAYOUT_GC070A_INICIAL } from '../src/dominio/importacao/layouts';
import { normalizarNome } from '../src/lib/texto';

export async function semearCargaInicial(prisma: PrismaClient, inicio: string = VIGENCIA_INICIO_PADRAO): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new Error('Início de vigência inválido (use AAAA-MM-DD)');
  const vigenteDe = new Date(`${inicio}T00:00:00Z`);

  await prisma.administradora.upsert({ where: { codigo: ADMINISTRADORA.codigo }, create: ADMINISTRADORA, update: {} });

  const segmentos = new Map<string, string>();
  for (const s of SEGMENTOS) {
    const r = await prisma.segmento.upsert({ where: { codigo: s.codigo }, create: { ...s, aliases: s.aliases.map(normalizarNome) }, update: {} });
    segmentos.set(s.codigo, r.id);
  }

  const categorias = new Map<string, string>();
  for (const c of CATEGORIAS) {
    const r = await prisma.categoriaVendedor.upsert({ where: { codigo: c.codigo }, create: { ...c, documentosAceitos: [...c.documentosAceitos] }, update: {} });
    categorias.set(c.codigo, r.id);
  }

  for (const t of TABELAS_COMISSAO) {
    const chave = { destino: t.destino, segmentoId: segmentos.get(t.segmento) as string, categoriaId: t.categoria ? (categorias.get(t.categoria) as string) : null, titularVendedorId: null, titularPessoaId: null };
    if (await prisma.tabelaComissao.findFirst({ where: chave })) continue;
    await prisma.tabelaComissao.create({
      data: {
        ...chave, vigenteDe, observacao: 'Carga inicial (especificação, setembro/2026)',
        faixas: { create: Object.entries(t.parcelas).map(([p, pct]) => ({ parcela: Number(p), percentual: pct as string })) },
      },
    });
  }

  for (const f of MODALIDADES_FLEX) {
    if (await prisma.modalidadeFlex.findFirst({ where: { codigo: f.codigo } })) continue;
    await prisma.modalidadeFlex.create({ data: { ...f, aliases: f.aliases.map(normalizarNome), vigenteDe } });
  }

  if (!(await prisma.configuracaoEstorno.findFirst())) {
    await prisma.configuracaoEstorno.create({ data: { ...CONFIGURACAO_ESTORNO, vigenteDe } });
  }
  for (const r of REGRAS_ESTORNO) {
    if (await prisma.regraEstorno.findFirst({ where: { tipo: r.tipo, titularVendedorId: null } })) continue;
    await prisma.regraEstorno.create({ data: { ...r, vigenteDe } });
  }

  for (const m of METAS_PROMOCAO) {
    const origem = categorias.get(m.de) as string;
    if (await prisma.metaPromocao.findFirst({ where: { categoriaOrigemId: origem } })) continue;
    await prisma.metaPromocao.create({
      data: { categoriaOrigemId: origem, categoriaAlvoId: categorias.get(m.para) as string, volumeMinimo: m.volumeMinimo, alertaAoFaltar: m.alertaAoFaltar, documentoExigido: m.documentoExigido, vigenteDe },
    });
  }

  const configs: Array<[string, unknown, string]> = [
    [CHAVES_LAYOUT.CARTEIRA_CSV, LAYOUT_CARTEIRA_INICIAL, 'Layout da base de clientes (CSV)'],
    [CHAVES_LAYOUT.FECHAMENTO_CV056E, LAYOUT_CV056E_INICIAL, 'Layout do relatório CV056E'],
    [CHAVES_LAYOUT.COMISSAO_VENDEDOR_CV069E, LAYOUT_CV069E_INICIAL, 'Layout do relatório CV069E'],
    [CHAVES_LAYOUT.BONUS_GC070A, LAYOUT_GC070A_INICIAL, 'Layout do relatório GC070A'],
    ['promocao.inclui_canceladas', true, 'Produção para promoção conta a carteira completa (inclusive canceladas)'],
    ['importacao.tamanho_lote', 250, 'Linhas aplicadas por lote de importação'],
  ];
  for (const [chave, valor, descricao] of configs) {
    await prisma.configuracaoSistema.upsert({ where: { chave }, create: { chave, valor: valor as object, descricao }, update: {} });
  }
}

