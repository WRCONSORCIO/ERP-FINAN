'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as V from '@/servidor/servicos/vendedores';

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
