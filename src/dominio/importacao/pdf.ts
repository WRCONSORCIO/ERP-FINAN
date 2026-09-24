import { createHash } from 'node:crypto';
import { lerMoedaTexto, lerPercentualTexto, paraTexto, somar, type Dec } from '@/lib/dinheiro';
import { deBR, paraISO } from '@/lib/datas';
import type { LayoutPdf } from './layouts';

export interface LinhaPdf {
  grupo: string;
  cota: string;
  contrato: string | null;
  consorciado: string | null;
  vendedor: string | null;
  parcela: number | null;
  tipo: string | null;
  data: string | null;
  valor: string;
  valorEvento: string | null;
  percentual: string | null;
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
 * Linha com cara de dado que não casa com o layout vai para a lista de erros (nada some em silêncio);
 * a conferência contra o total do rodapé denuncia o que ainda assim escapar.
 */
export function lerRelatorioPdf(linhasTexto: readonly string[], layout: LayoutPdf): ResultadoLeituraPdf {
  const reLinha = new RegExp(layout.linha, 'i');
  const reTotal = new RegExp(layout.total, 'i');
  const r: ResultadoLeituraPdf = { linhas: [], erros: [], totalArquivo: null, totalReconhecido: lerMoedaTexto('0') as Dec };
  const valores: Dec[] = [];

  linhasTexto.forEach((bruta, i) => {
    const linha = bruta.replace(/\s+/g, ' ').trim();
    if (linha === '') return;
    const numero = i + 1;
    const t = reTotal.exec(linha);
    if (t?.groups?.total) {
      const total = lerMoedaTexto(t.groups.total);
      if (total) r.totalArquivo = (r.totalArquivo ?? (lerMoedaTexto('0') as Dec)).plus(total);
      return;
    }
    const m = reLinha.exec(linha);
    if (!m?.groups) {
      if (PARECE_DADO.test(linha)) r.erros.push({ numero, original: linha, motivo: 'Linha com valor não reconhecida pelo layout do relatório' });
      return;
    }
    const g = m.groups;
    const valor = lerMoedaTexto(g.valor);
    if (!g.grupo || !g.cota || !valor) {
      r.erros.push({ numero, original: linha, motivo: 'Grupo, cota ou valor ilegível' });
      return;
    }
    const data = g.data ? deBR(g.data) : null;
    const valorEvento = g.valorEvento ? lerMoedaTexto(g.valorEvento) : null;
    const percentual = g.percentual ? lerPercentualTexto(g.percentual) : null;
    valores.push(valor);
    r.linhas.push({
      numero,
      original: linha,
      dados: {
        grupo: g.grupo.replace(/^0+(?=\d)/, ''), cota: g.cota.replace(/^0+(?=\d)/, ''),
        contrato: g.contrato?.trim() || null, consorciado: g.consorciado?.trim() || null, vendedor: g.vendedor?.trim() || null,
        parcela: g.parcela ? Number(g.parcela) : null, tipo: g.tipo?.trim() || null, data: data ? paraISO(data) : null,
        valor: paraTexto(valor), valorEvento: valorEvento ? paraTexto(valorEvento) : null, percentual: percentual ? paraTexto(percentual) : null,
      },
    });
  });
  r.totalReconhecido = somar(valores);
  return r;
}

export function hashLinhaPdf(tipo: string, administradoraId: string, d: LinhaPdf, ocorrencia: number): string {
  const chave = [tipo, administradoraId, d.grupo, d.cota, d.contrato ?? '', d.parcela ?? '', d.tipo ?? '', d.data ?? '', d.valor, d.vendedor ?? '', d.consorciado ?? '', ocorrencia].join('|');
  return createHash('sha256').update(chave).digest('hex');
}
