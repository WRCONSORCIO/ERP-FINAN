import 'server-only';

/**
 * Extrai o texto de um PDF em linhas, reconstruídas pela posição vertical dos trechos (pdfjs-dist).
 * Retorna as linhas na ordem de leitura, página a página.
 */
export async function extrairLinhasPdf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const saida: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    const porLinha = new Map<number, Array<{ x: number; s: string }>>();
    for (const item of conteudo.items) {
      if (!('str' in item) || item.str.trim() === '') continue;
      const y = Math.round(item.transform[5] as number);
      const x = item.transform[4] as number;
      const chave = [...porLinha.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      const lista = porLinha.get(chave) ?? [];
      lista.push({ x, s: item.str });
      porLinha.set(chave, lista);
    }
    const ys = [...porLinha.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const partes = (porLinha.get(y) ?? []).sort((a, b) => a.x - b.x).map((t) => t.s.trim());
      saida.push(partes.join(' '));
    }
    pagina.cleanup();
  }
  await doc.destroy();
  return saida;
}
