import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { deISO, formatarData } from '@/lib/datas';
import { ErroDeDominio } from '@/lib/erros';
import { normalizarNome } from '@/lib/texto';
import { agruparPessoas, casaUnidade, lerLinhasLote, type PessoaExistente } from '@/dominio/cadastro-lote';
import { exigir, type Sessao } from '../contexto';
import { criarEquipe, criarGerencia } from './estrutura';
import { cadastrarVendedor } from './vendedores';

/** Uma linha da prévia: o que vai acontecer com cada CPF/CNPJ da planilha. */
export interface ItemLote {
  linha: number;
  documento: string;
  tipo: 'CPF' | 'CNPJ';
  nome: string;
  inicio: string; // AAAA-MM-DD
  categoriaId: string;
  categoriaNome: string;
  gerencia: string;
  equipe: string;
  /** Gerência/equipe ainda não existem: são criadas ao cadastrar. */
  criarGerencia: boolean;
  criarEquipe: boolean;
  /** Outros documentos da planilha que são da mesma pessoa. */
  juntarCom: Array<{ documento: string; nome: string }>;
  /** Pessoa já cadastrada com quem este documento é juntado. */
  pessoaExistente: { id: string; nome: string } | null;
  /** Juntado por nome parecido (não idêntico): conferir. */
  conferir: boolean;
}

export interface PreviaLote {
  cadastrar: ItemLote[];
  jaCadastrados: Array<{ linha: number; documento: string; nome: string; aviso: string | null; pessoaId: string }>;
  erros: Array<{ linha: number; documento: string; nome: string; erro: string }>;
}

type Celula = string | number | Date | null;

async function lerTabela(bytes: Uint8Array, nomeArquivo: string): Promise<Celula[][]> {
  if (/\.(csv|txt)$/i.test(nomeArquivo)) {
    const txt = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
    const sep = (txt.split('\n')[0] ?? '').includes(';') ? ';' : ',';
    return txt.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new ErroDeDominio('Não consegui abrir o arquivo. Envie a planilha em .xlsx ou .csv.');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ErroDeDominio('A planilha está vazia.');
  const tabela: Celula[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const valores = (r.values as unknown[]).slice(1);
    tabela.push(valores.map((c) => {
      if (c === null || c === undefined) return null;
      if (c instanceof Date || typeof c === 'string' || typeof c === 'number') return c;
      const o = c as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
      if (o.richText) return o.richText.map((t) => t.text).join('');
      const v = o.result ?? o.text;
      return v instanceof Date || typeof v === 'string' || typeof v === 'number' ? v : String(v ?? '');
    }));
  });
  return tabela;
}

/** Lê a planilha e monta a prévia. Não grava nada. */
export async function previaCadastroLote(s: Sessao, arquivo: { bytes: Uint8Array; nome: string }): Promise<PreviaLote> {
  exigir(s, 'vendedores', 'editar');
  let linhas;
  try {
    linhas = lerLinhasLote(await lerTabela(arquivo.bytes, arquivo.nome));
  } catch (e) {
    if (e instanceof ErroDeDominio) throw e;
    throw new ErroDeDominio(e instanceof Error ? e.message : 'Não consegui ler a planilha.');
  }
  const [categorias, gerencias, vendedores] = await Promise.all([
    prisma.categoriaVendedor.findMany({ where: { ativo: true } }),
    prisma.gerencia.findMany({ where: { status: 'ATIVO' }, include: { equipes: { where: { status: 'ATIVO' } } } }),
    prisma.vendedor.findMany({
      select: { documento: true, pessoaId: true, pessoa: { select: { nome: true } }, categorias: { select: { vigenteDe: true }, orderBy: { vigenteDe: 'asc' }, take: 1 }, alocacoes: { select: { vigenteDe: true }, orderBy: { vigenteDe: 'asc' }, take: 1 } },
    }),
  ]);
  const porDoc = new Map(vendedores.map((v) => [v.documento, v]));
  const pessoas = new Map<string, PessoaExistente>();
  for (const v of vendedores) {
    const p = pessoas.get(v.pessoaId) ?? { pessoaId: v.pessoaId, nome: v.pessoa.nome, documentos: [] };
    p.documentos.push(v.documento);
    pessoas.set(v.pessoaId, p);
  }
  const grupos = agruparPessoas(linhas, [...pessoas.values()]);
  const membrosDo = new Map<string, typeof linhas>();
  for (const l of linhas) {
    const g = grupos.grupo.get(l.documento);
    if (g) membrosDo.set(g, [...(membrosDo.get(g) ?? []), l]);
  }

  const previa: PreviaLote = { cadastrar: [], jaCadastrados: [], erros: [] };
  for (const l of linhas) {
    const erro = (msg: string) => previa.erros.push({ linha: l.linha, documento: l.documento, nome: l.nome, erro: msg });
    if (l.erro || !l.tipo || !l.inicio) { erro(l.erro ?? 'Linha inválida'); continue; }
    const existente = porDoc.get(l.documento);
    if (existente) {
      const primeira = [existente.categorias[0]?.vigenteDe, existente.alocacoes[0]?.vigenteDe].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
      const inicio = deISO(l.inicio);
      previa.jaCadastrados.push({
        linha: l.linha, documento: l.documento, nome: existente.pessoa.nome, pessoaId: existente.pessoaId,
        aviso: primeira && inicio && primeira > inicio
          ? `A categoria ou a equipe começa em ${formatarData(primeira)}, depois da primeira venda (${formatarData(inicio)}): corrija a data na ficha.`
          : null,
      });
      continue;
    }
    const cat = categorias.find((c) => normalizarNome(c.codigo) === normalizarNome(l.categoria) || normalizarNome(c.nome) === normalizarNome(l.categoria));
    if (!cat) { erro(`Categoria "${l.categoria}" não existe (use ${categorias.map((c) => c.nome).join(', ')})`); continue; }
    if (!cat.documentosAceitos.includes(l.tipo)) { erro(`A categoria ${cat.nome} não aceita ${l.tipo}`); continue; }
    if (!l.gerencia || !l.equipe) { erro('Falta a gerência ou a equipe'); continue; }
    const gs = gerencias.filter((g) => casaUnidade(g.nome, l.gerencia));
    if (gs.length > 1) { erro(`Há mais de uma gerência "${l.gerencia}"`); continue; }
    const es = gs[0] ? gs[0].equipes.filter((e) => casaUnidade(e.nome, l.equipe)) : [];
    if (es.length > 1) { erro(`Há mais de uma equipe "${l.equipe}" na gerência ${gs[0]!.nome}`); continue; }
    const g = grupos.grupo.get(l.documento)!;
    const membros = membrosDo.get(g) ?? [];
    const pe = grupos.pessoaExistente.get(l.documento);
    previa.cadastrar.push({
      linha: l.linha, documento: l.documento, tipo: l.tipo, nome: l.nome, inicio: l.inicio,
      categoriaId: cat.id, categoriaNome: cat.nome,
      gerencia: gs[0]?.nome ?? `GERENCIA ${l.gerencia}`, equipe: es[0]?.nome ?? l.equipe,
      criarGerencia: gs.length === 0, criarEquipe: es.length === 0,
      juntarCom: membros.filter((m) => m.documento !== l.documento && !m.erro).map((m) => ({ documento: m.documento, nome: m.nome })),
      pessoaExistente: pe ? { id: pe.pessoaId, nome: pe.nome } : null,
      conferir: membros.some((m) => grupos.aproximados.has(m.documento)),
    });
  }
  return previa;
}

