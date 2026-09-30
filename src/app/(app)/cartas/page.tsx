import type { Metadata } from 'next';
import Link from 'next/link';
import { pode } from '@/lib/permissoes';
import { exigirPagina } from '@/servidor/sessao';
import { POR_PAGINA, type Params } from '@/servidor/consultas/comum';
import { listarCartas, opcoesFormularioCarta, type AbaCartas } from '@/servidor/consultas/cartas';
import { Campo, Dinheiro, DataCurta, EstadoVazio, Etiqueta, LinkBotao, Traco, classeBotao } from '@/ui/base';
import { ComboboxClienteCarta } from '@/ui/combobox-cliente-carta';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import { Paginacao, queryDe } from '@/ui/paginacao';
import { cadastrarCartaAcao, cadastrarClienteCartaAcao } from './acoes';

export const metadata: Metadata = { title: 'Cartas contempladas' };
export const dynamic = 'force-dynamic';

const ABAS: Array<{ aba: AbaCartas; rotulo: string }> = [
  { aba: 'todas', rotulo: 'Todas' },
  { aba: 'ESTOQUE', rotulo: 'Estoque' },
  { aba: 'VENDIDA', rotulo: 'Vendidas' },
  { aba: 'TRANSFERIDA', rotulo: 'Transferidas' },
  { aba: 'INTERMEDIACAO', rotulo: 'Intermediação' },
];

function EtiquetaStatus({ status }: { status: 'ESTOQUE' | 'VENDIDA' | 'TRANSFERIDA' }) {
  if (status === 'VENDIDA') return <Etiqueta tom="verde">Vendida</Etiqueta>;
  if (status === 'TRANSFERIDA') return <Etiqueta tom="azul">Transferida</Etiqueta>;
  return <Etiqueta tom="ambar">Estoque</Etiqueta>;
}

