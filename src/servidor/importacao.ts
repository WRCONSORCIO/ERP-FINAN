import { createHash } from 'node:crypto';
import type { Importacao, LinhaDeImportacao, Prisma, TipoImportacao, TipoLancamento } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';
import { dec, formatarMoeda, paraTexto } from '@/lib/dinheiro';
import { deISO, formatarData, hoje } from '@/lib/datas';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { normalizarNome } from '@/lib/texto';
import { casarVendedor, type CadastroParaCasamento } from '@/dominio/casamento';
import { decodificarTexto } from '@/dominio/importacao/csv';
import { hashLinhaCarteira, lerCarteira, type LinhaCarteira } from '@/dominio/importacao/carteira';
import { detectarTipoPdf, detectarTipoTexto, ehPdf, ROTULO_TIPO_ARQUIVO, type TipoArquivo } from '@/dominio/importacao/deteccao';
import { hashLinhaPdf, lerRelatorioPdf, type LinhaPdf } from '@/dominio/importacao/pdf';
import type { LayoutPdf } from '@/dominio/importacao/layouts';
import { auditar } from './auditoria';
import { layoutCarteira, layoutsPdf, tamanhoLote } from './configuracao';
import { exigir, type Sessao } from './contexto';
import { enfileirarApuracao } from './fila';
import { paraJson } from './json';
import { notificar } from './notificacoes';
import { resolverSnapshot } from './snapshot';
import { carregarCadastroCasamento } from './cadastro-casamento';
import { avaliarAlertasDePromocao } from './promocao';

export const TAMANHO_MAXIMO_ARQUIVO = 20 * 1024 * 1024;

export interface ResultadoRecebimento {
  importacaoId: string;
  tipo: TipoImportacao;
  linhas: number;
  erros: number;
  jaEnviadoAntes: boolean;
  diferencaConferencia: string | null;
}

async function extrairPdf(bytes: Uint8Array): Promise<string[]> {
  const { extrairLinhasPdf } = await import('@/dominio/importacao/extrair-pdf');
  return extrairLinhasPdf(bytes);
}

