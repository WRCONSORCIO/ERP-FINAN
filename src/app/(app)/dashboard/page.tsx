import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { formatarMoeda, type Dec } from '@/lib/dinheiro';
import { periodoDosParametros, rotuloMesLongo, deslocarCompetencia } from '@/lib/datas';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { painel, variacao, type ResumoPeriodo } from '@/servidor/consultas/dashboard';
import { Cartao, Dinheiro, EstadoVazio, Pagina, Secao } from '@/ui/base';
import { GraficoBarras } from '@/ui/grafico-barras';
import { FormularioPeriodoLivre } from '@/ui/periodo-livre';
import { SeletorDePeriodo } from '@/ui/seletor-periodo';
import { Icone } from '@/ui/icones';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

function Variacao({ atual, base, rotulo }: { atual: Dec; base: Dec; rotulo: string }) {
  const v = variacao(atual, base);
  if (v === null) return <span className="text-wr-texto-3">{rotulo}: sem base de comparação</span>;
  const sobe = !v.isNegative();
  return (
    <span className={`inline-flex items-center gap-1 ${sobe ? 'text-wr-verde' : 'text-wr-vermelho'}`}>
      <Icone nome={sobe ? 'tendenciaAlta' : 'tendenciaBaixa'} tamanho={14} />
      <span className="numero">{sobe ? '+' : ''}{v.toFixed(1).replace('.', ',')}%</span>
      <span className="text-wr-texto-2">{rotulo}</span>
    </span>
  );
}

function Comparativo({ titulo, r, atual }: { titulo: string; r: ResumoPeriodo; atual: ResumoPeriodo }) {
  return (
    <div className="rounded-lg border border-wr-borda p-3">
      <p className="rotulo">{titulo}</p>
      <p className="numero mt-1 text-[15px] font-semibold">{formatarMoeda(r.producao)}</p>
      <p className="text-[12px] text-wr-texto-2"><span className="numero">{r.cotas}</span> cota(s) · comissão <span className="numero">{formatarMoeda(r.comissaoPrevista)}</span></p>
      <p className="mt-1 text-[12px]"><Variacao atual={atual.producao} base={r.producao} rotulo="produção atual vs. este" /></p>
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('dashboard');
  const sp = await searchParams;
  const periodo = periodoDosParametros({ mes: param(sp, 'mes') || undefined, de: param(sp, 'de') || undefined, ate: param(sp, 'ate') || undefined });
  const d = await painel(s, periodo);
  const c = d.comparativos;

  return (
    <Pagina
      titulo="Dashboard"
      descricao={<>Como estamos neste período? <strong>{periodo.rotulo}</strong>. Valores respeitam o seu recorte de visibilidade.</>}
      acoes={<><Suspense><SeletorDePeriodo /></Suspense><FormularioPeriodoLivre periodo={periodo} /></>}
    >
      <p className="rotulo">Vendas do período</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao destaque rotulo="Produção" valor={<Dinheiro valor={d.atual.producao} />} detalhe={`${d.atual.cotas} cota(s) vendida(s) · crédito total`} />
        <Cartao rotulo="Comissão prevista" valor={<Dinheiro valor={d.atual.comissaoPrevista} />} tom="azul" detalhe="O que a WR pagará pelas vendas do período (paga pela WR)" />
        <Cartao rotulo="Já liberado" valor={<Dinheiro valor={d.liberado} />} tom="azul" detalhe="Comissão liberada no período (parcela paga pelo cliente)" href="/a-pagar" />
        <Cartao rotulo="Cancelamentos" valor={d.cancelamentos.quantidade} tom={d.cancelamentos.quantidade > 0 ? 'vermelho' : 'verde'} detalhe={<>crédito cancelado <Dinheiro valor={d.cancelamentos.credito} /></>} href="/estornos" />
      </div>
      <p className="rotulo">Cobranças e pendências</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="Estorno a cobrar" valor={<Dinheiro valor={d.estornoACobrar.valor} />} tom={d.estornoACobrar.valor.isZero() ? 'verde' : 'ambar'} detalhe={`${d.estornoACobrar.quantidade} estorno(s) a cobrar ou em cobrança`} href="/estornos" />
        <Cartao rotulo="Pendências de cadastro" valor={d.pendenciasCadastro} tom={d.pendenciasCadastro > 0 ? 'ambar' : 'verde'} detalhe="Vendas sem vendedor, categoria ou estrutura: não geram comissão" href="/importacoes#diagnostico" />
        <Cartao rotulo="Carteira ativa" valor={d.carteiraAtiva.quantidade.toLocaleString('pt-BR')} tom="verde" detalhe={<>cotas não canceladas · <Dinheiro valor={d.carteiraAtiva.credito} /> (não depende do período)</>} href="/clientes" />
      </div>

      {c ? (
        <Secao titulo="Comparativos" descricao="Cada bloco indica o próprio período; nada é misturado.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Comparativo titulo={`Mês anterior · ${rotuloMesLongo(deslocarCompetencia(periodo.competencia as string, -1))}`} r={c.anterior} atual={d.atual} />
            <Comparativo titulo={`Mesmo mês do ano anterior · ${rotuloMesLongo(deslocarCompetencia(periodo.competencia as string, -12))}`} r={c.anoAnterior} atual={d.atual} />
            <div className="rounded-lg border border-wr-borda p-3">
              <p className="rotulo">Acumulado do ano · jan a {rotuloMesLongo(periodo.competencia as string).split(' de ')[0]?.toLowerCase()}</p>
              <p className="numero mt-1 text-[15px] font-semibold">{formatarMoeda(c.acumuladoAno.producao)}</p>
              <p className="text-[12px] text-wr-texto-2"><span className="numero">{c.acumuladoAno.cotas}</span> cota(s) · comissão <span className="numero">{formatarMoeda(c.acumuladoAno.comissaoPrevista)}</span></p>
            </div>
          </div>
          <div className="mt-4">
            <p className="rotulo mb-2">Produção dos últimos 12 meses</p>
            <GraficoBarras serie={c.serie.map((x) => ({ competencia: x.competencia, valor: x.producao }))} destaque={periodo.competencia as string} />
          </div>
        </Secao>
      ) : null}

      <Secao titulo="Produção por gerência" descricao="Gerência congelada na venda." semPadding>
        {d.tabela.length === 0 ? <EstadoVazio titulo="Nenhuma venda no período">Importe a base de clientes em <Link href="/importacoes">Importações</Link>.</EstadoVazio> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Gerência</th><th className="direita">Cotas</th><th className="direita">Produção</th><th className="direita">Comissão prevista</th></tr></thead>
              <tbody>
                {d.tabela.map((g) => (
                  <tr key={g.gerenciaId ?? 'sem'}>
                    <td className="font-semibold">{g.gerenciaId ? <Link href={`/clientes?gerencia=${g.gerenciaId}${periodo.competencia ? `&mes=${periodo.competencia}` : ''}`}>{g.nome}</Link> : g.nome}</td>
                    <td className="direita numero">{g.cotas}</td>
                    <td className="direita"><Dinheiro valor={g.producao} /></td>
                    <td className="direita"><Dinheiro valor={g.comissao} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total</td><td className="direita numero">{d.atual.cotas}</td><td className="direita"><Dinheiro valor={d.atual.producao} /></td><td className="direita"><Dinheiro valor={d.atual.comissaoPrevista} /></td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </Secao>
    </Pagina>
  );
}
