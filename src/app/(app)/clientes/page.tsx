import type { Metadata } from 'next';
import Link from 'next/link';
import { rotuloMesCurto } from '@/lib/datas';
import { exigirPagina } from '@/servidor/sessao';
import { POR_PAGINA, type Params } from '@/servidor/consultas/comum';
import { listarCarteira } from '@/servidor/consultas/carteira';
import { Campo, Cartao, DataCurta, Dinheiro, EstadoVazio, Etiqueta, LinkBotao, Monograma, Pagina, classeBotao } from '@/ui/base';
import { Paginacao, queryDe } from '@/ui/paginacao';

export const metadata: Metadata = { title: 'Carteira' };
export const dynamic = 'force-dynamic';

export default async function Carteira({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('cotas');
  const sp = await searchParams;
  const d = await listarCarteira(s, sp);
  const f = d.filtro;
  return (
    <Pagina
      titulo="Carteira"
      descricao="Todas as vendas, para procurar e consultar. As vendas entram pela base de clientes enviada em Importações; as canceladas continuam aqui."
      acoes={<LinkBotao href={`/exportar/carteira${queryDe(sp, { pagina: null })}`} icone="download" download>Exportar CSV/XLSX</LinkBotao>}
    >
      <form method="get" className="cartao grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" role="search">
        <Campo rotulo="Busca" nome="busca" className="sm:col-span-2 xl:col-span-2">
          <input id="busca" name="busca" defaultValue={f.busca} className="campo" placeholder="Cliente, CPF, grupo/cota, contrato" />
        </Campo>
        <Campo rotulo="Mês da venda" nome="mes">
          <select id="mes" name="mes" defaultValue={f.mes} className="campo">
            <option value="">Todos</option>
            {d.meses.map((m) => <option key={m.mes} value={m.mes}>{rotuloMesCurto(m.mes)} ({m.n})</option>)}
          </select>
        </Campo>
        <Campo rotulo="Vendedor" nome="vendedor" className="xl:col-span-2">
          <select id="vendedor" name="vendedor" defaultValue={f.vendedor} className="campo">
            <option value="">Todos</option>
            {d.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome} · {v.tipoDocumento}{v.status === 'DESLIGADO' ? ' (desligado)' : ''}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Gerência" nome="gerencia">
          <select id="gerencia" name="gerencia" defaultValue={f.gerencia} className="campo">
            <option value="">Todas</option>
            {d.gerencias.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
        </Campo>
        <div className="flex flex-col justify-end gap-1 text-[13px]">
          <label className="flex items-center gap-2"><input type="checkbox" name="semVendedor" value="1" defaultChecked={f.semVendedor} /> Só sem vendedor</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="semCategoria" value="1" defaultChecked={f.semCategoria} /> Só sem categoria</label>
        </div>
        <div className="flex items-end gap-2">
          {f.situacao ? <input type="hidden" name="situacao" value={f.situacao} /> : null}
          {f.pessoa ? <input type="hidden" name="pessoa" value={f.pessoa} /> : null}
          <button type="submit" className={classeBotao('primario')}>Filtrar</button>
          <LinkBotao href="/clientes" variante="fantasma">Limpar</LinkBotao>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao destaque rotulo="Cotas encontradas" valor={d.total.toLocaleString('pt-BR')} detalhe={f.pessoa ? 'vendas da pessoa selecionada' : 'no filtro atual'} />
        <Cartao rotulo="Crédito somado" valor={<Dinheiro valor={d.creditoTotal} />} tom="azul" detalhe="do filtro inteiro, não só da página" />
        <Cartao rotulo="Sem vendedor identificado" valor={d.semVendedor} tom={d.semVendedor > 0 ? 'ambar' : 'verde'} detalhe={d.semVendedor > 0 ? <Link href={`/clientes${queryDe(sp, { semVendedor: '1', pagina: null })}`}>ver só estas</Link> : 'todas com vendedor'} />
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Situações no filtro atual">
        <Link href={`/clientes${queryDe(sp, { situacao: null, pagina: null })}`} className={`rounded-full border px-3 py-1 text-[12px] no-underline ${!f.situacao ? 'border-wr-verde bg-wr-verde-claro font-semibold text-wr-verde' : 'border-wr-borda text-wr-texto-2'}`}>Todas</Link>
        {d.situacoes.map((x) => (
          <Link key={x.situacao} href={`/clientes${queryDe(sp, { situacao: x.situacao, pagina: null })}`} className={`rounded-full border px-3 py-1 text-[12px] no-underline ${f.situacao === x.situacao ? 'border-wr-verde bg-wr-verde-claro font-semibold text-wr-verde' : 'border-wr-borda text-wr-texto-2'}`}>
            {x.situacao} <span className="numero">{x._count}</span>
          </Link>
        ))}
      </div>

      <div className="cartao">
        {d.cotas.length === 0 ? <EstadoVazio titulo="Nenhuma cota neste filtro">Ajuste os filtros, ou importe a base de clientes em Importações.</EstadoVazio> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Cliente</th><th>Grupo/Cota</th><th className="direita">Crédito</th><th>Venda</th><th className="direita">Parc. pagas</th><th>Vendedor</th><th>Categoria</th><th>Situação</th></tr></thead>
              <tbody>
                {d.cotas.map((c) => (
                  <tr key={c.id}>
                    <td className="min-w-[180px]"><Link href={`/clientes/${c.id}`} className="font-semibold text-wr-texto">{c.clienteNome}</Link></td>
                    <td className="numero">{c.grupo}/{c.cota}</td>
                    <td className="direita"><Dinheiro valor={c.credito} /></td>
                    <td><DataCurta valor={c.dataVenda} /></td>
                    <td className="direita numero">{c.parcelasPagas}</td>
                    <td className="min-w-[200px]">
                      {c.snapVendedor ? (
                        <div className="flex items-center gap-2">
                          <Monograma nome={c.snapVendedor.pessoa.nome} tamanho={24} />
                          <div className="leading-tight">
                            <div>{c.snapVendedor.pessoa.nome}</div>
                            <div className="text-[11px] text-wr-texto-3">{c.snapEquipe?.nome ?? '—'} · {c.snapGerencia?.nome ?? '—'}</div>
                          </div>
                        </div>
                      ) : <Etiqueta tom="ambar" titulo={c.vendedorNomeImportado ?? ''}>sem vendedor{c.vendedorNomeImportado ? `: ${c.vendedorNomeImportado}` : ''}</Etiqueta>}
                    </td>
                    <td>{c.snapCategoria ? c.snapCategoria.nome : <Etiqueta tom="ambar">sem categoria</Etiqueta>}</td>
                    <td>{c.cancelada ? <Etiqueta tom="vermelho">{c.situacao}</Etiqueta> : <Etiqueta tom="neutro">{c.situacao}</Etiqueta>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao caminho="/clientes" params={sp} pagina={d.pagina} total={d.total} porPagina={POR_PAGINA} />
      </div>
      {d.cotas.length > 0 ? <p className="text-[12px] text-wr-texto-3">Sem cadastro manual de cota: corrigir um dado da venda é trabalho da administradora; a próxima importação traz a correção, com versão guardada.</p> : null}
    </Pagina>
  );
}
