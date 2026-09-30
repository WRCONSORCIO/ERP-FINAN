import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { LOGO_WR_PNG_BASE64 } from './logo-pdf';

/**
 * Extrato em PDF (A4 paisagem) com a identidade WR: faixa com logo, quadro de totais, tabelas com
 * cabeçalho repetido a cada página, linhas alternadas e rodapé paginado. Cores = tokens da marca.
 */
const cor = (hex: string): RGB => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const NOITE = cor('#032a2b');
const ESCURO = cor('#0a4b3a');
const ACAO = cor('#08935d');
const LIMA = cor('#7cc242');
const TEXTO = cor('#1a2320');
const APOIO = cor('#5b6763');
const SUAVE = cor('#8a9793');
const BORDA = cor('#e2e6e4');
const FUNDO = cor('#f4f6f5');
const VERDE_CLARO = cor('#e8f4ef');
const BRANCO = rgb(1, 1, 1);

export interface TabelaPdf {
  titulo: string;
  colunas: Array<{ titulo: string; largura: number; direita?: boolean }>;
  linhas: string[][];
  total?: string[];
  vazio?: string;
}

export interface ExtratoPdf {
  titulo: string;
  nome: string;
  periodo: string;
  detalhes: string[];
  resumo: Array<{ rotulo: string; valor: string; destaque?: boolean }>;
  tabelas: TabelaPdf[];
  rodape: string;
}

function limpar(s: string): string {
  // Fonte padrão (WinAnsi): troca caracteres fora do conjunto por equivalentes.
  return s.replace(/[→]/g, '->').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function cortar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  let t = limpar(texto);
  while (t.length > 1 && fonte.widthOfTextAtSize(t, tamanho) > largura - 10) t = t.slice(0, -2) + '.';
  return t;
}

