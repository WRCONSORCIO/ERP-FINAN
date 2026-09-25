import type { ComissaoApurada, DestinoComissao, Estorno, Prisma, TipoPendencia } from '@prisma/client';
import type { Tx } from '@/lib/db';
import { aplicarPercentual, dec, formatarMoeda, paraTexto, somar, ZERO, type Dec } from '@/lib/dinheiro';
import { formatarData } from '@/lib/datas';
import { resolverVigente } from '@/dominio/vigencia';
import {
  calcularBase, calcularComissoes, destinosDaCategoria, type CategoriaDaVenda, type Destino, type LinhaComissao,
  type TabelaResolvida, type TitularResolvido,
} from '@/dominio/comissao';
import { calcularEstornos, tipoDeEstorno, type ConfigEstorno, type RegraEstornoResolvida } from '@/dominio/estorno';
import { paraJson } from './json';
import { notificar } from './notificacoes';

interface PendenciaAtual {
  tipo: TipoPendencia;
  destino: Destino | null;
  descricao: string;
  detalhe?: unknown;
}

export interface ResumoApuracao {
  comissoesCriadas: number;
  comissoesCanceladas: number;
  comissoesLiberadas: number;
  ajustesCriados: number;
  estornosCriados: number;
  estornosInvalidados: number;
  pendencias: number;
}

const CONGELADAS = new Set(['EM_FOLHA', 'PAGA']);

function chavePendencia(p: PendenciaAtual): string {
  return `${p.tipo}|${p.destino ?? '-'}`;
}

async function tabelaVigente(tx: Tx, p: {
  destino: Destino; segmentoId: string; categoriaId: string | null; titularVendedorId: string | null; titularPessoaId: string | null; data: Date;
}): Promise<TabelaResolvida | null> {
  const candidatas = await tx.tabelaComissao.findMany({
    where: {
      destino: p.destino, segmentoId: p.segmentoId, categoriaId: p.categoriaId,
      vigenteDe: { lte: p.data }, OR: [{ vigenteAte: null }, { vigenteAte: { gte: p.data } }],
    },
    include: { faixas: true },
  });
  const excecao = candidatas.find((t) =>
    p.destino === 'VENDEDOR' ? t.titularVendedorId !== null && t.titularVendedorId === p.titularVendedorId
      : t.titularPessoaId !== null && t.titularPessoaId === p.titularPessoaId);
  const padrao = candidatas.filter((t) => t.titularVendedorId === null && t.titularPessoaId === null);
  const escolhida = excecao ?? resolverVigente(padrao, p.data);
  if (!escolhida) return null;
  return {
    id: escolhida.id, vigenteDe: escolhida.vigenteDe, vigenteAte: escolhida.vigenteAte, excecao: escolhida === excecao,
    faixas: escolhida.faixas.map((f) => ({ parcela: f.parcela, percentual: dec(f.percentual) })),
  };
}

function iguais(a: Dec, b: Dec): boolean {
  return a.equals(b);
}

/**
 * Apura UMA cota: comissões (pela data da venda, a partir do snapshot congelado),
 * estornos (percentual pela data do cancelamento) e pendências.
 * Append-only: nada é sobrescrito — linha que mudou é cancelada e outra é criada;
 * linha em folha fechada nunca é tocada: a diferença vira AJUSTE.
 */
