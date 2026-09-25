import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/** PDF simples e conferível (A4 paisagem): cabeçalho, tabela com quebra de página e totais. Cores = tokens da marca. */
const ESCURO = rgb(10 / 255, 75 / 255, 58 / 255);
const TEXTO = rgb(26 / 255, 35 / 255, 32 / 255);
const APOIO = rgb(91 / 255, 103 / 255, 99 / 255);
const BORDA = rgb(226 / 255, 230 / 255, 228 / 255);

export interface TabelaPdf {
  titulo: string;
  colunas: Array<{ titulo: string; largura: number; direita?: boolean }>;
  linhas: string[][];
  total?: string[];
}

function limpar(s: string): string {
  // Fonte padrão (WinAnsi): troca caracteres fora do conjunto por equivalentes.
  return s.replace(/[→]/g, '->').replace(/[–—]/g, '-').replace(/[^\x20-\x7E -ÿ]/g, '?');
}

function cortar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  let t = limpar(texto);
  while (t.length > 1 && fonte.widthOfTextAtSize(t, tamanho) > largura - 6) t = t.slice(0, -2) + '.';
  return t;
}

export async function gerarPdfExtrato(p: { titulo: string; subtitulo: string[]; tabelas: TabelaPdf[]; resumo: Array<[string, string]>; rodape: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(limpar(p.titulo));
  doc.setCreator('ERP WR Consórcio');
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = 842;
  const A = 595;
  const M = 32;
  let pagina: PDFPage = doc.addPage([L, A]);
  let y = A - M;

  const cabecalho = () => {
    pagina.drawRectangle({ x: 0, y: A - 46, width: L, height: 46, color: ESCURO });
    pagina.drawText('WR Consórcio', { x: M, y: A - 28, size: 13, font: negrito, color: rgb(1, 1, 1) });
    pagina.drawText(limpar(p.titulo), { x: M + 110, y: A - 28, size: 11, font: fonte, color: rgb(1, 1, 1) });
    y = A - 64;
  };
  const novaPagina = () => {
    pagina = doc.addPage([L, A]);
    cabecalho();
  };
  const garantir = (altura: number) => {
    if (y - altura < M + 20) novaPagina();
  };
  cabecalho();
  for (const s of p.subtitulo) {
    pagina.drawText(limpar(s), { x: M, y, size: 9.5, font: fonte, color: APOIO });
    y -= 13;
  }
  y -= 6;
  for (const [k, v] of p.resumo) {
    pagina.drawText(limpar(k), { x: M, y, size: 10, font: fonte, color: APOIO });
    pagina.drawText(limpar(v), { x: M + 230, y, size: 10, font: negrito, color: TEXTO });
    y -= 14;
  }
  y -= 8;

  for (const t of p.tabelas) {
    garantir(40);
    pagina.drawText(limpar(t.titulo), { x: M, y, size: 11, font: negrito, color: ESCURO });
    y -= 16;
    const desenharCabecalho = () => {
      let x = M;
      for (const c of t.colunas) {
        const txt = cortar(c.titulo, negrito, 8, c.largura);
        const w = negrito.widthOfTextAtSize(txt, 8);
        pagina.drawText(txt, { x: c.direita ? x + c.largura - w - 3 : x + 3, y, size: 8, font: negrito, color: APOIO });
        x += c.largura;
      }
      y -= 4;
      pagina.drawLine({ start: { x: M, y }, end: { x: L - M, y }, thickness: 0.8, color: BORDA });
      y -= 11;
    };
    desenharCabecalho();
    const linhas = t.total ? [...t.linhas, t.total] : t.linhas;
    linhas.forEach((linha, i) => {
      if (y < M + 24) { novaPagina(); desenharCabecalho(); }
      const ehTotal = t.total !== undefined && i === linhas.length - 1;
      let x = M;
      t.colunas.forEach((c, j) => {
        const f = ehTotal ? negrito : fonte;
        const txt = cortar(linha[j] ?? '', f, 8.5, c.largura);
        const w = f.widthOfTextAtSize(txt, 8.5);
        pagina.drawText(txt, { x: c.direita ? x + c.largura - w - 3 : x + 3, y, size: 8.5, font: f, color: TEXTO });
        x += c.largura;
      });
      y -= 4;
      pagina.drawLine({ start: { x: M, y }, end: { x: L - M, y }, thickness: 0.3, color: BORDA });
      y -= 10;
    });
    y -= 12;
  }
  const paginas = doc.getPages();
  paginas.forEach((pg, i) => pg.drawText(limpar(`${p.rodape} · página ${i + 1} de ${paginas.length}`), { x: M, y: 16, size: 7.5, font: fonte, color: APOIO }));
  return doc.save();
}