/** Etapa 1: reconhece o arquivo pelo conteúdo, lê, guarda as linhas e os erros. Não aplica nada ainda. */
export async function receberArquivo(
  sessao: Sessao,
  p: { administradoraId: string; nomeArquivo: string; bytes: Uint8Array },
  opcoes: { extrairPdf?: (b: Uint8Array) => Promise<string[]> } = {},
): Promise<ResultadoRecebimento> {
  exigir(sessao, 'importacoes', 'editar');
  if (p.bytes.length === 0) throw new ErroDeDominio('O arquivo está vazio.');
  if (p.bytes.length > TAMANHO_MAXIMO_ARQUIVO) throw new ErroDeDominio('Arquivo maior que 20 MB.');
  const administradora = await prisma.administradora.findFirst({ where: { id: p.administradoraId, ativo: true } });
  if (!administradora) throw new ErroDeDominio('Administradora não encontrada ou inativa.');
  const hashArquivo = createHash('sha256').update(p.bytes).digest('hex');

  let tipo: TipoArquivo | null;
  let linhas: Array<{ numero: number; original: string; dados: unknown }> = [];
  let erros: Array<{ numero: number; original: string; motivo: string }> = [];
  let totalArquivo: string | null = null;
  let totalReconhecido: string | null = null;

  if (ehPdf(p.bytes)) {
    const texto = await (opcoes.extrairPdf ?? extrairPdf)(p.bytes);
    const layouts = await layoutsPdf(prisma);
    tipo = detectarTipoPdf(texto, layouts);
    if (!tipo || tipo === 'CARTEIRA_CSV') {
      throw new ErroDeDominio('Não foi possível reconhecer o relatório pelo conteúdo (CV056E, CV069E ou GC070A). Confira o arquivo ou o marcador em Layout dos arquivos.');
    }
    const r = lerRelatorioPdf(texto, layouts[tipo] as LayoutPdf);
    const ocorrencias = new Map<string, number>();
    linhas = r.linhas.map((l) => {
      const base = hashLinhaPdf(tipo as string, p.administradoraId, l.dados, 0);
      const n = (ocorrencias.get(base) ?? 0) + 1;
      ocorrencias.set(base, n);
      return { numero: l.numero, original: l.original, dados: { ...l.dados, ocorrencia: n } };
    });
    erros = r.erros;
    totalArquivo = r.totalArquivo ? paraTexto(r.totalArquivo) : null;
    totalReconhecido = paraTexto(r.totalReconhecido);
    if (linhas.length === 0 && erros.length === 0) throw new ErroDeDominio('Nenhuma linha de dado encontrada no relatório.');
  } else {
    const texto = decodificarTexto(p.bytes);
    const layout = await layoutCarteira(prisma);
    tipo = detectarTipoTexto(texto, layout);
    if (!tipo) {
      throw new ErroDeDominio('Não foi possível reconhecer o arquivo pelo conteúdo. A base de clientes precisa ser CSV separado por ";" com as colunas de grupo, cota, CPF e crédito.');
    }
    const r = lerCarteira(texto, layout);
    if (r.faltando.length > 0) {
      throw new ErroDeDominio(`Colunas obrigatórias não encontradas: ${r.faltando.join(', ')}. Cabeçalho lido: ${r.cabecalho.join(' | ')}`);
    }
    linhas = r.linhas;
    erros = r.erros;
  }

  const anterior = await prisma.importacao.findFirst({ where: { hashArquivo, tipo }, select: { id: true } });
  const diferenca = totalArquivo !== null && totalReconhecido !== null ? dec(totalArquivo).minus(dec(totalReconhecido)) : null;

  const imp = await prisma.$transaction(async (tx) => {
    const imp = await tx.importacao.create({
      data: {
        tipo, administradoraId: p.administradoraId, nomeArquivo: p.nomeArquivo.slice(0, 255), hashArquivo, tamanhoBytes: p.bytes.length,
        totalLinhas: linhas.length, erros: erros.length, totalArquivo, totalReconhecido,
        diferencaConferencia: diferenca ? paraTexto(diferenca) : null, enviadoPorId: sessao.usuarioId,
        mensagem: anterior ? 'Arquivo idêntico já enviado antes: as linhas voltarão como sem mudança.' : null,
      },
    });
    for (let i = 0; i < linhas.length; i += 1000) {
      await tx.linhaDeImportacao.createMany({
        data: linhas.slice(i, i + 1000).map((l) => ({ importacaoId: imp.id, numero: l.numero, original: l.original, dados: paraJson(l.dados) ?? {} })),
      });
    }
    for (let i = 0; i < erros.length; i += 1000) {
      await tx.importacaoErro.createMany({ data: erros.slice(i, i + 1000).map((e) => ({ importacaoId: imp.id, linha: e.numero, conteudo: e.original, motivo: e.motivo })) });
    }
    await auditar(tx, {
      sessao, acao: 'IMPORTACAO', entidade: 'Importacao', entidadeId: imp.id,
      depois: { tipo, nomeArquivo: p.nomeArquivo, hashArquivo, linhas: linhas.length, erros: erros.length, totalArquivo, totalReconhecido },
    });
    if (erros.length > 0) {
      await notificar(tx, {
        tipo: 'ERRO_IMPORTACAO', severidade: 'ATENCAO', titulo: `${erros.length} linha(s) não reconhecida(s)`,
        mensagem: `${ROTULO_TIPO_ARQUIVO[tipo as TipoArquivo]} "${p.nomeArquivo}": ${erros.length} linha(s) foram para a lista de erros com o conteúdo original.`,
        link: `/importacoes?importacao=${imp.id}#erros`, chave: `imp-erros-${imp.id}`, perfis: ['ADMINISTRADOR', 'FINANCEIRO'],
      });
    }
    if (diferenca && !diferenca.isZero()) {
      await notificar(tx, {
        tipo: 'DIVERGENCIA_IMPORTACAO', severidade: 'CRITICA', titulo: 'Conferência do arquivo não fecha',
        mensagem: `"${p.nomeArquivo}": total impresso ${formatarMoeda(totalArquivo)} × reconhecido ${formatarMoeda(totalReconhecido)} (diferença ${formatarMoeda(diferenca)}).`,
        link: `/importacoes?importacao=${imp.id}`, chave: `imp-div-${imp.id}`, perfis: ['ADMINISTRADOR', 'FINANCEIRO'],
      });
    }
    return imp;
  }, { timeout: 120_000 });

  return {
    importacaoId: imp.id, tipo, linhas: linhas.length, erros: erros.length, jaEnviadoAntes: anterior !== null,
    diferencaConferencia: diferenca ? paraTexto(diferenca) : null,
  };
}