export async function apurarCota(tx: Tx, cotaId: string, agora = new Date()): Promise<ResumoApuracao> {
  const resumo: ResumoApuracao = {
    comissoesCriadas: 0, comissoesCanceladas: 0, comissoesLiberadas: 0, ajustesCriados: 0, estornosCriados: 0, estornosInvalidados: 0, pendencias: 0,
  };
  const cota = await tx.cota.findUniqueOrThrow({
    where: { id: cotaId },
    include: { snapCategoria: true, snapSegmento: true, snapModalidadeFlex: true, snapVendedor: { include: { pessoa: true } } },
  });
  const pendencias: PendenciaAtual[] = [];
  const credito = dec(cota.credito);

  // ---------- 1. Snapshot completo? ----------
  if (!cota.snapVendedorId || !cota.snapVendedor) {
    pendencias.push(cota.vendedorNomeImportado || cota.vendedorDocImportado
      ? { tipo: 'VENDEDOR_SEM_CADASTRO', destino: null, descricao: `Vendedor "${cota.vendedorNomeImportado ?? cota.vendedorDocImportado}" não tem cadastro comercial` }
      : { tipo: 'SEM_VENDEDOR', destino: null, descricao: 'A base de clientes não identificou vendedor para esta venda' });
  } else {
    if (!cota.snapCategoriaId) pendencias.push({ tipo: 'SEM_CATEGORIA', destino: null, descricao: `Vendedor sem categoria vigente em ${formatarData(cota.dataVenda)}` });
    if (!cota.snapEquipeId) pendencias.push({ tipo: 'SEM_ESTRUTURA', destino: null, descricao: `Vendedor sem equipe/gerência vigente em ${formatarData(cota.dataVenda)}` });
  }
  if (!cota.snapSegmentoId) pendencias.push({ tipo: 'SEM_SEGMENTO', destino: null, descricao: `Segmento "${cota.segmentoTexto ?? '(vazio)'}" não reconhecido no cadastro de segmentos` });
  if (!cota.snapModalidadeFlexId) pendencias.push({ tipo: 'SEM_FLEX', destino: null, descricao: `Modalidade flex "${cota.flexTexto ?? '(vazio)'}" não reconhecida no cadastro de flex` });

  // ---------- 2. Comissões ----------
  const desejadas: LinhaComissao[] = [];
  /** Valores da tabela por destino, independentes do titular — base do estorno. */
  const valoresPorDestino = new Map<Destino, Array<{ parcela: number; valor: Dec; percentual: Dec }>>();
  const titulares = new Map<Destino, TitularResolvido | null>();
  // Comportamento da categoria como estava CONGELADO na venda (não o cadastro de hoje).
  const categoria = cota.snapCategoria && cota.snapPagaPelaWr !== null && cota.snapGeraSupervisao !== null && cota.snapGeraGerencia !== null
    ? { id: cota.snapCategoria.id, codigo: cota.snapCategoria.codigo, nome: cota.snapCategoria.nome, pagaPelaWr: cota.snapPagaPelaWr, geraSupervisao: cota.snapGeraSupervisao, geraGerencia: cota.snapGeraGerencia }
    : null;
  const podeCalcular = categoria && cota.snapSegmento && cota.snapModalidadeFlex && cota.snapVendedor;

  if (podeCalcular) {
    const pessoasIds = [cota.snapSupervisorPessoaId, cota.snapGerentePessoaId].filter((x): x is string => x !== null);
    const pessoas = new Map((await tx.pessoa.findMany({ where: { id: { in: pessoasIds } } })).map((p) => [p.id, p]));
    const titularDe = (destino: Destino): TitularResolvido | null => {
      if (destino === 'VENDEDOR') {
        const v = cota.snapVendedor!;
        return { pessoaId: v.pessoaId, vendedorId: v.id, nome: v.pessoa.nome };
      }
      const pid = destino === 'SUPERVISAO' ? cota.snapSupervisorPessoaId : cota.snapGerentePessoaId;
      const p = pid ? pessoas.get(pid) : undefined;
      return p ? { pessoaId: p.id, vendedorId: null, nome: p.nome } : null;
    };
    const base = calcularBase(credito, dec(cota.snapModalidadeFlex!.percentual));
    const entradaDestinos = [];
    for (const destino of destinosDaCategoria(categoria)) {
      const titular = titularDe(destino);
      titulares.set(destino, titular);
      const tabela = await tabelaVigente(tx, {
        destino, segmentoId: cota.snapSegmento!.id, categoriaId: destino === 'VENDEDOR' ? categoria.id : null,
        titularVendedorId: destino === 'VENDEDOR' ? cota.snapVendedorId : null,
        titularPessoaId: destino === 'VENDEDOR' ? null : (titular?.pessoaId ?? null), data: cota.dataVenda,
      });
      if (tabela) {
        valoresPorDestino.set(destino, tabela.faixas.map((f) => ({ parcela: f.parcela, percentual: f.percentual, valor: aplicarPercentual(base, f.percentual) })));
      }
      entradaDestinos.push({ destino, titular, tabela });
    }
    const r = calcularComissoes({
      cota: { id: cota.id, credito, dataVenda: cota.dataVenda, parcelasPagas: cota.parcelasPagas },
      categoria,
      segmento: { codigo: cota.snapSegmento!.codigo, nome: cota.snapSegmento!.nome },
      flex: {
        id: cota.snapModalidadeFlex!.id, codigo: cota.snapModalidadeFlex!.codigo, nome: cota.snapModalidadeFlex!.nome,
        percentual: dec(cota.snapModalidadeFlex!.percentual), vigenteDe: cota.snapModalidadeFlex!.vigenteDe, vigenteAte: cota.snapModalidadeFlex!.vigenteAte,
      },
      destinos: entradaDestinos,
    });
    desejadas.push(...r.linhas);
    for (const p of r.pendencias) pendencias.push({ tipo: p.tipo, destino: p.destino, descricao: p.descricao });
  }

  await sincronizarComissoes(tx, cota, desejadas, pendencias, resumo, agora);

  // ---------- 3. Estornos ----------
  await sincronizarEstornos(tx, cota, { categoria, titulares, valoresPorDestino }, pendencias, resumo);

  // ---------- 4. Pendências ----------
  await sincronizarPendencias(tx, cota.id, pendencias, agora);
  resumo.pendencias = pendencias.length;

  if (pendencias.some((p) => p.tipo === 'SEM_TABELA' || p.tipo === 'ESTORNO_SEM_REGRA' || p.tipo === 'ESTORNO_SEM_CONFIGURACAO')) {
    const p = pendencias.find((x) => x.tipo === 'SEM_TABELA' || x.tipo === 'ESTORNO_SEM_REGRA' || x.tipo === 'ESTORNO_SEM_CONFIGURACAO') as PendenciaAtual;
    await notificar(tx, {
      tipo: 'REGRA_FALTANTE', severidade: 'CRITICA', titulo: 'Regra faltante: dinheiro não apurado',
      mensagem: p.descricao, link: '/importacoes#diagnostico', chave: `regra-faltante-${p.tipo}-${p.descricao}`, perfis: ['ADMINISTRADOR', 'FINANCEIRO'],
    });
  }
  return resumo;
}

