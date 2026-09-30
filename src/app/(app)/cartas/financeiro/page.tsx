import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirPagina } from '@/servidor/sessao';
import { financeiroCartas } from '@/servidor/consultas/cartas-financeiro';
import { ROTULO_TIPO_TRANSACAO_CARTA } from '@/dominio/cartas';
import { type Params } from '@/servidor/consultas/comum';
import { Campo, Cartao, DataCurta, Dinheiro, EstadoVazio, Etiqueta, LinkBotao, Pagina, classeBotao } from '@/ui/base';

export const metadata: Metadata = { title: 'Financeiro — Cartas' };
export const dynamic = 'force-dynamic';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default async function FinanceiroCartas({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('cartas');
  const sp = await searchParams;
  const d = await financeiroCartas(s, sp);
  const f = d.filtro;

  return (
    <Pagina titulo="Financeiro — Cartas contempladas" descricao="Uma linha por carta: compra e venda no mesmo registro, então entrada − saída sempre bate com o resultado.">
      <form method="get" className="cartao flex flex-wrap items-end gap-2 p-3" role="search">
        <Campo rotulo="Buscar" nome="busca" className="w-full max-w-xs"><input id="busca" name="busca" defaultValue={f.busca} className="campo" placeholder="Código, cliente, administradora…" /></Campo>
        <Campo rotulo="Tipo" nome="tipo">
          <select id="tipo" name="tipo" defaultValue={f.tipo} className="campo">
            <option value="todos">Todos os tipos</option>
            {(Object.keys(ROTULO_TIPO_TRANSACAO_CARTA) as Array<keyof typeof ROTULO_TIPO_TRANSACAO_CARTA>).map((t) => <option key={t} value={t}>{ROTULO_TIPO_TRANSACAO_CARTA[t]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Mês" nome="mes">
          <select id="mes" name="mes" defaultValue={f.mes} className="campo">
            <option value="">Todos os meses</option>
            {MESES.map((nome, i) => <option key={nome} value={String(i + 1).padStart(2, '0')}>{nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Ano" nome="ano">
          <select id="ano" name="ano" defaultValue={f.ano} className="campo">
            <option value="">Todos</option>
            {d.anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Campo>
        <button className={classeBotao('primario')} type="submit">Filtrar</button>
        {f.busca || f.tipo !== 'todos' || f.mes || f.ano ? <LinkBotao href="/cartas/financeiro" variante="fantasma">Limpar</LinkBotao> : null}
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cartao rotulo="Entradas" valor={<Dinheiro valor={d.totais.entradas} />} tom="verde" />
        <Cartao rotulo="Saídas" valor={<Dinheiro valor={d.totais.saidas} />} tom="vermelho" />
        <Cartao rotulo="Resultado" valor={<Dinheiro valor={d.totais.resultado} />} tom={d.totais.resultado.isNegative() ? 'vermelho' : 'verde'} />
      </div>

      <div className="cartao">
        {d.linhas.length === 0 ? <EstadoVazio titulo="Nenhuma transação encontrada" icone="cartas" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Vendedor</th><th className="direita">Entrada</th><th className="direita">Saída</th><th className="direita">Resultado</th></tr></thead>
              <tbody>
                {d.linhas.map(({ carta, transacao }) => (
                  <tr key={carta.id}>
                    <td><DataCurta valor={transacao.data} /></td>
                    <td><Etiqueta tom={transacao.tipo === 'VENDA' ? 'verde' : transacao.tipo === 'COMPRA' ? 'neutro' : 'azul'}>{ROTULO_TIPO_TRANSACAO_CARTA[transacao.tipo]}</Etiqueta></td>
                    <td>
                      <Link href={`/cartas/${carta.id}`} className="text-wr-texto no-underline hover:underline">
                        {transacao.tipo === 'VENDA' || transacao.tipo === 'INTERMEDIACAO'
                          ? `${ROTULO_TIPO_TRANSACAO_CARTA[transacao.tipo]}: ${carta.clienteComprador?.nome ?? '—'} — ${carta.codigo}`
                          : transacao.tipo === 'TRANSFERIDA'
                            ? `Transferida para a empresa — ${carta.codigo} · ${carta.administradora.nome}`
                            : `Compra de ${carta.clienteVendedor.nome} — ${carta.administradora.nome}`}
                      </Link>
                    </td>
                    <td>{carta.vendedorCarta?.nome ?? '—'}</td>
                    <td className="direita">{!transacao.entrada.isZero() ? <Dinheiro valor={transacao.entrada} tom="verde" /> : '—'}</td>
                    <td className="direita">{!transacao.saida.isZero() ? <Dinheiro valor={transacao.saida} tom="vermelho" /> : '—'}</td>
                    <td className="direita"><Dinheiro valor={transacao.resultado} tom={transacao.resultado.isNegative() ? 'vermelho' : 'verde'} forte /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-center text-[12px] text-wr-texto-3">{d.linhas.length} transação(ões) encontrada(s)</p>
    </Pagina>
  );
}