export interface ResultadoLote {
  processadas: number;
  restantes: number;
  concluida: boolean;
}

/**
 * Etapa 2: aplica um LOTE de linhas guardadas, retomando de onde parou (cursor).
 * Cada lote é uma transação: ou o lote inteiro entra (com auditoria e pedidos de apuração), ou nada.
 */
export async function aplicarLote(sessao: Sessao, importacaoId: string): Promise<ResultadoLote> {
  exigir(sessao, 'importacoes', 'editar');
  const imp = await prisma.importacao.findUnique({ where: { id: importacaoId } });
  if (!imp) throw new ErroNaoEncontrado('Importação não encontrada.');
  if (imp.status === 'APLICADA') return { processadas: 0, restantes: 0, concluida: true };
  const lote = await tamanhoLote(prisma);

  const linhas = await prisma.linhaDeImportacao.findMany({
    where: { importacaoId, status: 'PENDENTE' }, orderBy: { numero: 'asc' }, take: lote,
  });

  if (linhas.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.importacao.update({ where: { id: imp.id }, data: { status: 'APLICANDO' } });
      const contagem = { NOVA: 0, ATUALIZADA: 0, SEM_MUDANCA: 0, ERRO: 0, divergencias: 0 };
      const cadastro = imp.tipo === 'CARTEIRA_CSV' || imp.tipo === 'COMISSAO_VENDEDOR_CV069E' ? await carregarCadastroCasamento(tx) : null;
      for (const l of linhas) {
        const r = await aplicarLinha(tx, imp, l, cadastro);
        contagem[r.status]++;
        if (r.divergencia) contagem.divergencias++;
        await tx.linhaDeImportacao.update({ where: { id: l.id }, data: { status: r.status, mensagem: r.mensagem ?? null } });
        if (r.status === 'ERRO') {
          await tx.importacaoErro.create({ data: { importacaoId: imp.id, linha: l.numero, conteudo: l.original, motivo: r.mensagem ?? 'Erro na aplicação' } });
        }
      }
      await tx.importacao.update({
        where: { id: imp.id },
        data: {
          novos: { increment: contagem.NOVA }, atualizados: { increment: contagem.ATUALIZADA }, repetidos: { increment: contagem.SEM_MUDANCA },
          erros: { increment: contagem.ERRO }, divergencias: { increment: contagem.divergencias },
          cursor: (linhas[linhas.length - 1] as LinhaDeImportacao).numero,
        },
      });
    }, { timeout: 120_000, maxWait: 10_000 });
  }

  const restantes = await prisma.linhaDeImportacao.count({ where: { importacaoId, status: 'PENDENTE' } });
  if (restantes === 0) {
    const final = await prisma.$transaction(async (tx) => {
      const f = await tx.importacao.update({ where: { id: imp.id }, data: { status: 'APLICADA', concluidoEm: new Date() } });
      await auditar(tx, { sessao, acao: 'IMPORTACAO', entidade: 'Importacao', entidadeId: imp.id, contexto: { etapa: 'aplicada' }, depois: { novos: f.novos, atualizados: f.atualizados, repetidos: f.repetidos, erros: f.erros, divergencias: f.divergencias } });
      await notificar(tx, {
        tipo: 'IMPORTACAO_CONCLUIDA', severidade: f.erros > 0 || f.divergencias > 0 ? 'ATENCAO' : 'INFO', titulo: 'Importação aplicada',
        mensagem: `"${f.nomeArquivo}": ${f.novos} novo(s), ${f.atualizados} atualizado(s), ${f.repetidos} sem mudança, ${f.erros} erro(s), ${f.divergencias} divergência(s).`,
        link: `/importacoes?importacao=${f.id}`, chave: `imp-ok-${f.id}`, perfis: ['ADMINISTRADOR', 'FINANCEIRO'],
      });
      return f;
    });
    if (final.tipo === 'CARTEIRA_CSV') await avaliarAlertasDePromocao(prisma);
  }
  return { processadas: linhas.length, restantes, concluida: restantes === 0 };
}