export default async function Cartas({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('cartas');
  const sp = await searchParams;
  const [dados, opcoes] = await Promise.all([listarCartas(s, sp), opcoesFormularioCarta(s)]);
  const f = dados.filtro;
  const podeEditar = pode(s.perfil, 'cartas', 'editar');

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold leading-tight text-wr-texto">Cartas contempladas</h1>
          <p className="mt-0.5 max-w-3xl text-[13px] text-wr-texto-2">Compra, venda e intermediação de cotas já contempladas — um processo separado da venda de cota nova.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkBotao href="/cartas/dashboard" icone="dashboard">Dashboard</LinkBotao>
          <LinkBotao href="/cartas/financeiro" icone="grafico">Financeiro</LinkBotao>
          <LinkBotao href="/cartas/vendedores" icone="vendedores">Vendedores</LinkBotao>
        </div>
      </header>

      <form method="get" className="cartao flex flex-wrap items-end gap-2 p-3" role="search">
        <Campo rotulo="Buscar por código, cliente, documento ou administradora" nome="busca" className="w-full max-w-md">
          <input id="busca" name="busca" defaultValue={f.busca} className="campo" placeholder="Código, cliente, CPF/CNPJ, administradora" />
        </Campo>
        <Campo rotulo="Administradora" nome="administradoraId">
          <select id="administradoraId" name="administradoraId" defaultValue={f.administradoraId} className="campo">
            <option value="">Todas</option>
            {opcoes.administradoras.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </Campo>
        {f.aba !== 'todas' ? <input type="hidden" name="aba" value={f.aba} /> : null}
        <button className={classeBotao('primario')} type="submit">Filtrar</button>
        {f.busca || f.administradoraId ? <LinkBotao href={`/cartas${queryDe(sp, { busca: null, administradoraId: null, pagina: null })}`} variante="fantasma">Limpar</LinkBotao> : null}
      </form>

      <div className="flex flex-wrap gap-2" aria-label="Situação no filtro atual">
        {ABAS.map((a) => (
          <Link
            key={a.aba}
            href={`/cartas${queryDe(sp, { aba: a.aba === 'todas' ? null : a.aba, pagina: null })}`}
            className={`rounded-full border px-3 py-1 text-[12px] no-underline ${f.aba === a.aba ? 'border-wr-verde bg-wr-verde-claro font-semibold text-wr-verde' : 'border-wr-borda text-wr-texto-2'}`}
          >
            {a.rotulo} <span className="numero">({dados.contagens[a.aba]})</span>
          </Link>
        ))}
      </div>

      {podeEditar ? (
        <Dobra chave="cartas-cadastrar" titulo="Nova carta">
          <div className="space-y-4 p-4">
            <FormularioAcao acao={cadastrarCartaAcao} rotulo="Cadastrar carta">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Administradora" nome="administradoraId">
                  <select id="administradoraId" name="administradoraId" className="campo" required>
                    <option value="">Selecione…</option>
                    {opcoes.administradoras.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Tipo de negociação" nome="tipoNegociacao" ajuda="Intermediação nunca passa pelo caixa/estoque da empresa">
                  <select id="tipoNegociacao" name="tipoNegociacao" className="campo" defaultValue="COMPRA_VENDA">
                    <option value="COMPRA_VENDA">Compra e venda</option>
                    <option value="INTERMEDIACAO">Intermediação</option>
                  </select>
                </Campo>
                <Campo rotulo="Situação" nome="status">
                  <select id="status" name="status" className="campo" defaultValue="ESTOQUE">
                    <option value="ESTOQUE">Em estoque (ainda não vendida)</option>
                    <option value="VENDIDA">Vendida para um cliente</option>
                    <option value="TRANSFERIDA">Transferida para o nome da empresa</option>
                  </select>
                </Campo>
                <Campo rotulo="Vendedor interno" nome="vendedorCartaId" ajuda="Quem recebe a comissão desta negociação">
                  <select id="vendedorCartaId" name="vendedorCartaId" className="campo" defaultValue="">
                    <option value="">Nenhum</option>
                    {opcoes.vendedoresCarta.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Cliente (dono atual / quem está vendendo a carta)" nome="clienteVendedorId" className="sm:col-span-2">
                  <ComboboxClienteCarta nome="clienteVendedorId" opcoes={opcoes.clientesCarta} rotuloCampo="Cliente dono atual" />
                </Campo>
                <Campo rotulo="Cliente comprador" nome="clienteCompradorId" className="sm:col-span-2" ajuda="Obrigatório quando a situação é Vendida">
                  <ComboboxClienteCarta nome="clienteCompradorId" opcoes={opcoes.clientesCarta} rotuloCampo="Cliente comprador" obrigatorio={false} />
                </Campo>
                <Campo rotulo="Valor da carta (R$)" nome="valorCarta"><input id="valorCarta" name="valorCarta" inputMode="decimal" className="campo numero" placeholder="0,00" required /></Campo>
                <Campo rotulo="Valor de compra (R$)" nome="valorCompra"><input id="valorCompra" name="valorCompra" inputMode="decimal" className="campo numero" placeholder="0,00" required /></Campo>
                <Campo rotulo="Valor de venda (R$)" nome="valorVenda" ajuda="Obrigatório quando a situação é Vendida"><input id="valorVenda" name="valorVenda" inputMode="decimal" className="campo numero" placeholder="0,00" /></Campo>
                <Campo rotulo="Valor da parcela (R$)" nome="valorParcela"><input id="valorParcela" name="valorParcela" inputMode="decimal" className="campo numero" placeholder="0,00" defaultValue="0" /></Campo>
                <Campo rotulo="Parcelas pagas" nome="parcelasPagas"><input id="parcelasPagas" name="parcelasPagas" inputMode="numeric" className="campo numero" defaultValue="0" /></Campo>
                <Campo rotulo="Parcelas a pagar" nome="parcelasAPagar"><input id="parcelasAPagar" name="parcelasAPagar" inputMode="numeric" className="campo numero" defaultValue="0" /></Campo>
                <Campo rotulo="Comissão do vendedor (R$)" nome="comissaoVendedor"><input id="comissaoVendedor" name="comissaoVendedor" inputMode="decimal" className="campo numero" placeholder="0,00" defaultValue="0" /></Campo>
                <Campo rotulo="Data da compra" nome="dataCompra"><input id="dataCompra" name="dataCompra" type="date" className="campo" defaultValue={opcoes.hojeISO} required /></Campo>
                <Campo rotulo="Data da venda" nome="dataVenda" ajuda="Obrigatório quando a situação é Vendida"><input id="dataVenda" name="dataVenda" type="date" className="campo" /></Campo>
                <Campo rotulo="Data da transferência" nome="dataTransferencia" ajuda="Obrigatório quando a situação é Transferida"><input id="dataTransferencia" name="dataTransferencia" type="date" className="campo" /></Campo>
                <Campo rotulo="Observações" nome="observacoes" className="sm:col-span-2 lg:col-span-4"><textarea id="observacoes" name="observacoes" className="campo" rows={2} /></Campo>
              </div>
            </FormularioAcao>

            <Dobra chave="cartas-cadastrar-cliente" titulo="Cliente não encontrado na busca? Cadastre um cliente novo">
              <div className="p-3">
                <FormularioAcao acao={cadastrarClienteCartaAcao} rotulo="Cadastrar cliente">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Campo rotulo="Nome" nome="nomeCliente"><input id="nomeCliente" name="nome" className="campo" required /></Campo>
                    <Campo rotulo="Tipo" nome="tipoDocumentoCliente">
                      <select id="tipoDocumentoCliente" name="tipoDocumento" className="campo"><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select>
                    </Campo>
                    <Campo rotulo="Número do CPF ou CNPJ" nome="documentoCliente"><input id="documentoCliente" name="documento" className="campo numero" inputMode="numeric" required /></Campo>
                    <Campo rotulo="Telefone" nome="telefoneCliente"><input id="telefoneCliente" name="telefone" className="campo" /></Campo>
                    <Campo rotulo="E-mail" nome="emailCliente"><input id="emailCliente" name="email" type="email" className="campo" /></Campo>
                  </div>
                </FormularioAcao>
              </div>
            </Dobra>
          </div>
        </Dobra>
      ) : null}

      <div className="cartao">
        {dados.cartas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma carta neste filtro" icone="cartas">Ajuste os filtros{podeEditar ? ', ou cadastre uma carta acima' : ''}.</EstadoVazio>
        ) : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Código</th><th>Administradora</th><th>Situação</th><th>Tipo</th><th>Cliente (dono)</th><th>Comprador</th><th>Vendedor</th>
                  <th className="direita">Compra</th><th className="direita">Venda</th><th className="direita">Lucro</th><th>Data</th>
                </tr>
              </thead>
              <tbody>
                {dados.cartas.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/cartas/${c.id}`} className="numero font-semibold text-wr-texto no-underline hover:underline">{c.codigo}</Link></td>
                    <td>{c.administradora.nome}</td>
                    <td><EtiquetaStatus status={c.status} /></td>
                    <td>{c.tipoNegociacao === 'INTERMEDIACAO' ? <Etiqueta tom="azul">Intermediação</Etiqueta> : <Traco />}</td>
                    <td className="min-w-[160px]">
                      <div className="flex flex-col">
                        <span className="truncate" title={c.clienteVendedor.nome}>{c.clienteVendedor.nome}</span>
                        <span className="numero text-[11px] text-wr-texto-3">{c.clienteVendedor.documento}</span>
                      </div>
                    </td>
                    <td className="min-w-[160px]">
                      {c.clienteComprador ? (
                        <div className="flex flex-col">
                          <span className="truncate" title={c.clienteComprador.nome}>{c.clienteComprador.nome}</span>
                          <span className="numero text-[11px] text-wr-texto-3">{c.clienteComprador.documento}</span>
                        </div>
                      ) : c.status === 'TRANSFERIDA' ? <span className="text-[12px] text-wr-texto-3">Transferida para a empresa</span> : <Traco />}
                    </td>
                    <td className="min-w-[120px]"><span className="block max-w-32 truncate">{c.vendedorCarta?.nome ?? <Traco />}</span></td>
                    <td className="direita"><Dinheiro valor={c.valorCompra} /></td>
                    <td className="direita">{c.valorVenda !== null ? <Dinheiro valor={c.valorVenda} /> : <Traco />}</td>
                    <td className="direita">{c.lucro !== null ? <Dinheiro valor={c.lucro} tom={Number(c.lucro) >= 0 ? 'verde' : 'vermelho'} forte /> : <Traco />}</td>
                    <td><DataCurta valor={c.dataVenda ?? c.dataTransferencia ?? c.dataCompra} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao caminho="/cartas" params={sp} pagina={dados.pagina} total={dados.total} porPagina={POR_PAGINA} />
      </div>
    </div>
  );
}
