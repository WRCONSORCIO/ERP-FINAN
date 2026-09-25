'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as U from '@/servidor/servicos/usuarios';

type Estado = Resultado<unknown> | null;

export async function criarUsuarioAcao(_: Estado, fd: FormData) {
  return executar('usuarios', 'tudo', U.esquemaUsuario, formParaObjeto(fd), async (s, d) => {
    const r = await U.criarUsuario(s, d);
    return { mensagem: 'Acesso criado.', dados: { senhaProvisoria: r.senhaProvisoria } };
  });
}
export async function alterarUsuarioAcao(_: Estado, fd: FormData) {
  return executar('usuarios', 'tudo', U.esquemaAlterarUsuario, formParaObjeto(fd), async (s, d) => { await U.alterarUsuario(s, d); return { mensagem: 'Acesso alterado. Vale na próxima tela que a pessoa abrir.' }; });
}
export async function ativoUsuarioAcao(_: Estado, fd: FormData) {
  return executar('usuarios', 'tudo', U.esquemaAtivoUsuario, formParaObjeto(fd), async (s, d) => { await U.alterarAtivoUsuario(s, d); return { mensagem: d.ativo ? 'Acesso reativado.' : 'Acesso desativado. A pessoa perde o acesso na próxima tela.' }; });
}
export async function redefinirSenhaAcao(_: Estado, fd: FormData) {
  return executar('usuarios', 'tudo', U.esquemaTrocarSenha, formParaObjeto(fd), async (s, d) => {
    const r = await U.redefinirSenha(s, d);
    return { mensagem: 'Senha redefinida. Sessões abertas foram encerradas.', dados: { senhaProvisoria: r.senhaProvisoria } };
  });
}
