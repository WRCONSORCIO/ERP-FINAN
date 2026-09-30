import { prisma } from '@/lib/db';
import type { PerfilCodigo } from '@/lib/permissoes';
import type { Sessao } from '@/servidor/contexto';
import { aplicarLote, receberArquivo } from '@/servidor/importacao';
import { processarFila } from '@/servidor/fila';
import { cadastrarVendedor } from '@/servidor/servicos/vendedores';
import { criarEquipe, criarGerencia, definirResponsavel } from '@/servidor/servicos/estrutura';
import { semearCargaInicial } from '../../prisma/carga-seed';
import { deISO } from '@/lib/datas';

export const D = (s: string) => deISO(s) as Date;

let seq = 0;
export async function sessao(perfil: PerfilCodigo, escopo: { gerenciaId?: string; equipeId?: string } = {}): Promise<Sessao> {
  seq++;
  const u = await prisma.usuario.create({
    data: { nome: `${perfil} ${seq}`, email: `u${seq}-${Date.now()}@teste.local`, perfil, senhaHash: 'x', gerenciaId: escopo.gerenciaId ?? null, equipeId: escopo.equipeId ?? null },
  });
  return { usuarioId: u.id, nome: u.nome, email: u.email, perfil, gerenciaId: u.gerenciaId, equipeId: u.equipeId, ip: '127.0.0.1' };
}

/** Carga inicial da especificação com vigência desde 01/01/2026 (cobre as datas de teste). */
export async function preparar() {
  await semearCargaInicial(prisma, '2026-01-01');
  const admin = await sessao('ADMINISTRADOR');
  const adm = await prisma.administradora.findFirstOrThrow();
  const cat = Object.fromEntries((await prisma.categoriaVendedor.findMany()).map((c) => [c.codigo, c.id])) as Record<'INICIANTE' | 'VETERANO' | 'EXPERT', string>;
  return { admin, administradoraId: adm.id, cat };
}

export async function estrutura(admin: Sessao, nome: string) {
  const g = await criarGerencia(admin, { nome: `G ${nome}` });
  const e = await criarEquipe(admin, { nome: `E ${nome}`, gerenciaId: g.id });
  await definirResponsavel(admin, { papel: 'GERENTE', unidadeId: g.id, pessoaId: null, novoNome: `Gerente ${nome}`, vigenteDe: D('2026-01-01') });
  await definirResponsavel(admin, { papel: 'SUPERVISOR', unidadeId: e.id, pessoaId: null, novoNome: `Supervisor ${nome}`, vigenteDe: D('2026-01-01') });
  const gerente = await prisma.responsavelUnidade.findFirstOrThrow({ where: { gerenciaId: g.id } });
  const supervisor = await prisma.responsavelUnidade.findFirstOrThrow({ where: { equipeId: e.id } });
  return { gerenciaId: g.id, equipeId: e.id, gerentePessoaId: gerente.pessoaId, supervisorPessoaId: supervisor.pessoaId };
}

export async function vendedor(admin: Sessao, p: { nome: string; tipo: 'CPF' | 'CNPJ'; doc: string; categoriaId: string; equipeId: string; desde?: string; pessoaId?: string }) {
  const r = await cadastrarVendedor(admin, {
    pessoaId: p.pessoaId ?? null, tipoDocumento: p.tipo, documento: p.doc, nome: p.nome, categoriaId: p.categoriaId, equipeId: p.equipeId, vigenteDe: D(p.desde ?? '2026-01-01'),
  });
  return r.vendedor;
}

export const CABECALHO = 'NOME;CPF;GRUPO;COTA;CONTRATO;VALOR DO CRÉDITO;DATA DA VENDA;PARCELAS PAGAS;SITUAÇÃO;VENDEDOR;CPF VENDEDOR;SEGMENTO;MODALIDADE;DATA CANCELAMENTO';

export interface LinhaTeste {
  cliente?: string; cpf?: string; grupo: string; cota: string; contrato?: string; credito: string; venda: string; pagas: number;
  situacao?: string; vendedor?: string; docVendedor?: string; segmento?: string; flex?: string; cancelamento?: string;
}

export function csv(linhas: LinhaTeste[]): Uint8Array {
  const corpo = linhas.map((l) => [
    l.cliente ?? `CLIENTE ${l.grupo}/${l.cota}`, l.cpf ?? '52998224725', l.grupo, l.cota, l.contrato ?? `C${l.grupo}${l.cota}`, l.credito, l.venda, String(l.pagas),
    l.situacao ?? 'ATIVO', l.vendedor ?? '', l.docVendedor ?? '', l.segmento ?? 'IMÓVEL', l.flex ?? 'FLEX 50', l.cancelamento ?? '',
  ].join(';'));
  return new Uint8Array(Buffer.from([CABECALHO, ...corpo].join('\r\n') + '\r\n', 'latin1'));
}