interface ResultadoLinha {
  status: 'NOVA' | 'ATUALIZADA' | 'SEM_MUDANCA' | 'ERRO';
  mensagem?: string;
  divergencia?: boolean;
}

async function aplicarLinha(tx: Tx, imp: Importacao, l: LinhaDeImportacao, cadastro: CadastroParaCasamento | null): Promise<ResultadoLinha> {
  switch (imp.tipo) {
    case 'CARTEIRA_CSV': return aplicarLinhaCarteira(tx, imp, l.dados as unknown as LinhaCarteira, cadastro as CadastroParaCasamento);
    case 'FECHAMENTO_CV056E': return aplicarLancamento(tx, imp, l);
    case 'COMISSAO_VENDEDOR_CV069E': return aplicarComissaoAdm(tx, imp, l, cadastro as CadastroParaCasamento);
    case 'BONUS_GC070A': return aplicarBonus(tx, imp, l);
  }
}

function dadosDaVersao(d: LinhaCarteira): Prisma.InputJsonValue {
  return paraJson(d) ?? {};
}

async function aplicarLinhaCarteira(tx: Tx, imp: Importacao, d: LinhaCarteira, cadastro: CadastroParaCasamento): Promise<ResultadoLinha> {
  const hash = hashLinhaCarteira(d);
  const dataVenda = deISO(d.dataVenda);
  if (!dataVenda) return { status: 'ERRO', mensagem: 'Data da venda inválida' };
  const hojeData = hoje();
  const dataCancArquivo = deISO(d.dataCancelamento);
  const identidade = { administradoraId: imp.administradoraId, contrato: d.contrato, grupo: d.grupo, cota: d.cota, cpfCliente: d.cpfCliente };
  const existente = await tx.cota.findUnique({ where: { identidade } });

  if (!existente) {
    const casamento = casarVendedor(d.vendedorNome, d.vendedorDocumento, cadastro);
    const snap = await resolverSnapshot(tx, { vendedorId: casamento.vendedorId, dataVenda, segmentoTexto: d.segmento, flexTexto: d.flex });
    const dataCancelamento = d.cancelada ? (dataCancArquivo ?? hojeData) : null;
    const cota = await tx.cota.create({
      data: {
        ...identidade, clienteNome: d.clienteNome, clienteEmail: d.clienteEmail, clienteTelefone: d.clienteTelefone,
        credito: d.credito, dataVenda, parcelasPagas: d.parcelasPagas, situacao: d.situacao, cancelada: d.cancelada,
        dataCancelamento, origemDataCancelamento: d.cancelada ? (dataCancArquivo ? 'base de clientes' : `data da importação que registrou o cancelamento (${formatarData(hojeData)})`) : null,
        segmentoTexto: d.segmento, flexTexto: d.flex, vendedorNomeImportado: d.vendedorNome, vendedorDocImportado: d.vendedorDocumento,
        hashConteudo: hash, vendedorId: casamento.vendedorId, ...snap, snapCongeladoEm: new Date(), snapOrigem: 'IMPORTACAO',
        primeiraImportacaoId: imp.id, ultimaImportacaoId: imp.id,
      },
    });
    await tx.cotaVersao.create({ data: { cotaId: cota.id, importacaoId: imp.id, hash, dados: dadosDaVersao(d) } });
    await enfileirarApuracao(tx, cota.id, 'nova venda importada');
    return { status: 'NOVA', mensagem: 'criterio' in casamento ? `Vendedor casado por ${casamento.criterio === 'DOCUMENTO' ? 'documento' : 'nome'}` : `Sem vendedor: ${casamento.motivo}` };
  }

  if (existente.hashConteudo === hash) return { status: 'SEM_MUDANCA' };

  const dados: Prisma.CotaUncheckedUpdateInput = {
    clienteNome: d.clienteNome, clienteEmail: existente.anonimizadaEm ? null : d.clienteEmail, clienteTelefone: existente.anonimizadaEm ? null : d.clienteTelefone,
    credito: d.credito, dataVenda, parcelasPagas: d.parcelasPagas, situacao: d.situacao, cancelada: d.cancelada,
    segmentoTexto: d.segmento, flexTexto: d.flex, vendedorNomeImportado: d.vendedorNome, vendedorDocImportado: d.vendedorDocumento,
    hashConteudo: hash, ultimaImportacaoId: imp.id,
  };
  if (d.cancelada) {
    if (dataCancArquivo) {
      dados.dataCancelamento = dataCancArquivo;
      dados.origemDataCancelamento = 'base de clientes';
    } else if (!existente.cancelada) {
      dados.dataCancelamento = hojeData;
      dados.origemDataCancelamento = `data da importação que registrou o cancelamento (${formatarData(hojeData)})`;
    }
  } else {
    dados.dataCancelamento = null;
    dados.origemDataCancelamento = null;
  }

  // Vendedor que mudou na administradora: nunca aceito em silêncio.
  let divergencia = false;
  const mudouVendedor = normalizarNome(existente.vendedorNomeImportado) !== normalizarNome(d.vendedorNome)
    || (existente.vendedorDocImportado ?? '') !== (d.vendedorDocumento ?? '');
  if (mudouVendedor) {
    if (!existente.snapVendedorId) {
      // A venda nunca teve vendedor identificado: a importação completa o snapshot (criação).
      const casamento = casarVendedor(d.vendedorNome, d.vendedorDocumento, cadastro);
      if (casamento.vendedorId) {
        const snap = await resolverSnapshot(tx, { vendedorId: casamento.vendedorId, dataVenda, segmentoTexto: d.segmento, flexTexto: d.flex });
        Object.assign(dados, snap, { vendedorId: casamento.vendedorId, snapCongeladoEm: new Date(), snapOrigem: 'IMPORTACAO' });
      }
    } else {
      divergencia = true;
      await tx.divergenciaVendedor.create({
        data: {
          cotaId: existente.id, importacaoId: imp.id, nomeAnterior: existente.vendedorNomeImportado, docAnterior: existente.vendedorDocImportado,
          nomeNovo: d.vendedorNome, docNovo: d.vendedorDocumento,
        },
      });
      await notificar(tx, {
        tipo: 'VENDEDOR_CORRIGIDO', severidade: 'ATENCAO', titulo: 'Administradora corrigiu o vendedor de uma venda',
        mensagem: `Grupo ${existente.grupo}/${existente.cota}: "${existente.vendedorNomeImportado ?? '—'}" → "${d.vendedorNome ?? '—'}". A venda continua com o vendedor atual até alguém decidir.`,
        link: `/clientes/${existente.id}`, chave: `div-vend-${existente.id}-${imp.id}`, perfis: ['ADMINISTRADOR'],
      });
    }
  } else if (!existente.snapSegmentoId || !existente.snapModalidadeFlexId) {
    // Segmento/flex ausentes no congelamento: se agora o texto casa, completa (continua sendo a criação pela importação).
    if (existente.segmentoTexto !== d.segmento || existente.flexTexto !== d.flex) {
      const snap = await resolverSnapshot(tx, { vendedorId: null, dataVenda: existente.dataVenda, segmentoTexto: d.segmento, flexTexto: d.flex });
      if (!existente.snapSegmentoId && snap.snapSegmentoId) dados.snapSegmentoId = snap.snapSegmentoId;
      if (!existente.snapModalidadeFlexId && snap.snapModalidadeFlexId) dados.snapModalidadeFlexId = snap.snapModalidadeFlexId;
    }
  }

  await tx.cota.update({ where: { id: existente.id }, data: dados });
  await tx.cotaVersao.create({ data: { cotaId: existente.id, importacaoId: imp.id, hash, dados: dadosDaVersao(d) } });
  await enfileirarApuracao(tx, existente.id, 'venda atualizada pela importação');
  return { status: 'ATUALIZADA', divergencia, ...(divergencia ? { mensagem: 'Vendedor divergente registrado' } : {}) };
}

