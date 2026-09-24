import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { periodoDosParametros } from '@/lib/datas';
import { pode } from '@/lib/permissoes';
import { ROTULO_DESTINO, type Destino } from '@/dominio/comissao';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { listarEstornos } from '@/servidor/consultas/estornos';
import { Cartao, DataCurta, Dinheiro, EstadoVazio, Etiqueta, LinkBotao, Monograma, Pagina, Percentual, Secao } from '@/ui/base';
import { FormularioAcao } from '@/ui/formulario-acao';
import { MemoriaDeCalculo } from '@/ui/memoria';
import { queryDe } from '@/ui/paginacao';
import { FormularioPeriodoLivre } from '@/ui/periodo-livre';
import { ROTULO_ESTORNO, TOM_ESTORNO } from '@/ui/rotulos';
import { SeletorDePeriodo } from '@/ui/seletor-periodo';
import { movimentarEstornoAcao } from './acoes';

export const metadata: Metadata = { title: 'Estornos' };
export const dynamic = 'force-dynamic';

export default async function Estornos({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('estornos');
  const sp = await searchParams;
  const periodo = periodoDosParametros({ mes: param(sp, 'mes') || undefined, de: param(sp, 'de') || undefined, ate: param(sp, 'ate') || undefined });
  const abertos = param(sp, 'abertos') === '1';
  const sel = param(sp, 'titular');
  const d = await listarEstornos(s, periodo, abertos);
  const podeEditar = pode(s.perfil, 'estornos', 'editar');
  const podePerdoar = pode(s.perfil, 'estornos', 'tudo');
  const grupoSel = d.grupos.find((g) => g.chave === sel);

  return (
    <Pagina
      titulo="Estornos"
      descricao={<>Comissão a devolver por venda que caiu. {abertos ? <strong>Todos os estornos em aberto (qualquer data).</strong> : <>Cancelamentos ocorridos em <strong>{periodo.rotulo}</strong>.</>} Recuperação tem precedência sobre cancelamento; uma venda nunca é cobrada duas vezes.</>}
      acoes={
        <>
          <Suspense><SeletorDePeriodo /></Suspense>
          <LinkBotao href={abertos ? '/estornos' : '/estornos?abertos=1'} variante={abertos ? 'primario' : 'secundario'}>{abertos ? 'Voltar ao período' : 'Todos em aberto'}</LinkBotao>
          <LinkBotao href={`/exportar/estornos${queryDe(sp)}`} icone="download" download>Exportar</LinkBotao>
        </>
      }
    >
      {!abertos ? <FormularioPeriodoLivre periodo={periodo} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao destaque rotulo="Total a estornar" valor={<Dinheiro valor={d.totais.total} />} detalhe={`${d.totais.cobrancas} cobrança(s)`} />
        <Cartao rotulo="Por recuperação" valor={<Dinheiro valor={d.totais.recuperacao} />} tom="vermelho" />
        <Cartao rotulo="Por cancelamento" valor={<Dinheiro valor={d.totais.cancelamento} />} tom="vermelho" />
      </div>

      <Secao titulo="Por vendedor" semPadding>
        {d.grupos.length === 0 ? <EstadoVazio titulo="Nenhum estorno neste recorte" icone="ok" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Vendedor</th><th className="direita">Cobranças</th><th className="direita">Recuperação</th><th className="direita">Cancelamento</th><th className="direita">Total a estornar</th></tr></thead>
              <tbody>
                {d.grupos.map((g) => (
                  <tr key={g.chave} className={g.chave === sel ? 'bg-wr-verde-claro/50' : ''}>
                    <td>
                      <Link href={`/estornos${queryDe(sp, { titular: g.chave })}#detalhe`} className="flex items-center gap-2 font-semibold text-wr-texto">
                        {g.pessoaId ? <Monograma nome={g.nome} tamanho={24} /> : null}
                        {g.pessoaId ? g.nome : <Etiqueta tom="vermelho">SEM TITULAR</Etiqueta>}
                      </Link>
                    </td>
                    <td className="direita numero">{g.cobrancas}</td>
                    <td className="direita"><Dinheiro valor={g.recuperacao} /></td>
                    <td className="direita"><Dinheiro valor={g.cancelamento} /></td>
                    <td className="direita"><Dinheiro valor={g.total} tom="vermelho" forte /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="direita numero">{d.totais.cobrancas}</td><td className="direita"><Dinheiro valor={d.totais.recuperacao} /></td><td className="direita"><Dinheiro valor={d.totais.cancelamento} /></td><td className="direita"><Dinheiro valor={d.totais.total} /></td></tr></tfoot>
            </table>
          </div>
        )}
      </Secao>

      {grupoSel ? (
        <Secao id="detalhe" titulo={`Detalhe · ${grupoSel.nome}`} descricao="Ciclo: a cobrar → em cobrança → quitado, ou perdoado. Cada passo fica registrado. Estorno nunca é descontado da folha automaticamente." semPadding>
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Cliente</th><th>Grupo/Cota</th><th className="direita">Crédito</th><th>Evento</th><th className="direita">Parc. pagas</th><th className="direita">Comissão base</th><th className="direita">% estorno</th><th className="direita">Valor</th><th>Situação</th><th>Memória</th>{podeEditar ? <th>Cobrança</th> : null}</tr></thead>
              <tbody>
                {grupoSel.itens.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/clientes/${e.cota.id}`}>{e.cota.clienteNome}</Link></td>
                    <td className="numero">{e.cota.grupo}/{e.cota.cota}</td>
                    <td className="direita"><Dinheiro valor={e.cota.credito} /></td>
                    <td>{e.tipo === 'RECUPERACAO' ? 'Recuperação' : 'Cancelamento'} · {ROTULO_DESTINO[e.destino as Destino]}<span className="block text-[11px] text-wr-texto-3"><DataCurta valor={e.dataEvento} /></span></td>
                    <td className="direita numero">{e.parcelasPagas}</td>
                    <td className="direita"><Dinheiro valor={e.comissaoBase} /></td>
                    <td className="direita"><Percentual valor={e.percentual} /></td>
                    <td className="direita"><Dinheiro valor={e.valor} tom="vermelho" forte /></td>
                    <td><Etiqueta tom={TOM_ESTORNO[e.status] ?? 'neutro'}>{ROTULO_ESTORNO[e.status]}</Etiqueta></td>
                    <td><MemoriaDeCalculo memoria={e.memoria} /></td>
                    {podeEditar ? (
                      <td className="min-w-[280px]">
                        {e.status === 'A_COBRAR' || e.status === 'EM_COBRANCA' ? (
                          <FormularioAcao acao={movimentarEstornoAcao} rotulo="Registrar" confirmacao="A mudança de situação fica registrada com quem, quando e por quê — e não pode ser desfeita.">
                            <input type="hidden" name="estornoId" value={e.id} />
                            <div className="grid grid-cols-2 gap-1.5">
                              <select name="para" aria-label="Nova situação" className="campo">
                                {e.status === 'A_COBRAR' ? <option value="EM_COBRANCA">em cobrança</option> : null}
                                <option value="QUITADO">quitado</option>
                                {podePerdoar ? <option value="PERDOADO">perdoado</option> : null}
                              </select>
                              <select name="forma" aria-label="Forma" className="campo" defaultValue="">
                                <option value="">forma…</option>
                                <option value="DESCONTO_EM_FOLHA">desconto em folha (manual)</option>
                                <option value="COBRANCA_A_PARTE">cobrança à parte</option>
                                <option value="PARCELAMENTO">parcelamento</option>
                              </select>
                              <input name="valor" aria-label="Valor recebido" placeholder="Valor (opcional)" className="campo numero" />
                              <input name="referencia" aria-label="Referência" placeholder="Referência" className="campo" />
                              <input name="motivo" aria-label="Motivo" placeholder="Motivo" className="campo col-span-2" required />
                            </div>
                          </FormularioAcao>
                        ) : e.movimentos[0] ? <span className="text-[11px] text-wr-texto-3">{e.movimentos[0].motivo}</span> : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}
    </Pagina>
  );
}
