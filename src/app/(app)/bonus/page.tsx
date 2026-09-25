import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { periodoDosParametros } from '@/lib/datas';
import { pode } from '@/lib/permissoes';
import { exigirPagina } from '@/servidor/sessao';
import { paginaDe, param, POR_PAGINA, type Params } from '@/servidor/consultas/comum';
import { listarBonus } from '@/servidor/consultas/bonus';
import { Cartao, DataCurta, Dinheiro, EstadoVazio, Etiqueta, LinkBotao, Pagina, Percentual, Secao, Traco } from '@/ui/base';
import { FormularioAcao } from '@/ui/formulario-acao';
import { Paginacao, queryDe } from '@/ui/paginacao';
import { FormularioPeriodoLivre } from '@/ui/periodo-livre';
import { SeletorDePeriodo } from '@/ui/seletor-periodo';
import { reconciliarBonusAcao } from './acoes';

export const metadata: Metadata = { title: 'Bônus Incentivo' };
export const dynamic = 'force-dynamic';

export default async function Bonus({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('bonus');
  const sp = await searchParams;
  const periodo = periodoDosParametros({ mes: param(sp, 'mes') || undefined, de: param(sp, 'de') || undefined, ate: param(sp, 'ate') || undefined });
  const semVinculo = param(sp, 'semVinculo') === '1';
  const pagina = paginaDe(sp);
  const d = await listarBonus(s, periodo, semVinculo, pagina);

  return (
    <Pagina
      titulo="Bônus Incentivo"
      descricao={<>O que a administradora paga à WR em <strong>{periodo.rotulo}</strong>. Não é repassado a vendedor, equipe nem gerência — o rateio existe só para saber de qual gerência veio cada real. A atribuição é congelada na importação.</>}
      acoes={<><Suspense><SeletorDePeriodo /></Suspense><LinkBotao href={`/exportar/bonus${queryDe(sp)}`} icone="download" download>Exportar</LinkBotao></>}
    >
      <FormularioPeriodoLivre periodo={periodo} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao destaque rotulo="Bônus recebido" valor={<Dinheiro valor={d.recebido} />} detalhe={`${d.quantidade} evento(s)`} />
        <Cartao rotulo="Atribuído a uma gerência" valor={<Dinheiro valor={d.atribuido} />} tom="verde" />
        <Cartao rotulo="Sem venda identificada" valor={<Dinheiro valor={d.semVinculo.valor} />} tom={d.semVinculo.quantidade > 0 ? 'ambar' : 'verde'} detalhe={<Link href={`/bonus${queryDe(sp, { semVinculo: semVinculo ? null : '1', pagina: null })}`}>{semVinculo ? 'mostrar todos' : `${d.semVinculo.quantidade} evento(s) — ver só estes`}</Link>} />
      </div>
      {pode(s.perfil, 'bonus', 'editar') && d.semVinculo.quantidade > 0 ? (
        <Secao titulo="Ligar bônus às vendas" descricao="Tenta ligar os bônus sem venda identificada às vendas que chegaram depois. A ligação encontrada fica registrada.">
          <FormularioAcao acao={reconciliarBonusAcao} rotulo="Ligar agora" />
        </Secao>
      ) : null}
      <Secao titulo="Origem por gerência" semPadding>
        {d.porGerencia.length === 0 ? <EstadoVazio titulo="Nenhum bônus no período" /> : (
          <div className="tabela-quadro"><table className="tabela"><thead><tr><th>Gerência</th><th className="direita">Eventos</th><th className="direita">Bônus</th></tr></thead>
            <tbody>{d.porGerencia.map((g) => <tr key={g.nome}><td>{g.nome}</td><td className="direita numero">{g.quantidade}</td><td className="direita"><Dinheiro valor={g.valor} /></td></tr>)}</tbody></table></div>
        )}
      </Secao>
      <Secao titulo="Eventos" semPadding>
        {d.itens.length === 0 ? <EstadoVazio titulo="Nenhum bônus neste período" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Consorciado</th><th>Grupo/Cota</th><th>Contrato</th><th>Vendedor na importação</th><th>Equipe</th><th className="direita">Parc.</th><th className="direita">Valor do evento</th><th className="direita">% incentivo</th><th className="direita">Bônus recebido</th><th>Data</th></tr></thead>
              <tbody>
                {d.itens.map((b) => (
                  <tr key={b.id}>
                    <td>{b.cotaId ? <Link href={`/clientes/${b.cotaId}`}>{b.consorciado ?? '—'}</Link> : <>{b.consorciado ?? '—'} <Etiqueta tom="ambar">sem vínculo</Etiqueta></>}</td>
                    <td className="numero">{b.grupo}/{b.cota}</td>
                    <td className="numero">{b.contrato ?? <Traco />}</td>
                    <td>{b.vendedorNaImportacaoNome ?? <Traco />}</td>
                    <td>{b.equipe ? `${b.equipe.nome} · ${b.gerencia?.nome ?? ''}` : <Traco />}</td>
                    <td className="direita numero">{b.parcela ?? '—'}</td>
                    <td className="direita"><Dinheiro valor={b.valorEvento} /></td>
                    <td className="direita"><Percentual valor={b.percentualIncentivo} /></td>
                    <td className="direita"><Dinheiro valor={b.valorBonus} forte /></td>
                    <td><DataCurta valor={b.dataReferencia} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao caminho="/bonus" params={sp} pagina={pagina} total={d.total} porPagina={POR_PAGINA} />
      </Secao>
    </Pagina>
  );
}
