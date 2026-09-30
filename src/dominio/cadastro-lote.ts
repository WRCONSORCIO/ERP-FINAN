import { documentoValido, somenteDigitos } from '@/lib/documento';
import { normalizarNome } from '@/lib/texto';

/**
 * Cadastro de vendedores em lote a partir de uma planilha (CPF/CNPJ, nome, primeira venda, gerência, equipe,
 * categoria). Parte pura: lê as linhas e descobre quais CPF/CNPJ são da MESMA pessoa (o sistema junta os
 * documentos de uma pessoa para o Expert receber sobre o Veterano e para a produção somar).
 */
export interface LinhaLote {
  linha: number;
  documento: string;
  tipo: 'CPF' | 'CNPJ' | null;
  nome: string;
  inicio: string | null; // AAAA-MM-DD
  gerencia: string;
  equipe: string;
  categoria: string;
  /** Coluna opcional "MESMA PESSOA (CPF/CNPJ)": força juntar com esse documento. */
  mesmaPessoa: string | null;
  erro: string | null;
}

const COLUNAS: Record<Exclude<keyof LinhaLote, 'linha' | 'tipo' | 'erro'>, string[]> = {
  documento: ['CPF/CNPJ', 'CPF CNPJ', 'DOCUMENTO', 'CPF', 'CNPJ'],
  nome: ['NOME DO VENDEDOR', 'NOME', 'VENDEDOR'],
  inicio: ['PRIMEIRA VENDA', 'DATA DA PRIMEIRA VENDA', 'INICIO', 'DATA DE INICIO', 'DESDE', 'DATA'],
  gerencia: ['GERENCIA', 'GERENTE'],
  equipe: ['EQUIPE', 'SUPERVISOR', 'SUPERVISAO'],
  categoria: ['CATEGORIA'],
  mesmaPessoa: ['MESMA PESSOA', 'MESMA PESSOA CPF CNPJ', 'CPF DA PESSOA', 'JUNTAR COM'],
};

type Celula = string | number | Date | null | undefined;

function dataISO(v: Celula): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Número de série do Excel (dias desde 30/12/1899).
    return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const texto = (v: Celula) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')).replace(/\s+/g, ' ').trim();

/** Lê as linhas (a primeira que tiver "CPF"/"CNPJ" e "NOME" é o cabeçalho). */
export function lerLinhasLote(tabela: Celula[][]): LinhaLote[] {
  const iCab = tabela.findIndex((r) => {
    const n = r.map((c) => normalizarNome(texto(c)));
    return n.some((x) => x.includes('CPF') || x.includes('CNPJ') || x === 'DOCUMENTO') && n.some((x) => x.includes('NOME') || x === 'VENDEDOR');
  });
  if (iCab < 0) throw new Error('Não achei o cabeçalho: a planilha precisa das colunas CPF/CNPJ, Nome, Primeira venda, Gerência, Equipe e Categoria.');
  const cab = tabela[iCab]!.map((c) => normalizarNome(texto(c)));
  const indice = {} as Record<keyof typeof COLUNAS, number>;
  const usados = new Set<number>();
  // Nomes mais específicos primeiro, para "CPF/CNPJ" não virar "CPF DA PESSOA".
  for (const campo of ['mesmaPessoa', 'documento', 'nome', 'inicio', 'gerencia', 'equipe', 'categoria'] as const) {
    let achou = -1;
    for (const alvo of COLUNAS[campo]) {
      const a = normalizarNome(alvo);
      achou = cab.findIndex((c, i) => !usados.has(i) && c === a);
      if (achou < 0) achou = cab.findIndex((c, i) => !usados.has(i) && campo !== 'mesmaPessoa' && c.startsWith(a));
      if (achou >= 0) break;
    }
    indice[campo] = achou;
    if (achou >= 0) usados.add(achou);
  }
  const faltam = (['documento', 'nome', 'inicio', 'gerencia', 'equipe', 'categoria'] as const).filter((c) => indice[c] < 0);
  if (faltam.length > 0) throw new Error(`Faltam colunas na planilha: ${faltam.join(', ')}.`);

  const linhas: LinhaLote[] = [];
  tabela.slice(iCab + 1).forEach((r, i) => {
    const doc = somenteDigitos(texto(r[indice.documento]));
    const nome = texto(r[indice.nome]).toUpperCase();
    if (!doc && !nome) return;
    const tipo = doc.length === 11 ? 'CPF' : doc.length === 14 ? 'CNPJ' : null;
    const inicio = dataISO(r[indice.inicio]);
    const mesma = indice.mesmaPessoa >= 0 ? somenteDigitos(texto(r[indice.mesmaPessoa])) || null : null;
    const erro = !tipo || !documentoValido(doc) ? 'CPF/CNPJ inválido' : !nome ? 'Sem nome' : !inicio ? 'Data da primeira venda inválida' : null;
    linhas.push({
      linha: iCab + i + 2, documento: doc, tipo, nome, inicio,
      gerencia: texto(r[indice.gerencia]).toUpperCase(), equipe: texto(r[indice.equipe]).toUpperCase(), categoria: texto(r[indice.categoria]).toUpperCase(),
      mesmaPessoa: mesma, erro,
    });
  });
  const vistos = new Map<string, number>();
  for (const l of linhas) {
    if (l.erro) continue;
    const antes = vistos.get(l.documento);
    if (antes !== undefined) l.erro = `Documento repetido (já está na linha ${antes})`;
    else vistos.set(l.documento, l.linha);
  }
  return linhas;
}