async function localizarCota(tx: Tx, administradoraId: string, d: LinhaPdf): Promise<string | null> {
  const candidatas = await tx.cota.findMany({ where: { administradoraId, grupo: d.grupo, cota: d.cota }, select: { id: true, contrato: true } });
  if (candidatas.length === 1) return (candidatas[0] as { id: string }).id;
  if (d.contrato) {
    const porContrato = candidatas.filter((c) => c.contrato === d.contrato);
    if (porContrato.length === 1) return (porContrato[0] as { id: string }).id;
  }
  return null;
}

function classificar(texto: string | null, layout: LayoutPdf): TipoLancamento {
  const n = normalizarNome(texto);
  const c = layout.classificacao;
  if (!c) return 'OUTRO';
  if (c.CANCELAMENTO.some((x) => n.includes(normalizarNome(x)))) return 'CANCELAMENTO';
  if (c.COMISSAO_PARCELA.some((x) => n.includes(normalizarNome(x)))) return 'COMISSAO_PARCELA';
  return 'OUTRO';
}

type DadosPdf = LinhaPdf & { ocorrencia: number };

async function aplicarLancamento(tx: Tx, imp: Importacao, l: LinhaDeImportacao): Promise<ResultadoLinha> {
  const d = l.dados as unknown as DadosPdf;
  const hash = hashLinhaPdf(imp.tipo, imp.administradoraId, d, d.ocorrencia);
  if (await tx.lancamentoAdministradora.findUnique({ where: { hash }, select: { id: true } })) return { status: 'SEM_MUDANCA' };
  const layout = (await layoutsPdf(tx)).FECHAMENTO_CV056E;
  const cotaId = await localizarCota(tx, imp.administradoraId, d);
  const tipo = classificar(d.tipo, layout);
  await tx.lancamentoAdministradora.create({
    data: {
      importacaoId: imp.id, cotaId, grupo: d.grupo, cota: d.cota, contrato: d.contrato, consorciado: d.consorciado,
      tipoOrigemTexto: d.tipo ?? '', tipo, parcela: d.parcela, valor: d.valor, dataReferencia: deISO(d.data), hash, linhaOriginal: l.original,
    },
  });
  // O débito do cancelamento define a competência da cobrança do estorno.
  if (cotaId && tipo === 'CANCELAMENTO') await enfileirarApuracao(tx, cotaId, 'débito de cancelamento pela administradora');
  const mensagens: string[] = [];
  if (!cotaId) mensagens.push('Sem vínculo com a carteira');
  if (tipo === 'OUTRO') mensagens.push(`Lançamento fora dos tipos previstos ("${d.tipo ?? ''}"): importado e exibido, sem gerar comissão`);
  return { status: 'NOVA', ...(mensagens.length > 0 ? { mensagem: mensagens.join(' · ') } : {}) };
}

