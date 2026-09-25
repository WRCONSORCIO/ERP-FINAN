/** Leitor de CSV com separador configurável e aspas (RFC 4180 tolerante). */
export function lerCsv(texto: string, separador = ';'): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i] as string;
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === separador) { linha.push(campo); campo = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
      continue;
    }
    campo += c;
  }
  if (campo !== '' || linha.length > 0) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/** Linha original reconstruída para guardar junto do erro. */
export function linhaOriginal(campos: readonly string[], separador = ';'): string {
  return campos.map((c) => (/[";\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(separador);
}

/** A base de clientes vem em Latin-1. Se o arquivo for UTF-8 válido com acentos, respeita. */
export function decodificarTexto(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('latin1').decode(bytes);
}
