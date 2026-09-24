import { prisma } from '@/lib/db';
import { somenteDigitos } from '@/lib/documento';
import { normalizarNome } from '@/lib/texto';
import { pode } from '@/lib/permissoes';
import { escopoCotas, escopoVendedores, type Sessao } from '../contexto';

/** Busca global: cliente, vendedor, cota, grupo, contrato, CPF/CNPJ — sempre com o recorte e a permissão de cada área. */
export async function buscaGlobal(s: Sessao, q: string) {
  const termo = q.trim().slice(0, 100);
  if (termo.length < 2) return { cotas: [], vendedores: [] };
  const dig = somenteDigitos(termo);
  const gc = /^\s*(\d+)\s*[/.\- ]\s*(\d+)\s*$/.exec(termo);
  const cotas = pode(s.perfil, 'cotas')
    ? await prisma.cota.findMany({
        where: {
          AND: [escopoCotas(s), {
            OR: [
              { clienteNome: { contains: termo, mode: 'insensitive' } },
              ...(dig.length >= 3 ? [{ cpfCliente: { startsWith: dig } }, { contrato: { contains: dig } }, { grupo: dig }] : []),
              ...(gc ? [{ grupo: (gc[1] as string).replace(/^0+(?=\d)/, ''), cota: (gc[2] as string).replace(/^0+(?=\d)/, '') }] : []),
              { contrato: termo },
            ],
          }],
        },
        select: { id: true, clienteNome: true, grupo: true, cota: true, contrato: true, cancelada: true, situacao: true },
        take: 25, orderBy: { dataVenda: 'desc' },
      })
    : [];
  const n = normalizarNome(termo);
  const vendedores = pode(s.perfil, 'vendedores')
    ? await prisma.vendedor.findMany({
        where: { AND: [escopoVendedores(s), { OR: [...(n ? [{ nomeNormalizado: { contains: n } }, { pessoa: { nomeNormalizado: { contains: n } } }] : []), ...(dig.length >= 3 ? [{ documento: { startsWith: dig } }] : [])] }] },
        select: { id: true, pessoaId: true, nome: true, tipoDocumento: true, documento: true, status: true },
        take: 25, orderBy: { nome: 'asc' },
      })
    : [];
  return { cotas, vendedores };
}