async function aplicarComissaoAdm(tx: Tx, imp: Importacao, l: LinhaDeImportacao, cadastro: CadastroParaCasamento): Promise<ResultadoLinha> {
  const d = l.dados as unknown as DadosPdf;
  const hash = hashLinhaPdf(imp.tipo, imp.administradoraId, d, d.ocorrencia);
  if (await tx.comissaoVendedorAdm.findUnique({ where: { hash }, select: { id: true } })) return { status: 'SEM_MUDANCA' };
  const cotaId = await localizarCota(tx, imp.administradoraId, d);
  const casamento = casarVendedor(d.vendedor, null, cadastro);
  await tx.comissaoVendedorAdm.create({
    data: {
      importacaoId: imp.id, cotaId, vendedorId: casamento.vendedorId, vendedorTexto: d.vendedor, grupo: d.grupo, cota: d.cota, contrato: d.contrato,
      parcela: d.parcela, valor: d.valor, dataReferencia: deISO(d.data), hash, linhaOriginal: l.original,
    },
  });
  const msgs = [!cotaId ? 'Sem vínculo com a carteira' : null, !casamento.vendedorId ? 'Vendedor não casado com o cadastro' : null].filter(Boolean);
  return { status: 'NOVA', ...(msgs.length > 0 ? { mensagem: msgs.join(' · ') } : {}) };
}

