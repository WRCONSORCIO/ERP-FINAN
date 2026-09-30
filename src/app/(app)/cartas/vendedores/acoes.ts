'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as V from '@/servidor/servicos/vendedores-carta';

type Estado = Resultado<unknown> | null;

export async function cadastrarVendedorCartaAcao(_: Estado, fd: FormData) {
  return executar('cartas', 'editar', V.esquemaCadastroVendedorCarta, formParaObjeto(fd), async (s, d) => {
    await V.cadastrarVendedorCarta(s, d);
    return { mensagem: 'Vendedor cadastrado.' };
  });
}

export async function alterarVendedorCartaAcao(_: Estado, fd: FormData) {
  return executar('cartas', 'editar', V.esquemaAlterarVendedorCarta, formParaObjeto(fd), async (s, d) => {
    await V.alterarVendedorCarta(s, d);
    return { mensagem: 'Vendedor atualizado.' };
  });
}

export async function desativarVendedorCartaAcao(_: Estado, fd: FormData) {
  return executar('cartas', 'editar', V.esquemaVendedorCartaId, formParaObjeto(fd), async (s, d) => {
    await V.desativarVendedorCarta(s, d);
    return { mensagem: 'Vendedor desativado.' };
  });
}

export async function reativarVendedorCartaAcao(_: Estado, fd: FormData) {
  return executar('cartas', 'editar', V.esquemaVendedorCartaId, formParaObjeto(fd), async (s, d) => {
    await V.reativarVendedorCarta(s, d);
    return { mensagem: 'Vendedor reativado.' };
  });
}
