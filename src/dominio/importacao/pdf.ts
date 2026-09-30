import { createHash } from 'node:crypto';
import { lerMoedaTexto, lerPercentualTexto, paraTexto, somar, type Dec } from '@/lib/dinheiro';
import { deBR, paraISO } from '@/lib/datas';
import { somenteDigitos } from '@/lib/documento';
import type { LayoutPdf } from './layouts';

export interface LinhaPdf {
  grupo: string;
  cota: string;
  contrato: string | null;
  consorciado: string | null;
  vendedor: string | null;
  /** Documento do vendedor, do cabeçalho "VENDEDOR (CPF/CNPJ)" (só dígitos). */
  vendedorDocumento?: string | null;
  parcela: number | null;
  tipo: string | null;
  data: string | null;
  /** Data da venda impressa no relatório. */
  dataVenda?: string | null;
  valor: string;
  valorEvento: string | null;
  percentual: string | null;
  flex?: string | null;
}

export interface ResultadoLeituraPdf {
  linhas: Array<{ numero: number; original: string; dados: LinhaPdf }>;
  erros: Array<{ numero: number; original: string; motivo: string }>;
  totalArquivo: Dec | null;
  totalReconhecido: Dec;
}

const PARECE_DADO = /\d{3,6}\s*[/.\- ]\s*\d{1,4}.*\d,\d{2}/;

/**
 * Lê as linhas de texto de um relatório PDF segundo o layout configurado.
 * Com `inicioRegistro`, cada venda ocupa `linhasPorRegistro` linhas (cabeçalhos de página no meio são pulados)
 * e a expressão é aplicada às linhas unidas por " | ". O vendedor vem do último cabeçalho "VENDEDOR" visto.
 * Registro ou linha com cara de dado que não casa vai para a lista de erros (nada some em silêncio);
 * a conferência contra o total do rodapé denuncia o que ainda assim escapar.
 */
export function lerRelatorioPdf(linhasTexto: readonly string[], layout: LayoutPdf): ResultadoLeituraPdf {
  const reLinha = new RegExp(layout.linha, 'i');
  const reTotal = new RegExp(layout.total, 'i');
  const reInicio = layout.inicioRegistro ? new RegExp(layout.inicioRegistro, 'i') : null;
  const reVendedor = layout.cabecalhoVendedor ? new RegExp(layout.cabecalhoVendedor, 'i') : null;
  const reIgnorar = layout.ignorar ? new RegExp(layout.ignorar, 'i') : null;
  const tamanho = Math.max(1, layout.linhasPorRegistro ?? 1);
  const r: ResultadoLeituraPdf = { linhas: [], erros: [], totalArquivo: null, totalReconhecido: lerMoedaTexto('0') as Dec };
  const valores: Dec[] = [];
  const texto = linhasTexto.map((l) => l.replace(/\s+/g, ' ').trim());
  let vendedor: { nome: string | null; documento: string | null } = { nome: null, documento: null };

  const registrar = (numero: number, original: string) => {
    const m = reLinha.exec(original);
    if (!m?.groups) {
      r.erros.push({ numero, original, motivo: reInicio ? 'Venda não reconhecida pelo layout do relatório' : 'Linha com valor não reconhecida pelo layout do relatório' });
      return;
    }
    const g = m.groups;
    const valor = lerMoedaTexto(g.valor);
    if (!g.grupo || !g.cota || !valor) {
      r.erros.push({ numero, original, motivo: 'Grupo, cota ou valor ilegível' });
      return;
    }
    const data = g.data ? deBR(g.data) : null;
    const dataVenda = g.dataVenda ? deBR(g.dataVenda) : null;
    const valorEvento = g.valorEvento ? lerMoedaTexto(g.valorEvento) : null;
    const percentual = g.percentual ? lerPercentualTexto(g.percentual) : null;
    const flex = g.flex ? lerPercentualTexto(g.flex) : null;
    valores.push(valor);
    r.linhas.push({
      numero,
      original,
      dados: {
        grupo: g.grupo.replace(/^0+(?=\d)/, ''), cota: g.cota.replace(/^0+(?=\d)/, ''),
        contrato: g.contrato?.trim() || null, consorciado: g.consorciado?.trim() || null,
        vendedor: g.vendedor?.trim() || vendedor.nome, vendedorDocumento: vendedor.documento,
        parcela: g.parcela ? Number(g.parcela) : null, tipo: g.tipo?.trim() || null, data: data ? paraISO(data) : null,
        dataVenda: dataVenda ? paraISO(dataVenda) : null,
        valor: paraTexto(valor), valorEvento: valorEvento ? paraTexto(valorEvento) : null, percentual: percentual ? paraTexto(percentual) : null,
        flex: flex ? paraTexto(flex) : null,
      },
    });
  };

  for (let i = 0; i < texto.length; i++) {
    const linha = texto[i] as string;
    if (linha === '') continue;
    const numero = i + 1;
    const t = reTotal.exec(linha);
    if (t?.groups?.total) {
      const total = lerMoedaTexto(t.groups.total);
      if (total) r.totalArquivo = (r.totalArquivo ?? (lerMoedaTexto('0') as Dec)).plus(total);
      continue;
    }
    const v = reVendedor?.exec(linha);
    if (v?.groups) {
      const doc = somenteDigitos(v.groups.vendedorDocumento ?? '');
      vendedor = { nome: v.groups.vendedor?.trim() || null, documento: doc === '' ? null : doc };
      continue;
    }
    if (reInicio?.test(linha)) {
      const partes = [linha];
      let j = i + 1;
      while (partes.length < tamanho && j < texto.length) {
        const prox = texto[j] as string;
        if (prox !== '' && !(reIgnorar?.test(prox)) && !reVendedor?.test(prox)) {
          if (reInicio.test(prox)) break; // registro incompleto: o próximo começa aqui
          partes.push(prox);
        }
        j++;
      }
      registrar(numero, partes.join(' | '));
      i = j - 1;
      continue;
    }
    if (reIgnorar?.test(linha)) continue;
    if (reInicio) {
      if (PARECE_DADO.test(linha)) r.erros.push({ numero, original: linha, motivo: 'Linha solta fora de uma venda do relatório' });
      continue;
    }
    if (reLinha.test(linha) || PARECE_DADO.test(linha)) registrar(numero, linha);
  }
  r.totalReconhecido = somar(valores);
  return r;
}

export function hashLinhaPdf(tipo: string, administradoraId: string, d: LinhaPdf, ocorrencia: number): string {
  const chave = [tipo, administradoraId, d.grupo, d.cota, d.contrato ?? '', d.parcela ?? '', d.tipo ?? '', d.data ?? '', d.valor, d.vendedor ?? '', d.consorciado ?? '', ocorrencia].join('|');
  return createHash('sha256').update(chave).digest('hex');
}
