import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatarDataHora } from '@/lib/datas';
import { pode } from '@/lib/permissoes';
import { exigirPagina } from '@/servidor/sessao';
import { buscarCarta, opcoesFormularioCarta } from '@/servidor/consultas/cartas';
import { Campo, Cartao, DataCurta, Dinheiro, Etiqueta, Pagina, Secao, Traco } from '@/ui/base';
import { ComboboxClienteCarta } from '@/ui/combobox-cliente-carta';
import { FormularioAcao } from '@/ui/formulario-acao';
import { alterarCartaAcao, excluirCartaAcao } from '../acoes';

export const metadata: Metadata = { title: 'Ficha da carta' };
export const dynamic = 'force-dynamic';

export default async function FichaCarta({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirPagina('cartas');
  const { id } = await params;
  const ficha = await buscarCarta(s, id);
  if (!ficha) notFound();
  const { carta, auditoria } = ficha;
  const opcoes = await opcoesFormularioCarta(s);
  const podeEditar = pode(s.perfil, 'cartas', 'editar');
  const dataISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

  return (
    <Pagina
      titulo={carta.codigo}
      descricao={`${carta.administradora.nome} · cadastrada em ${formatarDataHora(carta.criadoEm)}`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Situação" valor={carta.status === 'VENDIDA' ? 'Vendida' : carta.status === 'TRANSFERIDA' ? 'Transferida' : 'Estoque'} tom={carta.status === 'VENDIDA' ? 'verde' : carta.status === 'TRANSFERIDA' ? 'azul' : 'ambar'} />
        <Cartao rotulo="Valor de compra" valor={<Dinheiro valor={carta.valorCompra} />} />
        <Cartao rotulo="Valor de venda" valor={carta.valorVenda !== null ? <Dinheiro valor={carta.valorVenda} /> : <Traco />} />
        <Cartao rotulo="Lucro" valor={carta.lucro !== null ? <Dinheiro valor={carta.lucro} /> : <Traco />} tom={carta.lucro !== null ? (Number(carta.lucro) >= 0 ? 'verde' : 'vermelho') : 'neutro'} />
      </div>

      <Secao titulo="Dados da carta" descricao={carta.tipoNegociacao === 'INTERMEDIACAO' ? 'Intermediação: nunca passa pelo caixa/estoque da empresa.' : undefined}>
        {podeEditar ? (
          <FormularioAcao acao={alterarCartaAcao} rotulo="Salvar alterações">
            <input type="hidden" name="id" value={carta.id} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Administradora" nome="administradoraId">
                <select id="administradoraId" name="administradoraId" className="campo" defaultValue={carta.administradoraId} required>
                  {opcoes.administradoras.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  {!opcoes.administradoras.some((a) => a.id === carta.administradoraId) ? <option value={carta.administradoraId}>{carta.administradora.nome} (inativa)</option> : null}
                </select>
              </Campo>
              <Campo rotulo="Tipo de negociação" nome="tipoNegociacao">
                <select id="tipoNegociacao" name="tipoNegociacao" className="campo" defaultValue={carta.tipoNegociacao}>
                  <option value="COMPRA_VENDA">Compra e venda</option>
                  <option value="INTERMEDIACAO">Intermediação</option>
                </select>
              </Campo>
              <Campo rotulo="Situação" nome="status">
                <select id="status" name="status" className="campo" defaultValue={carta.status}>
                  <option value="ESTOQUE">Em estoque (ainda não vendida)</option>
                  <option value="VENDIDA">Vendida para um cliente</option>
                  <option value="TRANSFERIDA">Transferida para o nome da empresa</option>
                </select>
              </Campo>
              <Campo rotulo="Vendedor interno" nome="vendedorCartaId">
                <select id="vendedorCartaId" name="vendedorCartaId" className="campo" defaultValue={carta.vendedorCartaId ?? ''}>
                  <option value="">Nenhum</option>
                  {opcoes.vendedoresCarta.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  {carta.vendedorCarta && !opcoes.vendedoresCarta.some((v) => v.id === carta.vendedorCartaId) ? <option value={carta.vendedorCarta.id}>{carta.vendedorCarta.nome} (inativo)</option> : null}
                </select>
              </Campo>
              <Campo rotulo="Cliente (dono atual / quem está vendendo a carta)" nome="clienteVendedorId" className="sm:col-span-2">
                <ComboboxClienteCarta nome="clienteVendedorId" opcoes={opcoes.clientesCarta} valorInicial={carta.clienteVendedorId} rotuloCampo="Cliente dono atual" />
              </Campo>
              <Campo rotulo="Cliente comprador" nome="clienteCompradorId" className="sm:col-span-2" ajuda="Obrigatório quando a situação é Vendida">
                <ComboboxClienteCarta nome="clienteCompradorId" opcoes={opcoes.clientesCarta} valorInicial={carta.clienteCompradorId ?? undefined} rotuloCampo="Cliente comprador" obrigatorio={false} />
              </Campo>
              <Campo rotulo="Valor da carta (R$)" nome="valorCarta"><input id="valorCarta" name="valorCarta" inputMode="decimal" className="campo numero" defaultValue={carta.valorCarta.toFixed(2).replace('.', ',')} required /></Campo>
              <Campo rotulo="Valor de compra (R$)" nome="valorCompra"><input id="valorCompra" name="valorCompra" inputMode="decimal" className="campo numero" defaultValue={carta.valorCompra.toFixed(2).replace('.', ',')} required /></Campo>
              <Campo rotulo="Valor de venda (R$)" nome="valorVenda" ajuda="Obrigatório quando a situação é Vendida"><input id="valorVenda" name="valorVenda" inputMode="decimal" className="campo numero" defaultValue={carta.valorVenda?.toFixed(2).replace('.', ',') ?? ''} /></Campo>
              <Campo rotulo="Valor da parcela (R$)" nome="valorParcela"><input id="valorParcela" name="valorParcela" inputMode="decimal" className="campo numero" defaultValue={carta.valorParcela.toFixed(2).replace('.', ',')} /></Campo>
              <Campo rotulo="Parcelas pagas" nome="parcelasPagas"><input id="parcelasPagas" name="parcelasPagas" inputMode="numeric" className="campo numero" defaultValue={carta.parcelasPagas} /></Campo>
              <Campo rotulo="Parcelas a pagar" nome="parcelasAPagar"><input id="parcelasAPagar" name="parcelasAPagar" inputMode="numeric" className="campo numero" defaultValue={carta.parcelasAPagar} /></Campo>
              <Campo rotulo="Comissão do vendedor (R$)" nome="comissaoVendedor"><input id="comissaoVendedor" name="comissaoVendedor" inputMode="decimal" className="campo numero" defaultValue={carta.comissaoVendedor.toFixed(2).replace('.', ',')} /></Campo>
              <Campo rotulo="Data da compra" nome="dataCompra"><input id="dataCompra" name="dataCompra" type="date" className="campo" defaultValue={dataISO(carta.dataCompra)} required /></Campo>
              <Campo rotulo="Data da venda" nome="dataVenda" ajuda="Obrigatório quando a situação é Vendida"><input id="dataVenda" name="dataVenda" type="date" className="campo" defaultValue={dataISO(carta.dataVenda)} /></Campo>
              <Campo rotulo="Data da transferência" nome="dataTransferencia" ajuda="Obrigatório quando a situação é Transferida"><input id="dataTransferencia" name="dataTransferencia" type="date" className="campo" defaultValue={dataISO(carta.dataTransferencia)} /></Campo>
              <Campo rotulo="Observações" nome="observacoes" className="sm:col-span-2 lg:col-span-4"><textarea id="observacoes" name="observacoes" className="campo" rows={2} defaultValue={carta.observacoes ?? ''} /></Campo>
            </div>
          </FormularioAcao>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
            <div><p className="rotulo">Cliente (dono atual)</p><p>{carta.clienteVendedor.nome}</p></div>
            <div><p className="rotulo">Comprador</p><p>{carta.clienteComprador?.nome ?? <Traco />}</p></div>
            <div><p className="rotulo">Vendedor interno</p><p>{carta.vendedorCarta?.nome ?? <Traco />}</p></div>
            <div><p className="rotulo">Data da compra</p><p><DataCurta valor={carta.dataCompra} /></p></div>
          </div>
        )}
      </Secao>

      {podeEditar ? (
        <Secao titulo="Excluir carta" descricao="Exclusão física — este é o único módulo do ERP com exclusão definitiva (decisão do usuário). Fica registrado na auditoria.">
          <FormularioAcao acao={excluirCartaAcao} rotulo="Excluir" perigo confirmacao={`A carta ${carta.codigo} será apagada e não poderá ser recuperada.`}>
            <input type="hidden" name="id" value={carta.id} />
            <Campo rotulo="Motivo" nome="motivo"><input id="motivo" name="motivo" className="campo" required /></Campo>
          </FormularioAcao>
        </Secao>
      ) : null}

      <Secao titulo="Auditoria" descricao="Últimos 30 eventos desta carta.">
        {auditoria.length === 0 ? <p className="text-[12px] text-wr-texto-3">Nenhum evento registrado.</p> : (
          <div className="tabela-quadro rounded-lg border border-wr-borda">
            <table className="tabela">
              <thead><tr><th>Quando</th><th>Ação</th><th>Quem</th></tr></thead>
              <tbody>
                {auditoria.map((a) => (
                  <tr key={a.id.toString()}>
                    <td className="numero"><span suppressHydrationWarning>{formatarDataHora(a.criadoEm)}</span></td>
                    <td><Etiqueta>{a.acao}</Etiqueta></td>
                    <td>{a.usuario?.nome ?? a.email ?? <Traco />}</td>
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
