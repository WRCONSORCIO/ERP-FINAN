'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as C from '@/servidor/servicos/cartas';
import * as Cl from '@/servidor/servicos/clientes-carta';

type Estado = Resultado<unknown> | null;

export async function cadastrarCartaAcao(_: Estado, fd: FormData) {
  return executar('cartas', 'editar', C.esquemaCadastroCarta, formParaObjeto(fd), async (s, d) => {
    const carta = await C.cadastrarCarta(s, d);
    return { mensagem: `Carta ${carta.codigo} cadastrada.` };
  });
}

export async function alterarCartaAcao(_: Estado, fd: FormData) {
  return executar('cartas', 'editar', C.esquemaAlterarCarta, formParaObjeto(fd), async (s, d) => {
    await C.alterarCarta(s, d);
    return { mensagem: 'Carta atualizada.' };
  });
}

export async function excluirCartaAcao(_: Estado, fd: FormData) {
  return executar('cartas', 'editar', C.esquemaExcluirCarta, formParaObjeto(fd), async (s, d) => {
    await C.excluirCarta(s, d);
    return { mensagem: 'Carta excluída.' };
  });
}

export async function cadastrarClienteCartaAcao(_: Estado, fd: FormData) {
  return executar('cartas', 'editar', Cl.esquemaCadastroClienteCarta, formParaObjeto(fd), async (s, d) => {
    const cliente = await Cl.cadastrarClienteCarta(s, d);
    return { mensagem: `Cliente ${cliente.nome} cadastrado — já aparece na busca de cliente do formulário de carta.` };
  });
}
