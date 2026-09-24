import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { periodoDosParametros } from '@/lib/datas';
import { formatarDocumento } from '@/lib/documento';
import { ROTULO_DESTINO, type Destino } from '@/dominio/comissao';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { extratoDaPessoa } from '@/servidor/consultas/extrato';
import { Cartao, DataCurta, Dinheiro, EstadoVazio, Etiqueta, LinkBotao, Pagina, Percentual, Secao } from '@/ui/base';
import { MemoriaDeCalculo } from '@/ui/memoria';
import { queryDe } from '@/ui/paginacao';
import { ROTULO_COMISSAO, ROTULO_ESTORNO } from '@/ui/rotulos';
import { SeletorDePeriodo } from '@/ui/seletor-periodo';

export const metadata: Metadata = { title: 'Extrato do vendedor' };
export const dynamic = 'force-dynamic';

export default async function Extrato({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const s = await exigirPagina('comissoes');
  const { id } = await params;
  const sp = await searchParams;
  const periodo = periodoDosParametros({ mes: param(sp, 'mes') || undefined, de: param(sp, 'de') || undefined, ate: param(sp, 'ate') || undefined });
  const e = await extratoDaPessoa(s, id, periodo);
  if (!e) notFound();
  return (
    <Pagina
      titulo={`Extrato · ${e.pessoa.nome}`}
      descricao={<>Comissões liberadas e estornos de <strong>{periodo.rotulo}</strong>, com o mesmo detalhe da tela: cada venda, cada parcela, o percentual aplicado. Documentos: {e.pessoa.documentos.map((d) => `${d.tipoDocumento} ${formatarDocumento(d.documento)}`).join(' · ') || '—'}.</>}
      acoes={<><Suspense><SeletorDePeriodo /></Suspense><LinkBotao href={`/exportar/extrato${queryDe(sp, { pessoa: id })}`} icone="download" download variante="primario">Baixar PDF</LinkBotao><LinkBotao href={`/vendedores/${id}`} variante="fantasma">Ficha</LinkBotao></>}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao destaque rotulo="Comissão paga pela WR" valor={<Dinheiro valor={e.totalComissao} />} detalhe="liberada no período" />
        <Cartao rotulo="Paga direto pela administradora" valor={<Dinheiro valor={e.totalAdm} />} tom="azul" detalhe="referência (a WR não desembolsa)" />
        <Cartao rotulo="Estornos do período" valor={<Dinheiro valor={e.totalEstorno} />} tom="vermelho" />
        <Cartao rotulo="Líquido informativo" valor={<Dinheiro valor={e.liquidoInformativo} />} tom="neutro" detalhe="estorno não é descontado automaticamente" />
      </div>
      <Secao titulo="Comissões" semPadding>
        {e.comissoes.length === 0 ? <EstadoVazio titulo="Nenhuma comissão liberada no período" /> : (
          <div className="tabela-quadro"><table className="tabela">
            <thead><tr><th>Venda</th><th>Cliente</th><th>Cota</th><th className="direita">Crédito</th><th>Flex</th><th>Papel</th><th className="direita">Parcela</th><th className="direita">%</th><th className="direita">Comissão</th><th>Quem paga</th><th>Situação</th><th>Memória</th></tr></thead>
            <tbody>{e.comissoes.map((c) => (
              <tr key={c.id}>
                <td><DataCurta valor={c.cota.dataVenda} /></td><td><Link href={`/clientes/${c.cota.id}`}>{c.cota.clienteNome}</Link></td><td className="numero">{c.cota.grupo}/{c.cota.cota}</td>
                <td className="direita"><Dinheiro valor={c.cota.credito} /></td><td>{c.cota.snapModalidadeFlex?.nome ?? '—'}</td><td>{ROTULO_DESTINO[c.destino as Destino]}{c.ajusteDeId ? <> <Etiqueta tom="azul">ajuste</Etiqueta></> : null}</td>
                <td className="direita numero">{c.parcela}ª</td><td className="direita"><Percentual valor={c.percentual} /></td><td className="direita"><Dinheiro valor={c.valor} forte /></td>
                <td>{c.pagaPelaWr ? 'WR' : 'administradora'}</td><td>{ROTULO_COMISSAO[c.status]}</td><td><MemoriaDeCalculo memoria={c.memoria} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Secao>
      <Secao titulo="Estornos" semPadding>
        {e.estornos.length === 0 ? <EstadoVazio titulo="Nenhum estorno no período" icone="ok" /> : (
          <div className="tabela-quadro"><table className="tabela">
            <thead><tr><th>Cancelamento</th><th>Cliente</th><th>Cota</th><th>Tipo</th><th className="direita">Comissão base</th><th className="direita">%</th><th className="direita">Valor</th><th>Situação</th></tr></thead>
            <tbody>{e.estornos.map((x) => (
              <tr key={x.id}><td><DataCurta valor={x.dataEvento} /></td><td><Link href={`/clientes/${x.cota.id}`}>{x.cota.clienteNome}</Link></td><td className="numero">{x.cota.grupo}/{x.cota.cota}</td><td>{x.tipo === 'RECUPERACAO' ? 'Recuperação' : 'Cancelamento'}</td><td className="direita"><Dinheiro valor={x.comissaoBase} /></td><td className="direita"><Percentual valor={x.percentual} /></td><td className="direita"><Dinheiro valor={x.valor} tom="vermelho" /></td><td>{ROTULO_ESTORNO[x.status]}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Secao>
    </Pagina>
  );
}
