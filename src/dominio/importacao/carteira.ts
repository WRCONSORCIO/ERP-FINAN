import { createHash } from 'node:crypto';
import { lerMoedaTexto, paraTexto } from '@/lib/dinheiro';
import { deBR, paraISO } from '@/lib/datas';
import { somenteDigitos } from '@/lib/documento';
import { normalizarNome } from '@/lib/texto';
import { lerCsv, linhaOriginal } from './csv';
import { CAMPOS_CARTEIRA, CAMPOS_OBRIGATORIOS_CARTEIRA, type CampoCarteira, type LayoutCarteira } from './layouts';

/** Linha da base de clientes já validada. Valores monetários como texto decimal (nunca number). */
export interface LinhaCarteira {
  grupo: string;
  cota: string;
  contrato: string;
  cpfCliente: string;
  clienteNome: string;
  credito: string;
  dataVenda: string; // ISO
  parcelasPagas: number;
  situacao: string;
  cancelada: boolean;
  dataCancelamento: string | null;
  vendedorNome: string | null;
  vendedorDocumento: string | null;
  segmento: string | null;
  flex: string | null;
  clienteEmail: string | null;
  clienteTelefone: string | null;
}

export interface ResultadoLeituraCarteira {
  cabecalho: string[];
  mapa: Partial<Record<CampoCarteira, number>>;
  linhas: Array<{ numero: number; original: string; dados: LinhaCarteira }>;
  erros: Array<{ numero: number; original: string; motivo: string }>;
  faltando: CampoCarteira[];
}

export function mapearCabecalho(cabecalho: readonly string[], layout: LayoutCarteira): Partial<Record<CampoCarteira, number>> {
  const norm = cabecalho.map((c) => normalizarNome(c));
  const mapa: Partial<Record<CampoCarteira, number>> = {};
  for (const campo of CAMPOS_CARTEIRA) {
    const aceitos = new Set(layout.colunas[campo].map((a) => normalizarNome(a)));
    const idx = norm.findIndex((c) => aceitos.has(c));
    if (idx >= 0) mapa[campo] = idx;
  }
  return mapa;
}

/** Reconhece a base de clientes pelo conteúdo: cabeçalho com as colunas de identidade da cota. */
export function pareceCarteira(texto: string, layout: LayoutCarteira): boolean {
  const primeira = texto.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  if (!primeira.includes(layout.separador)) return false;
  const mapa = mapearCabecalho(lerCsv(primeira, layout.separador)[0] ?? [], layout);
  const temGrupoCota = (mapa.grupo !== undefined && mapa.cota !== undefined) || mapa.grupoCota !== undefined;
  return temGrupoCota && mapa.cpfCliente !== undefined && mapa.credito !== undefined;
}

function faltandoNoMapa(mapa: Partial<Record<CampoCarteira, number>>): CampoCarteira[] {
  const falta = CAMPOS_OBRIGATORIOS_CARTEIRA.filter((c) => mapa[c] === undefined);
  const temGrupoCota = (mapa.grupo !== undefined && mapa.cota !== undefined) || mapa.grupoCota !== undefined;
  if (!temGrupoCota) falta.push('grupoCota');
  if (mapa.vendedorNome === undefined && mapa.vendedorDocumento === undefined) falta.push('vendedorNome');
  return falta;
}

function texto(campos: readonly string[], idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const v = (campos[idx] ?? '').trim();
  return v === '' ? null : v;
}

