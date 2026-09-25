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
