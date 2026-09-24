import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { formatarMoeda, somar } from '@/lib/dinheiro';
import { formatarData, periodoDosParametros, rotuloMesLongo } from '@/lib/datas';
import { formatarDocumento } from '@/lib/documento';
import { log } from '@/lib/log';
import { pode, type Recurso } from '@/lib/permissoes';
import { gerarCsv, gerarXlsx, type Coluna } from '@/lib/exportacao';
import { gerarPdfExtrato } from '@/lib/pdf-extrato';
import { ROTULO_DESTINO, type Destino } from '@/dominio/comissao';
import { auditar } from '@/servidor/auditoria';
import { escopoComissoes, type Sessao } from '@/servidor/contexto';
import { obterSessao } from '@/servidor/sessao';
import { lerFiltroCarteira, whereCarteira } from '@/servidor/consultas/carteira';
import { listarVendedores } from '@/servidor/consultas/vendedores';
import { aPagar } from '@/servidor/consultas/a-pagar';
import { whereEstornos } from '@/servidor/consultas/estornos';
import { whereBonus } from '@/servidor/consultas/bonus';
import { filtroAuditoria } from '@/servidor/consultas/auditoria';
import { extratoDaPessoa } from '@/servidor/consultas/extrato';
import type { Params } from '@/servidor/consultas/comum';
import { ROTULO_COMISSAO, ROTULO_ESTORNO } from '@/ui/rotulos';

export const dynamic = 'force-dynamic';

const LIMITE = 100_000;

const RECURSO: Record<string, Recurso> = {
  carteira: 'cotas', vendedores: 'vendedores', 'a-pagar': 'comissoes', folha: 'comissoes', estornos: 'estornos', bonus: 'bonus', auditoria: 'auditoria', extrato: 'comissoes',
};

type Arquivo = { nome: string; conteudo: Uint8Array; tipo: string; linhas: number };