// ---------- Quem é a mesma pessoa ----------

const LIGACAO = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM']);
const EMPRESA = /\b(LTDA|ME|EPP|EIRELI|S A|SA|MEI)\b/;
const PALAVRAS_DE_EMPRESA = new Set([
  'LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'MEI', 'CONSULTORIA', 'VENDAS', 'REPRESENTACOES', 'REPRESENTACAO', 'INVESTIMENTOS', 'INVESTIMENTO',
  'IMOBILIARIOS', 'IMOBILIARIA', 'IMOVEIS', 'CONSORCIOS', 'CONSORCIO', 'CONSORTIUM', 'SOLUCAO', 'SOLUCOES', 'FINANCEIRA', 'FINANCERA',
  'SERVICOS', 'NEGOCIOS', 'CORRETORA', 'CORRETAGEM', 'ASSESSORIA', 'COMERCIO', 'GESTAO', 'EMPREENDIMENTOS', 'PARTICIPACOES', 'GRUPO', 'SA',
]);

const palavras = (nome: string) => normalizarNome(nome).split(' ').filter((p) => p && !LIGACAO.has(p));
/** Mesma palavra, tolerando uma letra de diferença em palavras longas (MARIANE × MARIANNE, CARMO × CARMOS). */
function parecida(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}
const contem = (lista: string[], p: string) => lista.some((x) => parecida(x, p));

export type Semelhanca = 'IGUAL' | 'PARECIDO' | null;

/** Nome de pessoa × nome de pessoa, ou razão social × nome da pessoa. */
export function semelhanca(a: string, b: string): Semelhanca {
  const na = normalizarNome(a); const nb = normalizarNome(b);
  if (!na || !nb) return null;
  if (na === nb) return 'IGUAL';
  const pa = palavras(a); const pb = palavras(b);
  const empA = EMPRESA.test(na); const empB = EMPRESA.test(nb);
  if (empA !== empB) {
    // Razão social: o que sobra tirando as palavras de empresa precisa estar todo no nome da pessoa, começando pelo primeiro nome.
    const [emp, pes] = empA ? [pa, pb] : [pb, pa];
    const resto = emp.filter((p) => !PALAVRAS_DE_EMPRESA.has(p));
    return resto.length > 0 && resto[0] === pes[0] && resto.every((p) => contem(pes, p)) ? 'PARECIDO' : null;
  }
  if (pa[0] !== pb[0]) return null;
  const comuns = pa.filter((p) => contem(pb, p)).length;
  return comuns / Math.min(pa.length, pb.length) >= 0.75 ? 'PARECIDO' : null;
}

export interface PessoaExistente { pessoaId: string; nome: string; documentos: string[] }

export interface Agrupamento {
  /** Documento → chave do grupo (mesma chave = mesma pessoa). */
  grupo: Map<string, string>;
  /** Documento → pessoa já cadastrada com quem juntar. */
  pessoaExistente: Map<string, PessoaExistente>;
  /** Documentos juntados por nome parecido (não idêntico): conferir na prévia. */
  aproximados: Set<string>;
}