export function lerCarteira(conteudo: string, layout: LayoutCarteira): ResultadoLeituraCarteira {
  const tabela = lerCsv(conteudo, layout.separador);
  const cabecalho = (tabela[0] ?? []).map((c) => c.trim());
  const mapa = mapearCabecalho(cabecalho, layout);
  const faltando = faltandoNoMapa(mapa);
  const resultado: ResultadoLeituraCarteira = { cabecalho, mapa, linhas: [], erros: [], faltando };
  if (faltando.length > 0) return resultado;

  const cancelamentos = layout.situacoesCanceladas.map((s) => normalizarNome(s)).filter((s) => s !== '');

  for (let i = 1; i < tabela.length; i++) {
    const campos = tabela[i] as string[];
    const numero = i + 1;
    if (campos.every((c) => c.trim() === '')) continue; // linha em branco não é dado
    const original = linhaOriginal(campos, layout.separador);
    const erro = (motivo: string) => resultado.erros.push({ numero, original, motivo });

    let grupo = texto(campos, mapa.grupo);
    let cota = texto(campos, mapa.cota);
    if ((!grupo || !cota) && mapa.grupoCota !== undefined) {
      const gc = texto(campos, mapa.grupoCota) ?? '';
      const m = /^\s*(\d+)\s*[./\- ]\s*(\d+)(?:\s*-\s*\d+)?\s*$/.exec(gc);
      if (m) { grupo = m[1] ?? null; cota = m[2] ?? null; }
    }
    grupo = grupo ? grupo.replace(/^0+(?=\d)/, '') : null;
    cota = cota ? cota.replace(/-\d+$/, '').replace(/^0+(?=\d)/, '') : null;
    if (!grupo || !cota) { erro('Grupo/cota ausente ou ilegível'); continue; }

    const contrato = texto(campos, mapa.contrato);
    if (!contrato) { erro('Contrato ausente'); continue; }
    const cpf = somenteDigitos(texto(campos, mapa.cpfCliente));
    if (cpf.length !== 11 && cpf.length !== 14) { erro('CPF/CNPJ do cliente ausente ou com tamanho inválido'); continue; }
    const clienteNome = texto(campos, mapa.clienteNome);
    if (!clienteNome) { erro('Nome do cliente ausente'); continue; }
    const credito = lerMoedaTexto(texto(campos, mapa.credito));
    if (!credito || credito.isNegative()) { erro('Crédito ausente ou inválido'); continue; }
    const dataVenda = deBR(texto(campos, mapa.dataVenda));
    if (!dataVenda) { erro('Data da venda ausente ou inválida'); continue; }
    const parcTexto = texto(campos, mapa.parcelasPagas) ?? '';
    if (!/^\d{1,4}$/.test(parcTexto)) { erro('Parcelas pagas ausente ou não inteiro'); continue; }
    const situacao = texto(campos, mapa.situacao);
    if (!situacao) { erro('Situação ausente'); continue; }
    const sitNorm = normalizarNome(situacao);
    const cancelada = cancelamentos.some((s) => sitNorm.includes(s));
    const dataCancTexto = texto(campos, mapa.dataCancelamento);
    const dataCancelamento = dataCancTexto ? deBR(dataCancTexto) : null;
    if (dataCancTexto && !dataCancelamento) { erro('Data de cancelamento inválida'); continue; }

    const vendedorDocumento = somenteDigitos(texto(campos, mapa.vendedorDocumento));
    resultado.linhas.push({
      numero,
      original,
      dados: {
        grupo, cota, contrato: contrato.replace(/\s+/g, ''), cpfCliente: cpf, clienteNome: clienteNome.replace(/\s+/g, ' '),
        credito: paraTexto(credito.toDecimalPlaces(2)), dataVenda: paraISO(dataVenda), parcelasPagas: Number(parcTexto),
        situacao, cancelada, dataCancelamento: dataCancelamento ? paraISO(dataCancelamento) : null,
        vendedorNome: texto(campos, mapa.vendedorNome), vendedorDocumento: vendedorDocumento === '' ? null : vendedorDocumento,
        segmento: texto(campos, mapa.segmento), flex: texto(campos, mapa.flex),
        clienteEmail: texto(campos, mapa.clienteEmail), clienteTelefone: texto(campos, mapa.clienteTelefone),
      },
    });
  }
  return resultado;
}

/** Hash de conteúdo da linha: o que já entrou volta como "sem mudança", nunca duplicado. */
export function hashLinhaCarteira(d: LinhaCarteira): string {
  const chave = [
    d.grupo, d.cota, d.contrato, d.cpfCliente, d.clienteNome, d.credito, d.dataVenda, d.parcelasPagas, d.situacao,
    d.dataCancelamento ?? '', d.vendedorNome ?? '', d.vendedorDocumento ?? '', d.segmento ?? '', d.flex ?? '',
    d.clienteEmail ?? '', d.clienteTelefone ?? '',
  ].join('|');
  return createHash('sha256').update(chave).digest('hex');
}
