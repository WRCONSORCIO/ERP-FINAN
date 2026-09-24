import ExcelJS from 'exceljs';
import { dec, formatarMoeda, type EntradaDecimal } from './dinheiro';
import { formatarData } from './datas';

export type TipoColuna = 'texto' | 'moeda' | 'percentual' | 'data' | 'inteiro';
export interface Coluna<T> {
  titulo: string;
  tipo: TipoColuna;
  valor: (l: T) => string | number | Date | EntradaDecimal | null | undefined;
}

function textoCsv(tipo: TipoColuna, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (tipo === 'moeda') return dec(v as EntradaDecimal).toFixed(2).replace('.', ',');
  if (tipo === 'percentual') return dec(v as EntradaDecimal).toFixed(4).replace('.', ',');
  if (tipo === 'data') return v instanceof Date ? formatarData(v) : String(v);
  return String(v);
}

function escapar(s: string): string {
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV para conferência/contabilidade: separador ";", decimal com vírgula, UTF-8 com BOM (abre direto no Excel). */
export function gerarCsv<T>(colunas: Coluna<T>[], linhas: readonly T[], rodape?: Array<string>): Uint8Array {
  const partes = [colunas.map((c) => escapar(c.titulo)).join(';')];
  for (const l of linhas) partes.push(colunas.map((c) => escapar(textoCsv(c.tipo, c.valor(l)))).join(';'));
  if (rodape) partes.push(rodape.map(escapar).join(';'));
  return new TextEncoder().encode('﻿' + partes.join('\r\n') + '\r\n');
}

/**
 * XLSX: células numéricas para a contabilidade somar. O Excel armazena ponto flutuante, então o valor é
 * arredondado a centavos (Decimal, ROUND_HALF_UP) ANTES de virar célula; totais de rodapé vêm do Decimal, não de fórmula.
 */
export async function gerarXlsx<T>(nomeAba: string, colunas: Coluna<T>[], linhas: readonly T[], rodape?: Array<string>, titulo?: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP WR Consórcio';
  wb.created = new Date();
  const ws = wb.addWorksheet(nomeAba.slice(0, 31));
  let linhaCabecalho = 1;
  if (titulo) {
    ws.addRow([titulo]).font = { bold: true, size: 12 };
    ws.addRow([]);
    linhaCabecalho = 3;
  }
  const cab = ws.addRow(colunas.map((c) => c.titulo));
  cab.font = { bold: true };
  cab.eachCell((c) => { c.border = { bottom: { style: 'thin' } }; });
  for (const l of linhas) {
    ws.addRow(colunas.map((c) => {
      const v = c.valor(l);
      if (v === null || v === undefined) return null;
      if (c.tipo === 'moeda') return Number(dec(v as EntradaDecimal).toFixed(2));
      if (c.tipo === 'percentual') return Number(dec(v as EntradaDecimal).toFixed(4));
      if (c.tipo === 'data') return v instanceof Date ? new Date(v.getTime() + 12 * 3_600_000) : String(v);
      if (c.tipo === 'inteiro') return typeof v === 'number' ? v : Number.parseInt(String(v), 10);
      return String(v);
    }));
  }
  if (rodape) ws.addRow(rodape).font = { bold: true };
  colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(48, Math.max(12, c.titulo.length + 4));
    if (c.tipo === 'moeda') col.numFmt = '#,##0.00';
    if (c.tipo === 'percentual') col.numFmt = '0.0000';
    if (c.tipo === 'data') col.numFmt = 'dd/mm/yyyy';
  });
  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }];
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function totalFormatado(v: EntradaDecimal): string {
  return formatarMoeda(v);
}