/**
 * Junta as linhas da mesma pessoa. Nome idêntico junta; nome parecido junta só quando há UM candidato
 * (senão fica separado — dá para juntar depois com "Mover documento"). A coluna "mesma pessoa" manda.
 */
export function agruparPessoas(linhas: LinhaLote[], existentes: PessoaExistente[]): Agrupamento {
  const validas = linhas.filter((l) => !l.erro);
  const pai = new Map<string, string>(validas.map((l) => [l.documento, l.documento]));
  const raiz = (d: string): string => { let r = d; while (pai.get(r) !== r) r = pai.get(r)!; return r; };
  const unir = (a: string, b: string) => { const ra = raiz(a); const rb = raiz(b); if (ra !== rb) pai.set(rb, ra); };
  const aproximados = new Set<string>();
  const pessoaPorDoc = new Map<string, PessoaExistente>();
  for (const p of existentes) for (const d of p.documentos) pessoaPorDoc.set(d, p);

  // 1. Coluna "mesma pessoa" e nome idêntico.
  for (const l of validas) if (l.mesmaPessoa && pai.has(l.mesmaPessoa)) unir(l.mesmaPessoa, l.documento);
  for (const a of validas) for (const b of validas) if (a.documento < b.documento && semelhanca(a.nome, b.nome) === 'IGUAL') unir(a.documento, b.documento);
  // 2. Nome parecido: só com candidato único (entre os grupos da planilha). Primeiro pessoa × pessoa, depois
  //    as razões sociais (senão "TAUANNE REPRESENTACOES LTDA" atrapalha juntar o CPF e o CNPJ da Tauanne).
  const ehEmpresa = (l: LinhaLote) => EMPRESA.test(normalizarNome(l.nome));
  for (const soPessoas of [true, false]) {
    for (const a of validas) {
      if (soPessoas && ehEmpresa(a)) continue;
      const candidatos = new Set(validas.filter((b) => b.documento !== a.documento && raiz(b.documento) !== raiz(a.documento) && !(soPessoas && ehEmpresa(b))
        && semelhanca(a.nome, b.nome) === 'PARECIDO').map((b) => raiz(b.documento)));
      if (candidatos.size === 1) {
        const [r] = [...candidatos];
        unir(r!, a.documento);
        aproximados.add(a.documento);
      }
    }
  }
  // 3. Pessoa já cadastrada: documento já no sistema, coluna "mesma pessoa", nome idêntico ou (único) parecido.
  const grupos = new Map<string, LinhaLote[]>();
  for (const l of validas) grupos.set(raiz(l.documento), [...(grupos.get(raiz(l.documento)) ?? []), l]);
  const pessoaExistente = new Map<string, PessoaExistente>();
  for (const membros of grupos.values()) {
    let achou = membros.map((l) => pessoaPorDoc.get(l.documento) ?? (l.mesmaPessoa ? pessoaPorDoc.get(l.mesmaPessoa) : undefined)).find(Boolean);
    let aprox = false;
    if (!achou) {
      const iguais = existentes.filter((p) => membros.some((l) => semelhanca(l.nome, p.nome) === 'IGUAL'));
      if (iguais.length === 1) achou = iguais[0];
      else if (iguais.length === 0) {
        const parecidos = existentes.filter((p) => membros.some((l) => semelhanca(l.nome, p.nome) === 'PARECIDO'));
        if (parecidos.length === 1) { achou = parecidos[0]; aprox = true; }
      }
    }
    if (!achou) continue;
    for (const l of membros) {
      pessoaExistente.set(l.documento, achou);
      if (aprox) aproximados.add(l.documento);
    }
  }
  return { grupo: new Map(validas.map((l) => [l.documento, raiz(l.documento)])), pessoaExistente, aproximados };
}

/** "RAFAEL" casa com a gerência "GERENCIA RAFAEL"; "TAUANNE" com a equipe "TAUANNE" ou "EQUIPE TAUANNE". */
export function casaUnidade(nomeCadastrado: string, nomePlanilha: string): boolean {
  const a = normalizarNome(nomeCadastrado).replace(/^(GERENCIA|EQUIPE|SUPERVISAO|TIME)\s+/, '');
  const b = normalizarNome(nomePlanilha).replace(/^(GERENCIA|EQUIPE|SUPERVISAO|TIME)\s+/, '');
  return a !== '' && a === b;
}
