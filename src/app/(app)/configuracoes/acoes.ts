'use server';

import { z } from 'zod';
import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as R from '@/servidor/servicos/regras';
import * as V from '@/servidor/servicos/vigencias';

type Estado = Resultado<unknown> | null;

export async function criarCategoriaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaCategoria, formParaObjeto(fd), async (s, d) => { await R.criarCategoria(s, d); return { mensagem: 'Categoria criada.' }; });
}
export async function editarCategoriaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaEditarCategoria, formParaObjeto(fd), async (s, d) => { await R.editarCategoria(s, d); return { mensagem: 'Categoria atualizada. Vendas já importadas mantêm o comportamento congelado; vale para as próximas.' }; });
}
export async function ativoCategoriaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaAtivoCategoria, formParaObjeto(fd), async (s, d) => { await R.alterarAtivoCategoria(s, d); return { mensagem: d.ativo ? 'Categoria reativada.' : 'Categoria desativada.' }; });
}
export async function excluirCategoriaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', z.object({ id: z.string().min(1) }), formParaObjeto(fd), async (s, d) => { await R.excluirCategoria(s, d); return { mensagem: 'Categoria excluída.' }; });
}
export async function abrirTabelaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaTabela, formParaObjeto(fd), async (s, d) => { await R.abrirVigenciaTabela(s, d); return { mensagem: 'Nova vigência aberta. A anterior foi encerrada no dia anterior; vendas já apuradas não mudam.' }; });
}
export async function simularTabelaAcao(_: Resultado<R.ResultadoSimulacao> | null, fd: FormData): Promise<Resultado<R.ResultadoSimulacao>> {
  return executar('regras', 'editar', R.esquemaTabela, formParaObjeto(fd), async (s, d) => ({ mensagem: 'Simulação pronta.', dados: await R.simularTabela(s, d) }));
}
export async function abrirConfigEstornoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaConfigEstorno, formParaObjeto(fd), async (s, d) => { await R.abrirVigenciaConfigEstorno(s, d); return { mensagem: 'Regras de estorno salvas.' }; });
}
export async function definirEscopoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaDefinirEscopo, formParaObjeto(fd), async (s, d) => { await R.definirEscopoBase(s, d); return { mensagem: 'Escopo definido. As vendas canceladas pendentes foram para a fila de apuração.' }; });
}
/** "Para quem" é um único campo na tela: PADRAO, código de categoria/SUPERVISAO/GERENCIA ou v:<id do vendedor>. */
function comParaQuem(fd: FormData): Record<string, unknown> {
  const o = formParaObjeto(fd);
  const alvo = typeof o.paraQuem === 'string' ? o.paraQuem : '';
  delete o.paraQuem;
  if (alvo.startsWith('v:')) o.titularVendedorId = alvo.slice(2);
  else if (alvo && alvo !== 'PADRAO') o.participante = alvo;
  return o;
}

export async function abrirRegraEstornoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaRegraEstorno, comParaQuem(fd), async (s, d) => { await R.abrirVigenciaRegraEstorno(s, d); return { mensagem: 'Percentual salvo.' }; });
}
export async function simularRegraEstornoAcao(_: Resultado<R.ResultadoSimulacao> | null, fd: FormData): Promise<Resultado<R.ResultadoSimulacao>> {
  return executar('regras', 'editar', R.esquemaRegraEstorno, comParaQuem(fd), async (s, d) => ({ mensagem: 'Simulação pronta.', dados: await R.simularRegraEstorno(s, d) }));
}
export async function abrirMetaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaMeta, formParaObjeto(fd), async (s, d) => { await R.abrirVigenciaMeta(s, d); return { mensagem: 'Nova meta vigente. Quem já foi promovido não é reclassificado.' }; });
}
export async function abrirFlexAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaFlex, formParaObjeto(fd), async (s, d) => { await R.abrirVigenciaFlex(s, d); return { mensagem: 'Modalidade flex vigente.' }; });
}
export async function aliasesFlexAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaAliases, formParaObjeto(fd), async (s, d) => { await R.editarAliasesFlex(s, d); return { mensagem: 'Apelidos salvos (valem para vendas futuras).' }; });
}
export async function criarSegmentoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaSegmento, formParaObjeto(fd), async (s, d) => { await R.criarSegmento(s, d); return { mensagem: 'Segmento criado.' }; });
}
export async function aliasesSegmentoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', R.esquemaAliases, formParaObjeto(fd), async (s, d) => { await R.editarAliasesSegmento(s, d); return { mensagem: 'Apelidos salvos (valem para vendas futuras).' }; });
}

// ------------------------------------------------------------------ Correção e exclusão de vigência sem uso

export async function excluirVigenciaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', V.esquemaExcluirVigencia, formParaObjeto(fd), async (s, d) => {
    const r = await V.excluirVigencia(s, d);
    return { mensagem: r.anteriorReaberta ? 'Vigência excluída. A vigência anterior voltou a valer pelo período.' : 'Vigência excluída.' };
  });
}
const CORRIGIDA = 'Vigência corrigida. Vendas em pendência voltaram para a fila de apuração.';
export async function corrigirRegraEstornoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', V.esquemaCorrigirRegraEstorno, formParaObjeto(fd), async (s, d) => { await V.corrigirRegraEstorno(s, d); return { mensagem: CORRIGIDA }; });
}
export async function corrigirTabelaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', V.esquemaCorrigirTabela, formParaObjeto(fd), async (s, d) => { await V.corrigirTabela(s, d); return { mensagem: CORRIGIDA }; });
}
export async function corrigirConfigEstornoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', V.esquemaCorrigirConfigEstorno, formParaObjeto(fd), async (s, d) => { await V.corrigirConfigEstorno(s, d); return { mensagem: CORRIGIDA }; });
}
export async function corrigirMetaAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', V.esquemaCorrigirMeta, formParaObjeto(fd), async (s, d) => { await V.corrigirMeta(s, d); return { mensagem: 'Meta corrigida.' }; });
}
export async function corrigirFlexAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', V.esquemaCorrigirFlex, formParaObjeto(fd), async (s, d) => { await V.corrigirFlex(s, d); return { mensagem: 'Flex corrigido.' }; });
}
export async function editarSegmentoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', V.esquemaEditarSegmento, formParaObjeto(fd), async (s, d) => { await V.editarSegmento(s, d); return { mensagem: 'Segmento atualizado.' }; });
}
export async function excluirSegmentoAcao(_: Estado, fd: FormData) {
  return executar('regras', 'editar', z.object({ id: z.string().min(1), motivo: z.string().trim().min(3, 'Explique o motivo') }), formParaObjeto(fd), async (s, d) => { await V.excluirSegmento(s, d); return { mensagem: 'Segmento excluído.' }; });
}
