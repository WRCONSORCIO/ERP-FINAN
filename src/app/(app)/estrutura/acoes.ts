'use server';

import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import * as E from '@/servidor/servicos/estrutura';

type Estado = Resultado<unknown> | null;

export async function criarGerenciaAcao(_: Estado, fd: FormData) {
  return executar('gerencias', 'editar', E.esquemaGerencia, formParaObjeto(fd), async (s, d) => { await E.criarGerencia(s, d); return { mensagem: 'Gerência criada.' }; });
}
export async function renomearGerenciaAcao(_: Estado, fd: FormData) {
  return executar('gerencias', 'editar', E.esquemaRenomear, formParaObjeto(fd), async (s, d) => { await E.renomearGerencia(s, d); return { mensagem: 'Gerência renomeada.' }; });
}
export async function statusGerenciaAcao(_: Estado, fd: FormData) {
  return executar('gerencias', 'editar', E.esquemaStatusUnidade, formParaObjeto(fd), async (s, d) => { await E.alterarStatusGerencia(s, d); return { mensagem: d.status === 'INATIVO' ? 'Gerência desativada (histórico mantido).' : 'Gerência reativada.' }; });
}
export async function excluirGerenciaAcao(_: Estado, fd: FormData) {
  return executar('gerencias', 'editar', E.esquemaId, formParaObjeto(fd), async (s, d) => { await E.excluirGerencia(s, d); return { mensagem: 'Gerência excluída.' }; });
}
export async function criarEquipeAcao(_: Estado, fd: FormData) {
  return executar('equipes', 'editar', E.esquemaEquipe, formParaObjeto(fd), async (s, d) => { await E.criarEquipe(s, d); return { mensagem: 'Equipe criada.' }; });
}
export async function renomearEquipeAcao(_: Estado, fd: FormData) {
  return executar('equipes', 'editar', E.esquemaRenomear, formParaObjeto(fd), async (s, d) => { await E.renomearEquipe(s, d); return { mensagem: 'Equipe renomeada.' }; });
}
export async function statusEquipeAcao(_: Estado, fd: FormData) {
  return executar('equipes', 'editar', E.esquemaStatusUnidade, formParaObjeto(fd), async (s, d) => { await E.alterarStatusEquipe(s, d); return { mensagem: d.status === 'INATIVO' ? 'Equipe desativada (histórico mantido).' : 'Equipe reativada.' }; });
}
export async function excluirEquipeAcao(_: Estado, fd: FormData) {
  return executar('equipes', 'editar', E.esquemaId, formParaObjeto(fd), async (s, d) => { await E.excluirEquipe(s, d); return { mensagem: 'Equipe excluída.' }; });
}
export async function definirResponsavelAcao(_: Estado, fd: FormData) {
  const obj = formParaObjeto(fd);
  return executar(obj.papel === 'GERENTE' ? 'gerencias' : 'equipes', 'editar', E.esquemaResponsavel, obj, async (s, d) => {
    await E.definirResponsavel(s, d);
    return { mensagem: 'Responsável definido com vigência. O anterior foi encerrado no dia anterior.' };
  });
}
export async function encerrarResponsavelAcao(_: Estado, fd: FormData) {
  return executar('equipes', 'editar', E.esquemaEncerrarResponsavel, formParaObjeto(fd), async (s, d) => { await E.encerrarResponsavel(s, d); return { mensagem: 'Responsabilidade encerrada.' }; });
}
export async function cadastrarAdministradoraAcao(_: Estado, fd: FormData) {
  return executar('gerencias', 'editar', E.esquemaAdministradora, formParaObjeto(fd), async (s, d) => { await E.cadastrarAdministradora(s, d); return { mensagem: 'Administradora cadastrada.' }; });
}
