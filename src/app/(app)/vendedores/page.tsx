import type { Metadata } from 'next';
import Link from 'next/link';
import { formatarDocumento } from '@/lib/documento';
import { pode } from '@/lib/permissoes';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { listarVendedores } from '@/servidor/consultas/vendedores';
import { opcoesDeFormulario } from '@/servidor/consultas/opcoes';
import { Aviso, BarraProgresso, Campo, Dinheiro, Etiqueta, EstadoVazio, LinkBotao, Monograma, Pagina, Traco, classeBotao } from '@/ui/base';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import { cadastrarVendedorAcao } from './acoes';

export const metadata: Metadata = { title: 'Vendedores' };
export const dynamic = 'force-dynamic';

type Linha = Awaited<ReturnType<typeof listarVendedores>>['ativos'][number];

function TabelaPessoas({ linhas }: { linhas: Linha[] }) {
  if (linhas.length === 0) return <EstadoVazio titulo="Nenhuma pessoa nesta lista" />;
  return (
    <div className="tabela-quadro">
      <table className="tabela">
        <thead>
          <tr>
            <th>Pessoa</th><th>Documentos</th><th className="direita">Cotas</th><th className="direita">Produção acumulada</th><th>Próxima categoria</th><th className="direita">Falta</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const p = l.promocao?.situacao;
            return (
              <tr key={l.pessoa.id}>
                <td>
                  <Link href={`/vendedores/${l.pessoa.id}`} className="flex items-center gap-2 font-semibold text-wr-texto no-underline hover:underline">
                    <Monograma nome={l.pessoa.nome} />
                    <span className="min-w-[160px]">{l.pessoa.nome}</span>
                  </Link>
                </td>
                <td>
                  <div className="flex flex-col gap-1">
                    {l.documentos.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center gap-1">
                        <Etiqueta tom={d.tipo === 'CPF' ? 'azul' : 'neutro'}>{d.tipo}</Etiqueta>
                        <span className="numero text-[12px] text-wr-texto-2">{formatarDocumento(d.documento)}</span>
                        {d.categoria ? <Etiqueta tom="verde">{d.categoria.nome}</Etiqueta> : <Etiqueta tom="ambar">sem categoria</Etiqueta>}
                        {d.emRecuperacao ? <Etiqueta tom="ambar">recuperação</Etiqueta> : null}
                        {d.status === 'DESLIGADO' ? <Etiqueta tom="vermelho">desligado</Etiqueta> : null}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="direita numero">{l.cotas}</td>
                <td className="direita"><Dinheiro valor={l.promocao?.volume ?? '0'} /></td>
                <td className="min-w-[180px]">
                  {p?.proximaCategoria ? (
                    <div className="space-y-1">
                      <div className="flex justify-between gap-2 text-[12px]">
                        <span>{p.proximaCategoria}</span>
                        <span className="numero text-wr-texto-2">{p.progressoPct?.toFixed(1).replace('.', ',')}%</span>
                      </div>
                      <BarraProgresso pct={Number(p.progressoPct?.toFixed(1) ?? 0)} tom={p.atingiu ? 'verde' : p.proxima ? 'ambar' : 'azul'} rotulo={`Progresso para ${p.proximaCategoria}`} />
                    </div>
                  ) : <Traco />}
                </td>
                <td className="direita">
                  {p?.atingiu ? <Etiqueta tom="verde">meta atingida</Etiqueta> : p?.falta ? <Dinheiro valor={p.falta} tom={p.proxima ? 'ambar' : undefined} /> : <Traco />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function Vendedores({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('vendedores');
  const sp = await searchParams;
  const busca = param(sp, 'busca');
  const [dados, opcoes] = await Promise.all([listarVendedores(s, busca), opcoesDeFormulario(s)]);
  const podeEditar = pode(s.perfil, 'vendedores', 'editar');
  const atingiram = dados.ativos.filter((l) => l.promocao?.situacao.atingiu);
  const proximos = dados.ativos.filter((l) => l.promocao?.situacao.proxima);
  const pessoasParaDocumento = [...dados.ativos, ...dados.desligados].map((l) => ({ id: l.pessoa.id, nome: l.pessoa.nome }));

  return (
    <Pagina
      titulo="Vendedores"
      descricao="As pessoas que vendem, com produção acumulada e distância da próxima categoria. A regra segue o DOCUMENTO (CPF ou CNPJ); a pessoa unifica a visão."
      acoes={
        <>
          {podeEditar ? <LinkBotao href="/vendedores/sem-cadastro" icone="alerta">Vendem sem cadastro</LinkBotao> : null}
          <LinkBotao href={`/exportar/vendedores${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`} icone="download" download>Exportar</LinkBotao>
        </>
      }
    >
      {dados.temVigenciaFutura > 0 && podeEditar ? (
        <Aviso tom="ambar" titulo={`${dados.temVigenciaFutura} cadastro(s) com data de início no futuro`}>
          Uma data no futuro não vale para nenhuma venda de hoje — costuma ser erro de digitação no ano. <Link href="/vendedores/vigencias-futuras">Conferir</Link>
        </Aviso>
      ) : null}
      {atingiram.length > 0 ? (
        <Aviso tom="verde" titulo="Atingiram a meta de promoção">
          {atingiram.map((l) => <Link key={l.pessoa.id} href={`/vendedores/${l.pessoa.id}`} className="mr-3">{l.pessoa.nome} → {l.promocao?.situacao.proximaCategoria}</Link>)}
          <span className="block text-[12px]">A promoção é um ato registrado: alguém decide na ficha do vendedor.</span>
        </Aviso>
      ) : null}
      {proximos.length > 0 ? (
        <Aviso tom="ambar" titulo="Perto da próxima categoria">
          {proximos.map((l) => <Link key={l.pessoa.id} href={`/vendedores/${l.pessoa.id}`} className="mr-3">{l.pessoa.nome}</Link>)}
        </Aviso>
      ) : null}

      <form method="get" className="cartao flex flex-wrap items-end gap-2 p-3" role="search">
        <Campo rotulo="Buscar por nome, CPF ou CNPJ" nome="busca" className="w-full max-w-md">
          <input id="busca" name="busca" defaultValue={busca} className="campo" placeholder="Nome, CPF ou CNPJ" />
        </Campo>
        <button className={classeBotao('primario')} type="submit">Buscar</button>
        {busca ? <LinkBotao href="/vendedores" variante="fantasma">Limpar</LinkBotao> : null}
      </form>

      {podeEditar ? (
        <Dobra chave="vendedores-cadastrar" titulo="Cadastrar vendedor (ou mais um CPF/CNPJ para a mesma pessoa)">
          <div className="p-4">
            <FormularioAcao acao={cadastrarVendedorAcao} rotulo="Cadastrar">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="É uma pessoa já cadastrada?" nome="pessoaId" ajuda="Escolha a pessoa para juntar este CPF/CNPJ a ela; senão, “Pessoa nova”">
                  <select id="pessoaId" name="pessoaId" className="campo" defaultValue="">
                    <option value="">Pessoa nova</option>
                    {pessoasParaDocumento.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Nome (como no CPF/CNPJ)" nome="nome"><input id="nome" name="nome" className="campo" required /></Campo>
                <Campo rotulo="Tipo" nome="tipoDocumento">
                  <select id="tipoDocumento" name="tipoDocumento" className="campo"><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select>
                </Campo>
                <Campo rotulo="Número do CPF ou CNPJ" nome="documento"><input id="documento" name="documento" className="campo numero" inputMode="numeric" required /></Campo>
                <Campo rotulo="Categoria" nome="categoriaId" ajuda="CPF é Iniciante; CNPJ é Veterano ou Expert">
                  <select id="categoriaId" name="categoriaId" className="campo">
                    {opcoes.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.documentosAceitos.join('/')})</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Equipe" nome="equipeId">
                  <select id="equipeId" name="equipeId" className="campo">
                    {opcoes.equipes.map((e) => <option key={e.id} value={e.id}>{e.gerencia.nome} › {e.nome}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Trabalha com a WR desde" nome="vigenteDe" ajuda="Pode ser data passada. Vendas antes desta data não geram comissão para ele">
                  <input id="vigenteDe" name="vigenteDe" type="date" className="campo" defaultValue={opcoes.hojeISO} required />
                </Campo>
              </div>
            </FormularioAcao>
          </div>
        </Dobra>
      ) : null}

      <Dobra chave="vendedores-ativos" aberta titulo={<>Ativos <span className="numero text-wr-texto-3">({dados.ativos.length})</span></>}>
        <TabelaPessoas linhas={dados.ativos} />
      </Dobra>
      <Dobra
        key={busca}
        chave={busca && dados.ativos.length === 0 && dados.desligados.length > 0 ? `vendedores-desligados-busca` : 'vendedores-desligados'}
        aberta={busca !== '' && dados.ativos.length === 0 && dados.desligados.length > 0}
        titulo={<>Desligados <span className="numero text-wr-texto-3">({dados.desligados.length})</span></>}
      >
        <TabelaPessoas linhas={dados.desligados} />
      </Dobra>
    </Pagina>
  );
}
