import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { formatarDocumento } from '@/lib/documento';
import { exigirPagina } from '@/servidor/sessao';
import { listarSemCadastro } from '@/servidor/consultas/vendedores';
import { DataCurta, Dinheiro, EstadoVazio, LinkBotao, Pagina, Secao, Traco } from '@/ui/base';
import { FormularioAcao } from '@/ui/formulario-acao';
import { vincularNomeAcao } from '../acoes';

export const metadata: Metadata = { title: 'Vendem e não têm cadastro' };
export const dynamic = 'force-dynamic';

export default async function SemCadastro() {
  const s = await exigirPagina('vendedores', 'editar');
  const [linhas, vendedores] = await Promise.all([
    listarSemCadastro(s),
    prisma.vendedor.findMany({ select: { id: true, nome: true, tipoDocumento: true, documento: true }, orderBy: { nome: 'asc' } }),
  ]);
  return (
    <Pagina
      titulo="Vendem e não têm cadastro"
      descricao="Vendedores que aparecem nos arquivos da administradora mas não estão cadastrados. Enquanto estiverem aqui, as vendas deles não geram comissão."
      acoes={<LinkBotao href="/vendedores" icone="vendedores">Cadastrar vendedor</LinkBotao>}
    >
      <Secao titulo={`${linhas.length} vendedor(es) sem cadastro`} descricao="O sistema reconhece o vendedor pelo CPF/CNPJ, ou pelo nome quando ele é idêntico ao cadastro. Nome abreviado ou diferente não é reconhecido sozinho: ligue-o aqui a um vendedor já cadastrado, ou cadastre um novo." semPadding>
        {linhas.length === 0 ? <EstadoVazio titulo="Nenhuma venda aguardando cadastro" icone="ok" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Nome no arquivo</th><th>CPF/CNPJ</th><th className="direita">Vendas</th><th className="direita">Crédito</th><th>Primeira</th><th>Última</th><th>É o mesmo que este vendedor cadastrado</th></tr></thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={`${l.documento ?? ''}-${l.nome ?? ''}-${i}`}>
                    <td className="font-semibold">{l.nome ?? <Traco />}</td>
                    <td className="numero">{l.documento ? formatarDocumento(l.documento) : <Traco />}</td>
                    <td className="direita numero">{l.cotas}</td>
                    <td className="direita"><Dinheiro valor={l.credito} /></td>
                    <td><DataCurta valor={l.primeiraVenda} /></td>
                    <td><DataCurta valor={l.ultimaVenda} /></td>
                    <td>
                      {l.nome ? (
                        <FormularioAcao acao={vincularNomeAcao} rotulo="Vincular" emLinha confirmacao={`Vendas importadas como "${l.nome}" passam a ser do documento escolhido (decisão registrada na auditoria).`}>
                          <input type="hidden" name="nomeImportado" value={l.nome} />
                          <select name="vendedorId" aria-label="Documento" className="campo w-64">
                            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome} · {v.tipoDocumento} {formatarDocumento(v.documento)}</option>)}
                          </select>
                        </FormularioAcao>
                      ) : <span className="text-[12px] text-wr-texto-3">Cadastre o documento: o vínculo é automático.</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </Pagina>
  );
}