type CotaApuracao = Prisma.CotaGetPayload<{ include: { snapCategoria: true; snapSegmento: true; snapModalidadeFlex: true; snapVendedor: { include: { pessoa: true } } } }>;

async function sincronizarComissoes(tx: Tx, cota: CotaApuracao, desejadas: LinhaComissao[], pendencias: PendenciaAtual[], resumo: ResumoApuracao, agora: Date) {
  const ativas = await tx.comissaoApurada.findMany({ where: { cotaId: cota.id, status: { not: 'CANCELADA' } }, orderBy: { criadoEm: 'asc' } });
  const grupos = new Map<string, ComissaoApurada[]>();
  for (const c of ativas) {
    const k = `${c.destino}|${c.parcela}`;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const desejadasPorChave = new Map(desejadas.map((d) => [`${d.destino}|${d.parcela}`, d]));
  const chaves = new Set([...grupos.keys(), ...desejadasPorChave.keys()]);

  const cancelar = async (c: ComissaoApurada, motivo: string) => {
    await tx.comissaoApurada.update({ where: { id: c.id }, data: { status: 'CANCELADA', canceladaEm: agora, motivoCancelamento: motivo } });
    resumo.comissoesCanceladas++;
  };
  const liberarSeCabe = async (c: ComissaoApurada) => {
    if (c.status === 'PREVISTA' && c.parcela <= cota.parcelasPagas) {
      await tx.comissaoApurada.update({ where: { id: c.id }, data: { status: 'LIBERADA', liberadaEm: agora, parcelasPagasNaLiberacao: cota.parcelasPagas } });
      resumo.comissoesLiberadas++;
    } else if (c.status === 'PREVISTA' && cota.cancelada) {
      await cancelar(c, 'Venda cancelada: a parcela não será paga pelo cliente');
    }
  };

  for (const chave of chaves) {
    const linhas = grupos.get(chave) ?? [];
    const d = desejadasPorChave.get(chave) ?? null;
    const congeladas = linhas.filter((c) => CONGELADAS.has(c.status));
    const abertas = linhas.filter((c) => !CONGELADAS.has(c.status));

    if (congeladas.length === 0) {
      // Caso comum: nada em folha fechada — mantém se igual, senão cancela e cria outra.
      const original = abertas.find((c) => c.ajusteDeId === null);
      const igual = d && original && abertas.length === 1 && iguais(dec(original.valor), d.valor) && iguais(dec(original.base), d.base)
        && iguais(dec(original.percentual), d.percentual) && original.titularPessoaId === d.titular.pessoaId
        && original.tabelaId === d.tabelaId && original.pagaPelaWr === d.pagaPelaWr;
      if (igual && original) {
        await liberarSeCabe(original);
        continue;
      }
      for (const c of abertas) await cancelar(c, d ? 'Reapuração: snapshot ou regra mudou — substituída por nova linha' : 'Reapuração: comissão não se aplica mais a esta venda');
      if (d && (d.liberada || !cota.cancelada)) {
        await criarComissao(tx, cota.id, d, null, d.valor, d.memoria, cota.parcelasPagas, agora);
        resumo.comissoesCriadas++;
      }
      continue;
    }

    // Há linha em folha fechada: ela nunca muda. A diferença entre o devido e o já fechado vira AJUSTE por titular.
    const originalCongelada = congeladas.find((c) => c.ajusteDeId === null) ?? (congeladas[0] as ComissaoApurada);
    const fechadoPorTitular = new Map<string, Dec>();
    for (const c of congeladas) fechadoPorTitular.set(c.titularPessoaId, (fechadoPorTitular.get(c.titularPessoaId) ?? ZERO).plus(dec(c.valor)));
    const devidoPorTitular = new Map<string, Dec>();
    if (d && (d.liberada || !cota.cancelada)) devidoPorTitular.set(d.titular.pessoaId, d.valor);
    const ajusteNecessario = new Map<string, Dec>();
    for (const t of new Set([...fechadoPorTitular.keys(), ...devidoPorTitular.keys()])) {
      const diff = (devidoPorTitular.get(t) ?? ZERO).minus(fechadoPorTitular.get(t) ?? ZERO);
      if (!diff.isZero()) ajusteNecessario.set(t, diff);
    }
    const abertoPorTitular = new Map<string, Dec>();
    for (const c of abertas) abertoPorTitular.set(c.titularPessoaId, (abertoPorTitular.get(c.titularPessoaId) ?? ZERO).plus(dec(c.valor)));
    const mesmaCoisa = ajusteNecessario.size === abertoPorTitular.size
      && [...ajusteNecessario.entries()].every(([t, v]) => abertoPorTitular.get(t)?.equals(v) ?? false);
    if (mesmaCoisa) {
      for (const c of abertas) await liberarSeCabe(c);
      continue;
    }
    for (const c of abertas) await cancelar(c, 'Reapuração: ajuste recalculado');
    for (const [pessoaId, valor] of ajusteNecessario) {
      const ehDevido = d !== null && d.titular.pessoaId === pessoaId;
      const ref = ehDevido ? d : null;
      const congeladaDoTitular = congeladas.find((c) => c.titularPessoaId === pessoaId) ?? originalCongelada;
      const fechado = fechadoPorTitular.get(pessoaId) ?? ZERO;
      const devido = devidoPorTitular.get(pessoaId) ?? ZERO;
      const memoriaBase = ref ? ref.memoria : (congeladaDoTitular.memoria as unknown as LinhaComissao['memoria']);
      const memoria = {
        ...memoriaBase,
        formula: `Ajuste: devido ${formatarMoeda(devido)} − já fechado em folha ${formatarMoeda(fechado)} = ${formatarMoeda(valor)}`,
        ajuste: {
          motivo: 'A comissão desta parcela já estava em folha fechada quando a reapuração mudou o valor devido. A folha não é alterada; a diferença entra como ajuste.',
          linhaOriginalId: originalCongelada.id, devido: paraTexto(devido), jaFechado: paraTexto(fechado), ajuste: paraTexto(valor),
        },
      };
      const linha: LinhaComissao = ref ?? {
        destino: originalCongelada.destino as Destino,
        parcela: originalCongelada.parcela,
        titular: { pessoaId, vendedorId: congeladaDoTitular.titularVendedorId, nome: '' },
        tabelaId: congeladaDoTitular.tabelaId,
        base: dec(congeladaDoTitular.base),
        percentual: dec(congeladaDoTitular.percentual),
        valor,
        pagaPelaWr: congeladaDoTitular.pagaPelaWr,
        liberada: originalCongelada.parcela <= cota.parcelasPagas,
        memoria: memoriaBase,
      };
      await criarComissao(tx, cota.id, linha, originalCongelada.id, valor, memoria, cota.parcelasPagas, agora);
      resumo.ajustesCriados++;
    }
    pendencias.push({
      tipo: 'AJUSTE_FOLHA_FECHADA', destino: originalCongelada.destino as Destino,
      descricao: `${originalCongelada.parcela}ª parcela já estava em folha fechada; a diferença foi lançada como ajuste para a próxima folha`,
      detalhe: { parcela: originalCongelada.parcela, ajustes: [...ajusteNecessario.entries()].map(([p, v]) => ({ pessoaId: p, valor: paraTexto(v) })) },
    });
  }
}

async function criarComissao(tx: Tx, cotaId: string, d: LinhaComissao, ajusteDeId: string | null, valor: Dec, memoria: unknown, parcelasPagas: number, agora: Date) {
  const liberada = d.parcela <= parcelasPagas;
  await tx.comissaoApurada.create({
    data: {
      cotaId, parcela: d.parcela, destino: d.destino as DestinoComissao,
      titularVendedorId: d.destino === 'VENDEDOR' ? d.titular.vendedorId : null,
      titularPessoaId: d.titular.pessoaId, tabelaId: d.tabelaId,
      base: paraTexto(d.base), percentual: paraTexto(d.percentual), valor: paraTexto(valor),
      pagaPelaWr: d.pagaPelaWr, status: liberada ? 'LIBERADA' : 'PREVISTA',
      liberadaEm: liberada ? agora : null, parcelasPagasNaLiberacao: liberada ? parcelasPagas : null,
      memoria: paraJson(memoria) ?? {}, ajusteDeId,
    },
  });
}

async function sincronizarEstornos(
  tx: Tx,
  cota: CotaApuracao,
  ctx: { categoria: CategoriaDaVenda | null; titulares: Map<Destino, TitularResolvido | null>; valoresPorDestino: Map<Destino, Array<{ parcela: number; valor: Dec; percentual: Dec }>> },
  pendencias: PendenciaAtual[],
  resumo: ResumoApuracao,
) {
  const ativos = await tx.estorno.findMany({ where: { cotaId: cota.id, status: { not: 'INVALIDADO' } } });
  const porDestino = new Map<Destino, Estorno>(ativos.map((e) => [e.destino as Destino, e]));
  const agora = new Date();
  const invalidar = async (e: Estorno, motivo: string) => {
    if (e.status !== 'A_COBRAR') {
      pendencias.push({ tipo: 'ESTORNO_DIVERGENTE', destino: e.destino as Destino, descricao: `Estorno já ${e.status === 'EM_COBRANCA' ? 'em cobrança' : e.status.toLowerCase()} não pode ser invalidado: ${motivo}` });
      return false;
    }
    await tx.estorno.update({ where: { id: e.id }, data: { status: 'INVALIDADO', invalidadoEm: agora, motivoInvalidacao: motivo } });
    await tx.estornoMovimento.create({ data: { estornoId: e.id, de: e.status, para: 'INVALIDADO', motivo } });
    resumo.estornosInvalidados++;
    return true;
  };

  if (!cota.cancelada || !cota.dataCancelamento) {
    for (const e of ativos) await invalidar(e, 'A venda não está mais cancelada na base de clientes');
    return;
  }
  if (!ctx.categoria) return; // sem categoria não há comissão: a pendência SEM_CATEGORIA já cobre

  const dataCanc = cota.dataCancelamento;
  const configs = await tx.configuracaoEstorno.findMany({ where: { vigenteDe: { lte: dataCanc } } });
  const cfgRow = resolverVigente(configs, dataCanc);
  const config: ConfigEstorno | null = cfgRow
    ? { id: cfgRow.id, participantes: cfgRow.participantes, criterio: cfgRow.criterioCancelamento, limiteParcelas: cfgRow.limiteParcelas, criterioRecuperacao: cfgRow.criterioRecuperacao, limiteRecuperacao: cfgRow.limiteRecuperacao, escopoBase: cfgRow.escopoBase, vigenteDe: cfgRow.vigenteDe, vigenteAte: cfgRow.vigenteAte }
    : null;
  const tipo = config ? tipoDeEstorno({ cancelada: true, parcelasPagas: cota.parcelasPagas, recuperacao: cota.snapRecuperacao }, config) : null;

  const regras = tipo ? await tx.regraEstorno.findMany({ where: { tipo, vigenteDe: { lte: dataCanc } } }) : [];
  /** Precedência: exceção do vendedor › percentual do participante (categoria/supervisão/gerência) › padrão. */
  const regraPara = (destino: Destino, participante: string): RegraEstornoResolvida | null => {
    const vigentes = regras.filter((r) => r.vigenteDe <= dataCanc && (r.vigenteAte === null || r.vigenteAte >= dataCanc));
    const excecao = destino === 'VENDEDOR' ? vigentes.find((r) => r.titularVendedorId === cota.snapVendedorId) : undefined;
    const doParticipante = vigentes.find((r) => r.titularVendedorId === null && r.participante === participante);
    const padrao = resolverVigente(vigentes.filter((x) => x.titularVendedorId === null && x.participante === null), dataCanc);
    const r = excecao ?? doParticipante ?? padrao;
    return r ? { id: r.id, percentual: dec(r.percentual), excecao: r === excecao, participante: r.participante, vigenteDe: r.vigenteDe, vigenteAte: r.vigenteAte } : null;
  };

  const r = calcularEstornos({
    cota: { id: cota.id, cancelada: true, dataCancelamento: dataCanc, parcelasPagas: cota.parcelasPagas, recuperacao: cota.snapRecuperacao, origemDataCancelamento: cota.origemDataCancelamento },
    config,
    destinos: destinosDaCategoria(ctx.categoria).map((destino) => {
      const participante = destino === 'VENDEDOR' ? ctx.categoria!.codigo : destino;
      return {
      destino,
      participante,
      titular: ctx.titulares.get(destino) ?? null,
      regra: regraPara(destino, participante),
      comissoes: ctx.valoresPorDestino.get(destino) ?? null,
      };
    }),
  });
  for (const p of r.pendencias) pendencias.push({ tipo: p.tipo, destino: p.destino, descricao: p.descricao });

  const debito = await tx.lancamentoAdministradora.findFirst({
    where: { cotaId: cota.id, tipo: 'CANCELAMENTO', dataReferencia: { not: null } }, orderBy: { dataReferencia: 'asc' },
  });
  const destinosComEstorno = new Set<Destino>();
  for (const l of r.linhas) {
    destinosComEstorno.add(l.destino);
    const existente = porDestino.get(l.destino);
    if (existente) {
      const igual = dec(existente.valor).equals(l.valor) && existente.tipo === l.tipo && existente.titularPessoaId === (l.titular?.pessoaId ?? null);
      if (igual) {
        if (debito?.dataReferencia && !existente.dataDebitoAdm) {
          await tx.estorno.update({ where: { id: existente.id }, data: { dataDebitoAdm: debito.dataReferencia } });
        }
        continue;
      }
      if (!(await invalidar(existente, 'Reapuração: valor, tipo ou titular do estorno mudou'))) continue;
    }
    const criado = await tx.estorno.create({
      data: {
        cotaId: cota.id, destino: l.destino, tipo: l.tipo,
        titularVendedorId: l.titular?.vendedorId ?? null, titularPessoaId: l.titular?.pessoaId ?? null,
        configuracaoId: l.configuracaoId, regraId: l.regraId, parcelasPagas: cota.parcelasPagas,
        comissaoBase: paraTexto(l.comissaoBase), percentual: paraTexto(l.percentual), valor: paraTexto(l.valor),
        dataEvento: dataCanc, dataDebitoAdm: debito?.dataReferencia ?? null, memoria: paraJson(l.memoria) ?? {},
      },
    });
    await tx.estornoMovimento.create({ data: { estornoId: criado.id, de: 'A_COBRAR', para: 'A_COBRAR', valor: paraTexto(l.valor), motivo: 'Estorno apurado' } });
    resumo.estornosCriados++;
    if (!l.titular) {
      await notificar(tx, {
        tipo: 'ESTORNO_SEM_TITULAR', severidade: 'CRITICA', titulo: 'Estorno sem titular',
        mensagem: `Estorno de ${formatarMoeda(l.valor)} (grupo ${cota.grupo}/${cota.cota}) não tem de quem ser cobrado.`,
        link: `/clientes/${cota.id}`, chave: `estorno-sem-titular-${criado.id}`, perfis: ['ADMINISTRADOR', 'FINANCEIRO'],
      });
    }
  }
  for (const e of ativos) {
    if (!destinosComEstorno.has(e.destino as Destino)) await invalidar(e, 'Reapuração: o estorno não se aplica mais (critério ou participantes)');
  }
}

async function sincronizarPendencias(tx: Tx, cotaId: string, atuais: PendenciaAtual[], agora: Date) {
  const abertas = await tx.pendencia.findMany({ where: { cotaId, resolvidaEm: null } });
  const chavesAtuais = new Set(atuais.map(chavePendencia));
  const resolver = abertas.filter((p) => !chavesAtuais.has(p.chave)).map((p) => p.id);
  if (resolver.length > 0) await tx.pendencia.updateMany({ where: { id: { in: resolver } }, data: { resolvidaEm: agora } });
  const existentes = new Set(abertas.map((p) => p.chave));
  const novas = atuais.filter((p) => !existentes.has(chavePendencia(p)));
  if (novas.length > 0) {
    await tx.pendencia.createMany({
      data: novas.map((p) => {
        const detalhe = paraJson(p.detalhe);
        return {
          cotaId, tipo: p.tipo, destino: p.destino as DestinoComissao | null, chave: chavePendencia(p), descricao: p.descricao,
          ...(detalhe !== null ? { detalhe } : {}),
        };
      }),
      skipDuplicates: true,
    });
  }
}

/** Soma de comissão por cota — usada em simulação e relatórios. */
export function totalDeComissao(linhas: ReadonlyArray<{ valor: Dec }>): Dec {
  return somar(linhas.map((l) => l.valor));
}