async function aplicarBonus(tx: Tx, imp: Importacao, l: LinhaDeImportacao): Promise<ResultadoLinha> {
  const d = l.dados as unknown as DadosPdf;
  const hash = hashLinhaPdf(imp.tipo, imp.administradoraId, d, d.ocorrencia);
  if (await tx.bonusIncentivo.findUnique({ where: { hash }, select: { id: true } })) return { status: 'SEM_MUDANCA' };
  const cotaId = await localizarCota(tx, imp.administradoraId, d);
  const cota = cotaId ? await tx.cota.findUnique({ where: { id: cotaId }, include: { snapVendedor: true } }) : null;
  await tx.bonusIncentivo.create({
    data: {
      importacaoId: imp.id, cotaId, consorciado: d.consorciado, grupo: d.grupo, cota: d.cota, contrato: d.contrato, parcela: d.parcela,
      valorEvento: d.valorEvento ?? '0', percentualIncentivo: d.percentual ?? '0', valorBonus: d.valor,
      // Atribuição CONGELADA na importação: transferir a venda depois não reescreve.
      vendedorNaImportacaoId: cota?.snapVendedorId ?? null, vendedorNaImportacaoNome: cota?.snapVendedor?.nome ?? d.vendedor,
      equipeId: cota?.snapEquipeId ?? null, gerenciaId: cota?.snapGerenciaId ?? null,
      dataReferencia: deISO(d.data), hash, linhaOriginal: l.original,
    },
  });
  return { status: 'NOVA', ...(!cotaId ? { mensagem: 'Bônus sem vínculo com a carteira' } : {}) };
}

/** Reconcilia bônus sem vínculo com a carteira atual e congela a atribuição (ação registrada). */
export async function reconciliarBonus(sessao: Sessao): Promise<{ reconciliados: number; semVinculo: number }> {
  exigir(sessao, 'bonus', 'editar');
  const pendentes = await prisma.bonusIncentivo.findMany({ where: { cotaId: null }, include: { importacao: { select: { administradoraId: true } } } });
  let reconciliados = 0;
  for (const b of pendentes) {
    await prisma.$transaction(async (tx) => {
      const cotaId = await localizarCota(tx, b.importacao.administradoraId, {
        grupo: b.grupo, cota: b.cota, contrato: b.contrato, consorciado: null, vendedor: null, parcela: null, tipo: null, data: null, valor: '0', valorEvento: null, percentual: null,
      });
      if (!cotaId) return;
      const cota = await tx.cota.findUniqueOrThrow({ where: { id: cotaId }, include: { snapVendedor: true } });
      const depois = { cotaId, vendedorNaImportacaoId: cota.snapVendedorId, equipeId: cota.snapEquipeId, gerenciaId: cota.snapGerenciaId };
      await tx.bonusIncentivo.update({
        where: { id: b.id },
        data: { ...depois, vendedorNaImportacaoNome: cota.snapVendedor?.nome ?? b.vendedorNaImportacaoNome, reconciliadoEm: new Date(), reconciliadoPorId: sessao.usuarioId },
      });
      await auditar(tx, { sessao, acao: 'ALTERACAO', entidade: 'BonusIncentivo', entidadeId: b.id, antes: { cotaId: null }, depois, contexto: { operacao: 'reconciliação com a carteira' } });
      reconciliados++;
    });
  }
  return { reconciliados, semVinculo: pendentes.length - reconciliados };
}