export const esquemaItemLote = z.object({
  linha: z.number().int(),
  documento: z.string().regex(/^\d{11}$|^\d{14}$/),
  tipo: z.enum(['CPF', 'CNPJ']),
  nome: z.string().min(1).max(150),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoriaId: z.string().min(1),
  gerencia: z.string().min(1).max(80),
  equipe: z.string().min(1).max(80),
  juntarCom: z.array(z.string().regex(/^\d{11}$|^\d{14}$/)).max(20),
  pessoaExistenteId: z.string().nullable(),
});
export const esquemaExecutarLote = z.object({ itens: z.array(esquemaItemLote).min(1).max(10) });

export interface ResultadoItemLote { documento: string; ok: boolean; mensagem: string }

/**
 * Cadastra um pedaço da prévia (poucos por vez, para caber no tempo de uma requisição). Cada documento é um
 * cadastro normal (com auditoria e vínculo das vendas que o aguardavam); um erro não impede os outros.
 */
export async function executarCadastroLote(s: Sessao, d: z.infer<typeof esquemaExecutarLote>): Promise<ResultadoItemLote[]> {
  exigir(s, 'vendedores', 'editar');
  const r: ResultadoItemLote[] = [];
  for (const it of d.itens) {
    try {
      const equipeId = await garantirEquipe(s, it.gerencia, it.equipe);
      // Mesma pessoa: a já cadastrada, ou a de outro documento da planilha que já foi cadastrado.
      let pessoaId = it.pessoaExistenteId;
      if (!pessoaId && it.juntarCom.length > 0) {
        pessoaId = (await prisma.vendedor.findFirst({ where: { documento: { in: it.juntarCom } }, select: { pessoaId: true } }))?.pessoaId ?? null;
      }
      const v = await cadastrarVendedor(s, {
        pessoaId, tipoDocumento: it.tipo, documento: it.documento, nome: it.nome, categoriaId: it.categoriaId, equipeId, vigenteDe: deISO(it.inicio) as Date,
      });
      r.push({ documento: it.documento, ok: true, mensagem: `Cadastrado${pessoaId ? ' (junto da mesma pessoa)' : ''}${v.vinculadas > 0 ? ` · ${v.vinculadas} venda(s) vinculada(s)` : ''}` });
    } catch (e) {
      r.push({ documento: it.documento, ok: false, mensagem: e instanceof ErroDeDominio ? e.message : 'Erro ao cadastrar (nada gravado para este documento)' });
      if (!(e instanceof ErroDeDominio)) console.error('cadastro-lote', e);
    }
  }
  return r;
}

async function garantirEquipe(s: Sessao, gerenciaNome: string, equipeNome: string): Promise<string> {
  const gerencias = await prisma.gerencia.findMany({ where: { status: 'ATIVO' }, include: { equipes: { where: { status: 'ATIVO' } } } });
  let g = gerencias.find((x) => casaUnidade(x.nome, gerenciaNome));
  if (!g) g = { ...(await criarGerencia(s, { nome: gerenciaNome })), equipes: [] };
  const e = g.equipes.find((x) => casaUnidade(x.nome, equipeNome));
  return e ? e.id : (await criarEquipe(s, { nome: equipeNome, gerenciaId: g.id })).id;
}
