import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ErroDeDominio, ErroNaoEncontrado } from '@/lib/erros';
import { documentoValido, somenteDigitos } from '@/lib/documento';
import { auditar } from '../auditoria';
import { exigir, type Sessao } from '../contexto';
import { zId, zTexto, zTextoOpcional } from './esquemas';

export const esquemaCadastroClienteCarta = z.object({
  nome: zTexto(150),
  documento: zTexto(20),
  tipoDocumento: z.enum(['CPF', 'CNPJ']),
  telefone: zTextoOpcional(30),
  email: zTextoOpcional(150),
});
export const esquemaAlterarClienteCarta = esquemaCadastroClienteCarta.extend({ id: zId });

function validarDocumento(tipo: 'CPF' | 'CNPJ', doc: string) {
  if ((tipo === 'CPF' && doc.length !== 11) || (tipo === 'CNPJ' && doc.length !== 14) || !documentoValido(doc)) {
    throw new ErroDeDominio(`${tipo} inválido (confira os dígitos verificadores).`);
  }
}

/** Cliente (pessoa física ou jurídica) dono ou comprador de uma carta contemplada. */
export async function cadastrarClienteCarta(s: Sessao, d: z.infer<typeof esquemaCadastroClienteCarta>) {
  exigir(s, 'cartas', 'editar');
  const doc = somenteDigitos(d.documento);
  validarDocumento(d.tipoDocumento, doc);
  return prisma.$transaction(async (tx) => {
    if (await tx.clienteCarta.findUnique({ where: { documento: doc } })) throw new ErroDeDominio('Já existe um cliente cadastrado com este documento.');
    const c = await tx.clienteCarta.create({
      data: { nome: d.nome.replace(/\s+/g, ' ').toUpperCase(), documento: doc, tipoDocumento: d.tipoDocumento, telefone: d.telefone, email: d.email, criadoPorId: s.usuarioId },
    });
    await auditar(tx, { sessao: s, acao: 'CRIACAO', entidade: 'ClienteCarta', entidadeId: c.id, depois: c });
    return c;
  });
}

export async function alterarClienteCarta(s: Sessao, d: z.infer<typeof esquemaAlterarClienteCarta>) {
  exigir(s, 'cartas', 'editar');
  const doc = somenteDigitos(d.documento);
  validarDocumento(d.tipoDocumento, doc);
  return prisma.$transaction(async (tx) => {
    const antes = await tx.clienteCarta.findUnique({ where: { id: d.id } });
    if (!antes) throw new ErroNaoEncontrado('Cliente não encontrado.');
    const outro = await tx.clienteCarta.findUnique({ where: { documento: doc } });
    if (outro && outro.id !== d.id) throw new ErroDeDominio('Já existe outro cliente cadastrado com este documento.');
    const depois = await tx.clienteCarta.update({
      where: { id: d.id },
      data: { nome: d.nome.replace(/\s+/g, ' ').toUpperCase(), documento: doc, tipoDocumento: d.tipoDocumento, telefone: d.telefone, email: d.email },
    });
    await auditar(tx, { sessao: s, acao: 'ALTERACAO', entidade: 'ClienteCarta', entidadeId: d.id, antes, depois });
    return depois;
  });
}