/** Recebe, aplica todos os lotes e esvazia a fila de apuração. */
export async function importar(s: Sessao, administradoraId: string, bytes: Uint8Array, nome = 'base.csv', extrairPdf?: (b: Uint8Array) => Promise<string[]>) {
  const r = await receberArquivo(s, { administradoraId, nomeArquivo: nome, bytes }, extrairPdf ? { extrairPdf } : {});
  for (let i = 0; i < 1000; i++) if ((await aplicarLote(s, r.importacaoId)).concluida) break;
  await apurarTudo();
  return r;
}

export async function apurarTudo() {
  for (let i = 0; i < 1000; i++) {
    const f = await processarFila(500);
    if (f.processados === 0) return f;
  }
  throw new Error('fila não esvaziou');
}

export async function comissoesDa(cotaId: string) {
  return prisma.comissaoApurada.findMany({ where: { cotaId, status: { not: 'CANCELADA' } }, orderBy: [{ destino: 'asc' }, { parcela: 'asc' }, { criadoEm: 'asc' }] });
}

export const valores = (l: Array<{ destino: string; parcela: number; valor: { toFixed(n: number): string }; status: string }>) =>
  l.map((c) => `${c.destino}:${c.parcela}:${c.valor.toFixed(2)}:${c.status}`);

export const PDF_TESTE = new Uint8Array(Buffer.from('%PDF-1.4 relatório de teste'));
const moeda = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const docFmt = (d: string) => (d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`);

export interface ParcelaRelatorio {
  grupo: string; cota: string; contrato: string; credito: number; parcela: number; data: string; venda: string;
  /** CPF/CNPJ do vendedor no cabeçalho do relatório. */ doc: string; valor?: number;
}

/** CV056E (comissão da WR) no layout real: uma venda em 3 linhas abaixo do vendedor. Parcela 1 = "inclusão". */
export function relatorioWr(itens: ParcelaRelatorio[]): string[] {
  const linhas = ['SERVOPA ADMINISTRADORA DE CONSORCIOS LTDA CV056E HORA: 20:12 PAGINA: 1'];
  let total = 0;
  for (const i of itens) {
    const v = i.valor ?? 100;
    total += v;
    linhas.push(
      `VENDEDOR (CPF/CNPJ): ${docFmt(i.doc)} - VENDEDOR TESTE`,
      `${i.contrato} E CLIENTE ${i.grupo}/${i.cota} / 31 90000.0000`,
      `${i.grupo.padStart(4, '0')}.${i.cota.padStart(4, '0')}.1 CREDITO P/IMOVEL 7 ${moeda(i.credito)} ${moeda(v)} 0,00 0,00 1,0000`,
      i.parcela === 1 ? `INCLUSAO DE PLANO ${i.data} ${i.venda} I` : `PAGAMENTO COMISSAO ${i.parcela} ${i.data} ${i.venda} I`,
      `Total do Vendedor ......: ${moeda(v)} 0,00 0,00`,
    );
  }
  void total;
  return linhas;
}

/** CV069E (o que a administradora paga ao vendedor) no layout real. Parcela 1 = sem número. */
export function relatorioAdm(itens: ParcelaRelatorio[]): string[] {
  const linhas = ['SERVOPA ADMINISTRADORA DE CONSORCIOS LTDA CV069E HORA: 20:11 PAGINA: 1'];
  for (const i of itens) {
    const v = i.valor ?? 100;
    linhas.push(
      `VENDEDOR (CPF/CNPJ): ${docFmt(i.doc)} - VENDEDOR TESTE`,
      `${i.grupo.padStart(4, '0')}.${i.cota.padStart(4, '0')} -1 E CLIENTE ${i.grupo}/${i.cota} / 31 90000.0000`,
      `${i.contrato} ${moeda(i.credito)} ${moeda(v)} 0,00 0,00 0,4000`,
      i.parcela === 1 ? `${i.data} ${i.venda} I` : `${i.parcela} ${i.data} ${i.venda} I`,
      `Total do Vendedor ......: ${moeda(v)} 0,00 0,00`,
    );
  }
  return linhas;
}

let seqPdf = 0;
/** Importa um relatório PDF de teste (o conteúdo vem pronto em linhas) e esvazia a fila. */
export async function importarRelatorio(s: Sessao, administradoraId: string, linhas: string[]) {
  seqPdf++;
  return importar(s, administradoraId, new Uint8Array(Buffer.from(`%PDF-1.4 teste ${seqPdf} ${Date.now()}`)), `relatorio-${seqPdf}.pdf`, async () => linhas);
}