async function tabular<T>(formato: string, nome: string, colunas: Coluna<T>[], linhas: readonly T[], rodape?: string[], titulo?: string): Promise<Arquivo> {
  if (formato === 'csv') return { nome: `${nome}.csv`, conteudo: gerarCsv(colunas, linhas, rodape), tipo: 'text/csv; charset=utf-8', linhas: linhas.length };
  return { nome: `${nome}.xlsx`, conteudo: await gerarXlsx(nome, colunas, linhas, rodape, titulo), tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', linhas: linhas.length };
}

async function gerar(tipo: string, s: Sessao, sp: Params, formato: string): Promise<Arquivo | null> {
  const periodo = periodoDosParametros({ mes: (sp.mes as string) || undefined, de: (sp.de as string) || undefined, ate: (sp.ate as string) || undefined });
  switch (tipo) {
    case 'carteira': {
      const cotas = await prisma.cota.findMany({
        where: whereCarteira(s, lerFiltroCarteira(sp)), take: LIMITE, orderBy: [{ dataVenda: 'desc' }, { grupo: 'asc' }, { cota: 'asc' }],
        include: { snapVendedor: true, snapCategoria: true, snapEquipe: true, snapGerencia: true, snapSegmento: true, snapModalidadeFlex: true },
      });
      type C = (typeof cotas)[number];
      const col: Coluna<C>[] = [
        { titulo: 'Cliente', tipo: 'texto', valor: (c) => c.clienteNome }, { titulo: 'CPF/CNPJ', tipo: 'texto', valor: (c) => formatarDocumento(c.cpfCliente) },
        { titulo: 'Contrato', tipo: 'texto', valor: (c) => c.contrato }, { titulo: 'Grupo', tipo: 'texto', valor: (c) => c.grupo }, { titulo: 'Cota', tipo: 'texto', valor: (c) => c.cota },
        { titulo: 'Crédito', tipo: 'moeda', valor: (c) => c.credito }, { titulo: 'Data da venda', tipo: 'data', valor: (c) => c.dataVenda },
        { titulo: 'Parcelas pagas', tipo: 'inteiro', valor: (c) => c.parcelasPagas }, { titulo: 'Situação', tipo: 'texto', valor: (c) => c.situacao },
        { titulo: 'Cancelamento', tipo: 'data', valor: (c) => c.dataCancelamento }, { titulo: 'Vendedor', tipo: 'texto', valor: (c) => c.snapVendedor?.nome ?? `SEM VENDEDOR (${c.vendedorNomeImportado ?? ''})` },
        { titulo: 'Categoria', tipo: 'texto', valor: (c) => c.snapCategoria?.nome ?? '' }, { titulo: 'Segmento', tipo: 'texto', valor: (c) => c.snapSegmento?.nome ?? '' },
        { titulo: 'Flex', tipo: 'texto', valor: (c) => c.snapModalidadeFlex?.nome ?? '' }, { titulo: 'Equipe', tipo: 'texto', valor: (c) => c.snapEquipe?.nome ?? '' },
        { titulo: 'Gerência', tipo: 'texto', valor: (c) => c.snapGerencia?.nome ?? '' },
      ];
      const total = somar(cotas.map((c) => c.credito));
      return tabular(formato, 'carteira', col, cotas, ['Total', '', '', '', '', formatarMoeda(total, { semSimbolo: true })]);
    }
    case 'vendedores': {
      const d = await listarVendedores(s, (sp.busca as string) ?? '');
      type L = (typeof d.ativos)[number] & { situacao: string };
      const linhas: L[] = [...d.ativos.map((l) => ({ ...l, situacao: 'Ativo' })), ...d.desligados.map((l) => ({ ...l, situacao: 'Desligado' }))];
      const col: Coluna<L>[] = [
        { titulo: 'Pessoa', tipo: 'texto', valor: (l) => l.pessoa.nome }, { titulo: 'Situação', tipo: 'texto', valor: (l) => l.situacao },
        { titulo: 'Documentos', tipo: 'texto', valor: (l) => l.documentos.map((x) => `${x.tipo} ${formatarDocumento(x.documento)} (${x.categoria?.nome ?? 'sem categoria'}${x.status === 'DESLIGADO' ? ', desligado' : ''})`).join(' | ') },
        { titulo: 'Cotas', tipo: 'inteiro', valor: (l) => l.cotas }, { titulo: 'Produção acumulada', tipo: 'moeda', valor: (l) => l.promocao?.volume ?? '0' },
        { titulo: 'Próxima categoria', tipo: 'texto', valor: (l) => l.promocao?.situacao.proximaCategoria ?? '' }, { titulo: 'Falta', tipo: 'moeda', valor: (l) => l.promocao?.situacao.falta ?? null },
      ];
      return tabular(formato, 'vendedores', col, linhas);
    }
    case 'a-pagar': {
      const d = await aPagar(s);
      type L = (typeof d.linhas)[number];
      const col: Coluna<L>[] = [
        { titulo: 'Beneficiário', tipo: 'texto', valor: (l) => l.nome }, { titulo: 'Previsto', tipo: 'moeda', valor: (l) => l.previsto }, { titulo: 'Liberado', tipo: 'moeda', valor: (l) => l.liberado },
        { titulo: 'Em folha', tipo: 'moeda', valor: (l) => l.emFolha }, { titulo: 'Estorno a cobrar', tipo: 'moeda', valor: (l) => l.estornoACobrar },
      ];
      const t = d.totais;
      return tabular(formato, 'a-pagar', col, d.linhas, ['Total', ...[t.previsto, t.liberado, t.emFolha, t.estornoACobrar].map((v) => formatarMoeda(v, { semSimbolo: true }))]);
    }
    case 'folha': {
      const folha = await prisma.folhaComissao.findUnique({ where: { id: String(sp.id ?? '') } });
      if (!folha) return null;
      const itens = await prisma.comissaoApurada.findMany({
        where: { AND: [escopoComissoes(s), { folhaId: folha.id }] },
        include: { titularPessoa: true, titularVendedor: true, cota: { select: { clienteNome: true, grupo: true, cota: true, contrato: true } } },
        orderBy: [{ titularPessoa: { nome: 'asc' } }, { cotaId: 'asc' }, { parcela: 'asc' }],
      });
      type I = (typeof itens)[number];
      const col: Coluna<I>[] = [
        { titulo: 'Beneficiário', tipo: 'texto', valor: (i) => i.titularPessoa.nome }, { titulo: 'Documento', tipo: 'texto', valor: (i) => (i.titularVendedor ? `${i.titularVendedor.tipoDocumento} ${formatarDocumento(i.titularVendedor.documento)}` : '') },
        { titulo: 'Cliente', tipo: 'texto', valor: (i) => i.cota.clienteNome }, { titulo: 'Grupo/Cota', tipo: 'texto', valor: (i) => `${i.cota.grupo}/${i.cota.cota}` }, { titulo: 'Contrato', tipo: 'texto', valor: (i) => i.cota.contrato },
        { titulo: 'Parcela', tipo: 'inteiro', valor: (i) => i.parcela }, { titulo: 'Destino', tipo: 'texto', valor: (i) => ROTULO_DESTINO[i.destino as Destino] + (i.ajusteDeId ? ' (ajuste)' : '') },
        { titulo: 'Base', tipo: 'moeda', valor: (i) => i.base }, { titulo: 'Percentual', tipo: 'percentual', valor: (i) => i.percentual }, { titulo: 'Valor', tipo: 'moeda', valor: (i) => i.valor },
        { titulo: 'Status', tipo: 'texto', valor: (i) => ROTULO_COMISSAO[i.status] ?? i.status }, { titulo: 'Competência', tipo: 'texto', valor: () => folha.competencia },
      ];
      const total = somar(itens.map((i) => i.valor));
      return tabular(formato, `folha-${folha.competencia}`, col, itens, ['Total', '', '', '', '', '', '', '', '', formatarMoeda(total, { semSimbolo: true })],
        `Folha de comissões · ${rotuloMesLongo(folha.competencia)} · fechada em ${formatarData(folha.fechadaEm)} · ${folha.status === 'PAGA' ? 'PAGA' : 'FECHADA'}`);
    }
    case 'estornos': {
      const itens = await prisma.estorno.findMany({ where: whereEstornos(s, periodo, sp.abertos === '1'), include: { titularPessoa: true, cota: true }, orderBy: { dataEvento: 'asc' }, take: LIMITE });
      type E = (typeof itens)[number];
      const col: Coluna<E>[] = [
        { titulo: 'Vendedor', tipo: 'texto', valor: (e) => e.titularPessoa?.nome ?? 'SEM TITULAR' }, { titulo: 'Cliente', tipo: 'texto', valor: (e) => e.cota.clienteNome },
        { titulo: 'Grupo/Cota', tipo: 'texto', valor: (e) => `${e.cota.grupo}/${e.cota.cota}` }, { titulo: 'Crédito', tipo: 'moeda', valor: (e) => e.cota.credito },
        { titulo: 'Evento', tipo: 'texto', valor: (e) => (e.tipo === 'RECUPERACAO' ? 'Recuperação' : 'Cancelamento') }, { titulo: 'Destino', tipo: 'texto', valor: (e) => ROTULO_DESTINO[e.destino as Destino] },
        { titulo: 'Data do cancelamento', tipo: 'data', valor: (e) => e.dataEvento }, { titulo: 'Parc. pagas', tipo: 'inteiro', valor: (e) => e.parcelasPagas },
        { titulo: 'Comissão base', tipo: 'moeda', valor: (e) => e.comissaoBase }, { titulo: '% estorno', tipo: 'percentual', valor: (e) => e.percentual }, { titulo: 'Valor', tipo: 'moeda', valor: (e) => e.valor },
        { titulo: 'Situação', tipo: 'texto', valor: (e) => ROTULO_ESTORNO[e.status] ?? e.status },
      ];
      return tabular(formato, 'estornos', col, itens);
    }
    case 'bonus': {
      const itens = await prisma.bonusIncentivo.findMany({ where: whereBonus(s, periodo, sp.semVinculo === '1'), include: { equipe: true, gerencia: true }, take: LIMITE });
      type B = (typeof itens)[number];
      const col: Coluna<B>[] = [
        { titulo: 'Consorciado', tipo: 'texto', valor: (b) => b.consorciado }, { titulo: 'Grupo/Cota', tipo: 'texto', valor: (b) => `${b.grupo}/${b.cota}` }, { titulo: 'Contrato', tipo: 'texto', valor: (b) => b.contrato },
        { titulo: 'Vendedor na importação', tipo: 'texto', valor: (b) => b.vendedorNaImportacaoNome }, { titulo: 'Equipe', tipo: 'texto', valor: (b) => b.equipe?.nome }, { titulo: 'Gerência de origem', tipo: 'texto', valor: (b) => b.gerencia?.nome ?? 'sem vínculo' },
        { titulo: 'Parcela', tipo: 'inteiro', valor: (b) => b.parcela }, { titulo: 'Valor do evento', tipo: 'moeda', valor: (b) => b.valorEvento }, { titulo: '% incentivo', tipo: 'percentual', valor: (b) => b.percentualIncentivo },
        { titulo: 'Bônus recebido', tipo: 'moeda', valor: (b) => b.valorBonus }, { titulo: 'Data', tipo: 'data', valor: (b) => b.dataReferencia },
      ];
      return tabular(formato, 'bonus', col, itens);
    }
    case 'auditoria': {
      const itens = await prisma.auditLog.findMany({ where: filtroAuditoria(sp), orderBy: { criadoEm: 'desc' }, take: 20_000, include: { usuario: { select: { nome: true } } } });
      type A = (typeof itens)[number];
      const col: Coluna<A>[] = [
        { titulo: 'Data/hora', tipo: 'texto', valor: (a) => a.criadoEm.toISOString() }, { titulo: 'Usuário', tipo: 'texto', valor: (a) => a.usuario?.nome ?? a.email ?? 'sistema' },
        { titulo: 'Ação', tipo: 'texto', valor: (a) => a.acao }, { titulo: 'Entidade', tipo: 'texto', valor: (a) => a.entidade }, { titulo: 'Registro', tipo: 'texto', valor: (a) => a.entidadeId },
        { titulo: 'Antes', tipo: 'texto', valor: (a) => (a.antes ? JSON.stringify(a.antes) : '') }, { titulo: 'Depois', tipo: 'texto', valor: (a) => (a.depois ? JSON.stringify(a.depois) : '') },
        { titulo: 'Contexto', tipo: 'texto', valor: (a) => (a.contexto ? JSON.stringify(a.contexto) : '') }, { titulo: 'IP', tipo: 'texto', valor: (a) => a.ip },
      ];
      return tabular(formato, 'auditoria', col, itens);
    }
    case 'extrato': {
      const e = await extratoDaPessoa(s, String(sp.pessoa ?? ''), periodo);
      if (!e) return null;
      const pdf = await gerarPdfExtrato({
        titulo: `Extrato de comissões · ${e.pessoa.nome}`,
        subtitulo: [`Período: ${periodo.rotulo}`, `Documentos: ${e.pessoa.documentos.map((d) => `${d.tipoDocumento} ${formatarDocumento(d.documento)}`).join(' · ') || '—'}`],
        resumo: [
          ['Comissão paga pela WR (liberada)', formatarMoeda(e.totalComissao)], ['Paga direto pela administradora', formatarMoeda(e.totalAdm)],
          ['Estornos do período', formatarMoeda(e.totalEstorno)], ['Líquido informativo (sem desconto automático)', formatarMoeda(e.liquidoInformativo)],
        ],
        tabelas: [
          {
            titulo: 'Comissões',
            colunas: [{ titulo: 'Venda', largura: 60 }, { titulo: 'Cliente', largura: 170 }, { titulo: 'Cota', largura: 62 }, { titulo: 'Crédito', largura: 86, direita: true }, { titulo: 'Flex', largura: 55 }, { titulo: 'Papel', largura: 64 }, { titulo: 'Parc.', largura: 34, direita: true }, { titulo: '%', largura: 50, direita: true }, { titulo: 'Comissão', largura: 80, direita: true }, { titulo: 'Paga por', largura: 70 }, { titulo: 'Situação', largura: 47 }],
            linhas: e.comissoes.map((c) => [formatarData(c.cota.dataVenda), c.cota.clienteNome, `${c.cota.grupo}/${c.cota.cota}`, formatarMoeda(c.cota.credito), c.cota.snapModalidadeFlex?.nome ?? '-', ROTULO_DESTINO[c.destino as Destino] + (c.ajusteDeId ? ' (aj.)' : ''), `${c.parcela}`, c.percentual.toFixed(4).replace('.', ',') + '%', formatarMoeda(c.valor), c.pagaPelaWr ? 'WR' : 'administradora', ROTULO_COMISSAO[c.status] ?? '']),
            total: ['Total pago pela WR', '', '', '', '', '', '', '', formatarMoeda(e.totalComissao), '', ''],
          },
          {
            titulo: 'Estornos',
            colunas: [{ titulo: 'Cancelamento', largura: 70 }, { titulo: 'Cliente', largura: 200 }, { titulo: 'Cota', largura: 70 }, { titulo: 'Tipo', largura: 80 }, { titulo: 'Comissão base', largura: 100, direita: true }, { titulo: '%', largura: 60, direita: true }, { titulo: 'Valor', largura: 100, direita: true }, { titulo: 'Situação', largura: 98 }],
            linhas: e.estornos.map((x) => [formatarData(x.dataEvento), x.cota.clienteNome, `${x.cota.grupo}/${x.cota.cota}`, x.tipo === 'RECUPERACAO' ? 'Recuperação' : 'Cancelamento', formatarMoeda(x.comissaoBase), x.percentual.toFixed(4).replace('.', ',') + '%', formatarMoeda(x.valor), ROTULO_ESTORNO[x.status] ?? '']),
            total: ['Total', '', '', '', '', '', formatarMoeda(e.totalEstorno), ''],
          },
        ],
        rodape: `ERP WR Consórcio · gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      });
      return { nome: `extrato-${e.pessoa.nome.replace(/\W+/g, '-').toLowerCase()}-${periodo.competencia ?? 'periodo'}.pdf`, conteudo: pdf, tipo: 'application/pdf', linhas: e.comissoes.length + e.estornos.length };
    }
    default:
      return null;
  }
}

/**
 * Exportações: a mesma sessão reconferida, a mesma permissão e o MESMO recorte SQL das telas.
 * Nunca exporta o que o usuário não poderia ver.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const s = await obterSessao();
  if (!s) return new NextResponse('Sessão expirada. Entre novamente.', { status: 401 });
  const recurso = RECURSO[tipo];
  if (!recurso) return new NextResponse('Exportação inexistente.', { status: 404 });
  if (!pode(s.perfil, recurso)) return new NextResponse('Sem permissão.', { status: 403 });
  const sp: Params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const formato = sp.formato === 'csv' ? 'csv' : 'xlsx';
  try {
    const arq = await gerar(tipo, s, sp, formato);
    if (!arq) return new NextResponse('Registro não encontrado ou fora do seu recorte.', { status: 404 });
    await auditar(prisma, { sessao: s, acao: 'EXPORTACAO', entidade: 'Exportacao', entidadeId: tipo, contexto: { tipo, formato: arq.tipo, linhas: arq.linhas, filtros: sp } });
    return new NextResponse(Buffer.from(arq.conteudo), {
      headers: { 'Content-Type': arq.tipo, 'Content-Disposition': `attachment; filename="${arq.nome}"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    log.erro('exportacao.erro', { tipo, erro: e });
    return new NextResponse('Não foi possível gerar a exportação.', { status: 500 });
  }
}
