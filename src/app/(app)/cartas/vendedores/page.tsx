import type { Metadata } from 'next';
import { pode } from '@/lib/permissoes';
import { exigirPagina } from '@/servidor/sessao';
import { listarVendedoresCarta } from '@/servidor/consultas/vendedores-carta';
import { param, type Params } from '@/servidor/consultas/comum';
import { Campo, EstadoVazio, Etiqueta, LinkBotao, Pagina, Traco, classeBotao } from '@/ui/base';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import { cadastrarVendedorCartaAcao, desativarVendedorCartaAcao, reativarVendedorCartaAcao } from './acoes';

export const metadata: Metadata = { title: 'Vendedores — Cartas' };
export const dynamic = 'force-dynamic';

type Linha = Awaited<ReturnType<typeof listarVendedoresCarta>>['ativos'][number];

function TabelaVendedores({ linhas, podeEditar }: { linhas: Linha[]; podeEditar: boolean }) {
  if (linhas.length === 0) return <EstadoVazio titulo="Nenhum vendedor nesta lista" />;
  return (
    <div className="tabela-quadro">
      <table className="tabela">
        <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th className="direita">Cartas</th><th>Status</th>{podeEditar ? <th /> : null}</tr></thead>
        <tbody>
          {linhas.map((v) => (
            <tr key={v.id}>
              <td className="font-semibold">{v.nome}</td>
              <td>{v.telefone ?? <Traco />}</td>
              <td>{v.email ?? <Traco />}</td>
              <td className="direita numero">{v._count.cartas}</td>
              <td>{v.ativo ? <Etiqueta tom="verde">Ativo</Etiqueta> : <Etiqueta tom="neutro">Inativo</Etiqueta>}</td>
              {podeEditar ? (
                <td>
                  {v.ativo ? (
                    <FormularioAcao acao={desativarVendedorCartaAcao} rotulo="Desativar" perigo emLinha confirmacao="Sai da lista de ativos e não aparece mais para escolher em novas cartas. As cartas já lançadas continuam com ele.">
                      <input type="hidden" name="id" value={v.id} />
                    </FormularioAcao>
                  ) : (
                    <FormularioAcao acao={reativarVendedorCartaAcao} rotulo="Reativar" emLinha confirmacao="Volta a aparecer para escolher em novas cartas.">
                      <input type="hidden" name="id" value={v.id} />
                    </FormularioAcao>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function VendedoresCarta({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('cartas');
  const sp = await searchParams;
  const busca = param(sp, 'busca');
  const dados = await listarVendedoresCarta(s, sp);
  const podeEditar = pode(s.perfil, 'cartas', 'editar');

  return (
    <Pagina
      titulo="Cartas › Vendedores"
      descricao="Representantes internos que recebem comissão pelas negociações de cartas contempladas."
      acoes={<LinkBotao href="/cartas" icone="cartas">Ver cartas</LinkBotao>}
    >
      <form method="get" className="cartao flex flex-wrap items-end gap-2 p-3" role="search">
        <Campo rotulo="Buscar por nome" nome="busca" className="w-full max-w-md">
          <input id="busca" name="busca" defaultValue={busca} className="campo" placeholder="Nome do vendedor" />
        </Campo>
        <button className={classeBotao('primario')} type="submit">Buscar</button>
        {busca ? <LinkBotao href="/cartas/vendedores" variante="fantasma">Limpar</LinkBotao> : null}
      </form>

      {podeEditar ? (
        <Dobra chave="cartas-vendedores-cadastrar" titulo="Novo vendedor">
          <div className="p-4">
            <FormularioAcao acao={cadastrarVendedorCartaAcao} rotulo="Cadastrar">
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Nome" nome="nome"><input id="nome" name="nome" className="campo" required /></Campo>
                <Campo rotulo="Telefone" nome="telefone"><input id="telefone" name="telefone" className="campo" /></Campo>
                <Campo rotulo="E-mail" nome="email"><input id="email" name="email" type="email" className="campo" /></Campo>
              </div>
            </FormularioAcao>
          </div>
        </Dobra>
      ) : null}

      <Dobra chave="cartas-vendedores-ativos" aberta titulo={<>Ativos <span className="numero text-wr-texto-3">({dados.ativos.length})</span></>}>
        <TabelaVendedores linhas={dados.ativos} podeEditar={podeEditar} />
      </Dobra>
      <Dobra chave="cartas-vendedores-inativos" titulo={<>Inativos <span className="numero text-wr-texto-3">({dados.inativos.length})</span></>}>
        <TabelaVendedores linhas={dados.inativos} podeEditar={podeEditar} />
      </Dobra>
    </Pagina>
  );
}
