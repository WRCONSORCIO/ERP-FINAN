'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import { processarFila } from '@/servidor/fila';
import * as V from '@/servidor/servicos/vendedores';
import { z } from 'zod';
import { ErroDeDominio } from '@/lib/erros';
import { esquemaExecutarLote, executarCadastroLote, previaCadastroLote, type PreviaLote, type ResultadoItemLote } from '@/servidor/servicos/cadastro-lote';

type Estado = Resultado<unknown> | null;

export async function cadastrarVendedorAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaCadastroVendedor, formParaObjeto(fd), async (s, d) => {
    const r = await V.cadastrarVendedor(s, d);
    return { mensagem: `Documento cadastrado.${r.vinculadas > 0 ? ` ${r.vinculadas} venda(s) que aguardavam este cadastro foram vinculadas e entraram na fila de apuração.` : ''}` };
  });
}

export async function alterarCategoriaAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaAlterarCategoria, formParaObjeto(fd), async (s, d) => {
    await V.alterarCategoria(s, d);
    return { mensagem: d.promocao ? 'Promoção registrada. Vendas anteriores continuam com a categoria congelada.' : 'Categoria alterada com nova vigência. Vendas anteriores não mudam.' };
  });
}

export async function corrigirInicioAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaCorrigirInicio, formParaObjeto(fd), async (s, d) => {
    await V.corrigirInicioCategoria(s, d);
    return { mensagem: 'Data de início corrigida.' };
  });
}

export async function alterarAlocacaoAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaAlterarAlocacao, formParaObjeto(fd), async (s, d) => {
    await V.alterarAlocacao(s, d);
    return { mensagem: 'Equipe alterada com nova vigência. Vendas anteriores mantêm a estrutura congelada.' };
  });
}

export async function registrarRecuperacaoAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaRecuperacao, formParaObjeto(fd), async (s, d) => {
    await V.registrarRecuperacao(s, d);
    return { mensagem: 'Período de recuperação registrado. Vale para vendas importadas a partir de agora; vendas já importadas no período precisam ser recongeladas.' };
  });
}

export async function cancelarRecuperacaoAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaCancelarRecuperacao, formParaObjeto(fd), async (s, d) => {
    await V.cancelarRecuperacao(s, d);
    return { mensagem: 'Período cancelado (fica no histórico, ignorado).' };
  });
}

export async function desligarAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaDesligar, formParaObjeto(fd), async (s, d) => {
    await V.desligarVendedor(s, d);
    return { mensagem: 'Documento desligado.' };
  });
}

export async function reativarAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaReativar, formParaObjeto(fd), async (s, d) => {
    await V.reativarVendedor(s, d);
    return { mensagem: 'Documento reativado.' };
  });
}

export async function vincularNomeAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaVincularNome, formParaObjeto(fd), async (s, d) => {
    const r = await V.vincularNomeImportado(s, d);
    return { mensagem: `Nome vinculado ao documento. ${r.vinculadas} venda(s) vinculada(s) e enviadas para apuração.` };
  });
}

export async function moverDocumentoAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaMoverDocumento, formParaObjeto(fd), async (s, d) => {
    const r = await V.moverDocumento(s, d);
    await processarFila(100);
    if (r.jaEstava) return { mensagem: 'Este documento já está na pessoa escolhida (a transferência já tinha sido feita). Abrindo a ficha dela…', dados: { irPara: `/vendedores/${r.pessoaDestinoId}` } };
    return {
      mensagem: `Documento movido, com o histórico. ${r.vendas} venda(s) recalculada(s). Abrindo a ficha da pessoa certa…`,
      dados: { irPara: `/vendedores/${r.pessoaDestinoId}` },
    };
  });
}

export async function corrigirNomeAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaCorrigirNome, formParaObjeto(fd), async (s, d) => {
    await V.corrigirNome(s, d);
    return { mensagem: d.tambemPessoa ? 'Nome do documento e da pessoa corrigidos.' : 'Nome do documento corrigido.' };
  });
}

/** Cadastro em lote: lê a planilha e devolve a prévia (não grava nada). */
export async function previaCadastroLoteAcao(fd: FormData): Promise<Resultado<PreviaLote>> {
  const arquivo = fd.get('arquivo');
  return executar('vendedores', 'editar', z.object({}), {}, async (s) => {
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroDeDominio('Escolha a planilha.');
    if (arquivo.size > 5 * 1024 * 1024) throw new ErroDeDominio('Planilha grande demais (até 5 MB).');
    const dados = await previaCadastroLote(s, { bytes: new Uint8Array(await arquivo.arrayBuffer()), nome: arquivo.name });
    return { mensagem: 'ok', dados };
  });
}

/** Cadastro em lote: grava um pedaço da prévia confirmada. */
export async function executarCadastroLoteAcao(itens: unknown): Promise<Resultado<ResultadoItemLote[]>> {
  return executar('vendedores', 'editar', esquemaExecutarLote, { itens }, async (s, d) => ({ mensagem: 'ok', dados: await executarCadastroLote(s, d) }));
}

export async function corrigirEquipeAcao(_: Estado, fd: FormData) {
  return executar('vendedores', 'editar', V.esquemaCorrigirEquipe, formParaObjeto(fd), async (s, d) => {
    const r = await V.corrigirEquipe(s, d);
    await processarFila(100);
    return { mensagem: `Equipe do período corrigida. ${r.vendas} venda(s) do período; ${r.recalculadas} recalculada(s) com o supervisor e o gerente certos.` };
  });
}