export async function gerarPdfExtrato(p: ExtratoPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(limpar(`${p.titulo} · ${p.nome}`));
  doc.setAuthor('WR Consórcio');
  doc.setCreator('ERP WR Consórcio');
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo: PDFImage = await doc.embedPng(Buffer.from(LOGO_WR_PNG_BASE64, 'base64'));
  const L = 842;
  const A = 595;
  const M = 36;
  const LARGURA_UTIL = L - 2 * M;
  let pagina: PDFPage = doc.addPage([L, A]);
  let y = 0;

  const texto = (t: string, x: number, yy: number, tam: number, f: PDFFont, c: RGB) => pagina.drawText(limpar(t), { x, y: yy, size: tam, font: f, color: c });
  const aDireita = (t: string, xFim: number, yy: number, tam: number, f: PDFFont, c: RGB) => texto(t, xFim - f.widthOfTextAtSize(limpar(t), tam), yy, tam, f, c);

  /** Faixa completa na primeira página; faixa fina nas seguintes. */
  const cabecalho = (primeira: boolean) => {
    const h = primeira ? 104 : 44;
    pagina.drawRectangle({ x: 0, y: A - h, width: L, height: h, color: NOITE });
    pagina.drawRectangle({ x: 0, y: A - h, width: L, height: 3, color: ACAO });
    if (primeira) {
      pagina.drawImage(logo, { x: M, y: A - 86, width: 64, height: 64 });
      texto(p.titulo.toUpperCase(), M + 82, A - 40, 9, negrito, LIMA);
      texto(p.nome, M + 82, A - 64, 20, negrito, BRANCO);
      texto('WR Consórcio · ERP Financeiro e Comercial', M + 82, A - 82, 9, fonte, cor('#b9c9c3'));
      aDireita('PERÍODO', L - M, A - 40, 8, negrito, cor('#b9c9c3'));
      aDireita(p.periodo, L - M, A - 60, 14, negrito, BRANCO);
      y = A - h - 26;
    } else {
      pagina.drawImage(logo, { x: M, y: A - 36, width: 28, height: 28 });
      texto(`${p.titulo} · ${p.nome}`, M + 38, A - 27, 10, negrito, BRANCO);
      aDireita(p.periodo, L - M, A - 27, 10, fonte, cor('#b9c9c3'));
      y = A - h - 22;
    }
  };
  const novaPagina = () => {
    pagina = doc.addPage([L, A]);
    cabecalho(false);
  };
  cabecalho(true);

  // Detalhes (documentos etc.)
  for (const d of p.detalhes) {
    texto(d, M, y, 9, fonte, APOIO);
    y -= 13;
  }
  y -= 8;

  // Quadro de totais
  const n = p.resumo.length;
  const gap = 10;
  const wCard = (LARGURA_UTIL - gap * (n - 1)) / n;
  const hCard = 54;
  p.resumo.forEach((r, i) => {
    const x = M + i * (wCard + gap);
    pagina.drawRectangle({ x, y: y - hCard, width: wCard, height: hCard, color: r.destaque ? ESCURO : FUNDO, borderColor: r.destaque ? ESCURO : BORDA, borderWidth: 0.8 });
    pagina.drawRectangle({ x, y: y - hCard, width: 3, height: hCard, color: r.destaque ? LIMA : ACAO });
    texto(cortar(r.rotulo.toUpperCase(), negrito, 7.5, wCard - 8), x + 14, y - 18, 7.5, negrito, r.destaque ? cor('#b9c9c3') : SUAVE);
    texto(r.valor, x + 14, y - 40, 15, negrito, r.destaque ? BRANCO : TEXTO);
  });
  y -= hCard + 28;

  for (const t of p.tabelas) {
    const soma = t.colunas.reduce((s, c) => s + c.largura, 0);
    const escala = LARGURA_UTIL / soma;
    const cols = t.colunas.map((c) => ({ ...c, largura: c.largura * escala }));
    const LINHA = 18;

    if (y < M + 90) novaPagina();
    texto(t.titulo, M, y, 12, negrito, ESCURO);
    pagina.drawRectangle({ x: M, y: y - 6, width: 28, height: 2, color: ACAO });
    y -= 20;

    const desenharCabecalho = () => {
      pagina.drawRectangle({ x: M, y: y - 6, width: LARGURA_UTIL, height: LINHA, color: VERDE_CLARO });
      let x = M;
      for (const c of cols) {
        const txt = cortar(c.titulo.toUpperCase(), negrito, 7, c.largura);
        if (c.direita) aDireita(txt, x + c.largura - 5, y, 7, negrito, ESCURO);
        else texto(txt, x + 5, y, 7, negrito, ESCURO);
        x += c.largura;
      }
      y -= LINHA;
    };
    desenharCabecalho();

    if (t.linhas.length === 0) {
      texto(t.vazio ?? 'Nenhum registro no período.', M + 5, y - 2, 9, fonte, SUAVE);
      y -= LINHA + 4;
    }
    t.linhas.forEach((linha, i) => {
      if (y < M + 34) { novaPagina(); desenharCabecalho(); }
      if (i % 2 === 1) pagina.drawRectangle({ x: M, y: y - 6, width: LARGURA_UTIL, height: LINHA, color: FUNDO });
      let x = M;
      cols.forEach((c, j) => {
        const txt = cortar(linha[j] ?? '', fonte, 8.5, c.largura);
        if (c.direita) aDireita(txt, x + c.largura - 5, y, 8.5, fonte, TEXTO);
        else texto(txt, x + 5, y, 8.5, fonte, TEXTO);
        x += c.largura;
      });
      y -= LINHA;
    });
    if (t.total) {
      if (y < M + 34) novaPagina();
      pagina.drawRectangle({ x: M, y: y - 6, width: LARGURA_UTIL, height: LINHA + 2, color: ESCURO });
      // O rótulo do total ocupa as colunas vazias seguintes (não fica cortado na primeira coluna).
      const larguras = cols.map((c) => c.largura);
      for (let j = 1; j < cols.length && (t.total[j] ?? '') === ''; j++) {
        if (t.total.slice(j).some((v) => v !== '')) { larguras[0] = (larguras[0] ?? 0) + (larguras[j] ?? 0); larguras[j] = 0; } else break;
      }
      let x = M;
      cols.forEach((c, j) => {
        const largura = larguras[j] ?? 0;
        if (largura === 0) { x += c.largura; return; }
        const txt = cortar(t.total?.[j] ?? '', negrito, 9, j === 0 ? largura : c.largura);
        if (c.direita) aDireita(txt, x + c.largura - 5, y, 9, negrito, BRANCO);
        else texto(txt, x + 5, y, 9, negrito, BRANCO);
        x += c.largura;
      });
      y -= LINHA + 4;
    }
    y -= 22;
  }

  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 30 }, end: { x: L - M, y: 30 }, thickness: 0.6, color: BORDA });
    pg.drawText(limpar(p.rodape), { x: M, y: 18, size: 7.5, font: fonte, color: SUAVE });
    const num = `Página ${i + 1} de ${paginas.length}`;
    pg.drawText(num, { x: L - M - fonte.widthOfTextAtSize(num, 7.5), y: 18, size: 7.5, font: fonte, color: SUAVE });
  });
  return doc.save();
}
