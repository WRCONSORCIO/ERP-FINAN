import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatarDataHora } from '@/lib/datas';
import { formatarDocumento } from '@/lib/documento';
import { pode } from '@/lib/permissoes';
import { ROTULO_DESTINO, type Destino } from '@/dominio/comissao';
import { exigirPagina } from '@/servidor/sessao';
import { fichaDaCota } from '@/servidor/consultas/carteira';
import { Aviso, Campo, DataCurta, Dinheiro, EstadoVazio, Etiqueta, Pagina, Percentual, Secao, Traco } from '@/ui/base';
import { FormularioAcao } from '@/ui/formulario-acao';
import { MemoriaDeCalculo } from '@/ui/memoria';
import { ROTULO_COMISSAO, ROTULO_ESTORNO, TOM_COMISSAO, TOM_ESTORNO } from '@/ui/rotulos';
import { recongelarAcao, resolverDivergenciaAcao, transferirAcao } from '../acoes';

export const metadata: Metadata = { title: 'Ficha da cota' };
export const dynamic = 'force-dynamic';

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="mt-0.5 text-[13px] text-wr-texto">{children}</dd>
    </div>
  );
}

export default async function FichaCota({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirPagina('cotas');
  const { id } = await params;
  const f = await fichaDaCota(s, id);
  if (!f) notFound();
  const { cota } = f;
  const podeTransferir = pode(s.perfil, 'transferencias', 'editar');
  const vendedores = podeTransferir ? await prisma.vendedor.findMany({ where: { status: 'ATIVO' }, select: { id: true, nome: true, tipoDocumento: true, documento: true }, orderBy: { nome: 'asc' } }) : [];
  const nomeVendedor = (vid: string | null) => (vid ? f.vendedoresTransf.find((v) => v.id === vid)?.nome ?? vid : '—');

  return (
    <Pagina
      titulo={`${cota.clienteNome} · ${cota.grupo}/${cota.cota}`}
      descricao="A tela mais importante em auditoria: tudo o que esta venda gerou, e de onde saiu cada valor."
    >
      <Secao titulo="Venda">
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Item rotulo="Cliente">{cota.clienteNome}</Item>
          <Item rotulo="CPF/CNPJ"><span className="numero">{formatarDocumento(cota.cpfCliente)}</span></Item>
          <Item rotulo="Contrato"><span className="numero">{cota.contrato}</span></Item>
          <Item rotulo="Grupo / cota"><span className="numero">{cota.grupo}/{cota.cota}</span></Item>
          <Item rotulo="Administradora">{cota.administradora.nome}</Item>
          <Item rotulo="Crédito"><Dinheiro valor={cota.credito} forte /></Item>
          <Item rotulo="Data da venda"><DataCurta valor={cota.dataVenda} /></Item>
          <Item rotulo="Parcelas pagas"><span className="numero">{cota.parcelasPagas}</span></Item>
          <Item rotulo="Situação">{cota.cancelada ? <Etiqueta tom="vermelho">{cota.situacao}</Etiqueta> : <Etiqueta>{cota.situacao}</Etiqueta>}</Item>
          <Item rotulo="Cancelamento">{cota.dataCancelamento ? <><DataCurta valor={cota.dataCancelamento} /> <span className="block text-[11px] text-wr-texto-3">{cota.origemDataCancelamento}</span></> : <Traco />}</Item>
          <Item rotulo="Vendedor na importação">{cota.vendedorNomeImportado ?? <Traco />}{cota.vendedorDocImportado ? <span className="numero block text-[11px] text-wr-texto-3">{formatarDocumento(cota.vendedorDocImportado)}</span> : null}</Item>
          <Item rotulo="Contato">{cota.anonimizadaEm ? <Etiqueta>anonimizado</Etiqueta> : <>{cota.clienteEmail ?? <Traco />}{cota.clienteTelefone ? <span className="block">{cota.clienteTelefone}</span> : null}</>}</Item>
        </dl>
      </Secao>

      <Secao titulo="Congelado na venda" descricao={`Nada disto muda com o cadastro atual. Congelado em ${formatarDataHora(cota.snapCongeladoEm)} por ${cota.snapOrigem?.toLowerCase() ?? '—'}. Só importação (criação), transferência e recongelamento alteram este bloco.`}>
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Item rotulo="Vendedor">{cota.snapVendedor ? <Link href={`/vendedores/${cota.snapVendedor.pessoaId}`}>{cota.snapVendedor.pessoa.nome}</Link> : <Etiqueta tom="ambar">sem vendedor</Etiqueta>}{cota.snapVendedor ? <span className="numero block text-[11px] text-wr-texto-3">{cota.snapVendedor.tipoDocumento} {formatarDocumento(cota.snapVendedor.documento)}</span> : null}</Item>
          <Item rotulo="Categoria da venda">{cota.snapCategoria ? <>{cota.snapCategoria.nome}<span className="block text-[11px] text-wr-texto-3">paga pela WR: {cota.snapPagaPelaWr ? 'sim' : 'não'} · supervisão: {cota.snapGeraSupervisao ? 'sim' : 'não'} · gerência: {cota.snapGeraGerencia ? 'sim' : 'não'}</span></> : <Etiqueta tom="ambar">sem categoria</Etiqueta>}</Item>
          <Item rotulo="Segmento">{cota.snapSegmento?.nome ?? <Etiqueta tom="ambar">não reconhecido: {cota.segmentoTexto ?? 'vazio'}</Etiqueta>}</Item>
          <Item rotulo="Flex">{cota.snapModalidadeFlex ? <>{cota.snapModalidadeFlex.nome} · <Percentual valor={cota.snapModalidadeFlex.percentual} /></> : <Etiqueta tom="ambar">não reconhecido: {cota.flexTexto ?? 'vazio'}</Etiqueta>}</Item>
          <Item rotulo="Equipe / gerência">{cota.snapEquipe ? `${cota.snapEquipe.nome} · ${cota.snapGerencia?.nome ?? '—'}` : <Etiqueta tom="ambar">sem estrutura</Etiqueta>}</Item>
          <Item rotulo="Supervisor">{f.supervisor?.nome ?? <Traco />}</Item>
          <Item rotulo="Gerente">{f.gerente?.nome ?? <Traco />}</Item>
          <Item rotulo="Recuperação">{cota.snapRecuperacao ? <Etiqueta tom="ambar">venda feita em recuperação</Etiqueta> : 'não'}</Item>
        </dl>
        {pode(s.perfil, 'cotas', 'tudo') ? (
          <div className="mt-4 border-t border-wr-borda pt-3">
            <FormularioAcao acao={recongelarAcao} rotulo="Recongelar esta venda" perigo emLinha confirmacao="Recongelar resolve o snapshot pelo cadastro de HOJE, na data original da venda. Comissões que mudarem são canceladas e recriadas; as que já estão em folha fechada não mudam — a diferença vira ajuste.">
              <input type="hidden" name="cotaId" value={cota.id} />
              <input name="motivo" aria-label="Motivo" placeholder="Motivo do recongelamento" className="campo w-72" required />
            </FormularioAcao>
          </div>
        ) : null}
      </Secao>

      {cota.pendencias.length > 0 ? (
        <Aviso tom="ambar" titulo="Dinheiro não apurado nesta venda">
          <ul className="list-inside list-disc">{cota.pendencias.map((p) => <li key={p.id}>{p.descricao}</li>)}</ul>
        </Aviso>
      ) : null}

      {cota.divergencias.filter((d) => d.status === 'ABERTA').map((d) => (
        <Aviso key={d.id} tom="ambar" titulo="A administradora corrigiu o vendedor desta venda">
          <p>De <strong>{d.nomeAnterior ?? d.docAnterior ?? '—'}</strong> para <strong>{d.nomeNovo ?? d.docNovo ?? '—'}</strong> em {formatarDataHora(d.criadoEm)}. A venda continua com o vendedor atual até alguém decidir.</p>
          {podeTransferir ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <FormularioAcao acao={resolverDivergenciaAcao} rotulo="Aceitar correção" emLinha confirmacao="Aceitar transfere a venda ao novo vendedor (transferência registrada). Comissões já em folha não mudam — a diferença vira ajuste.">
                <input type="hidden" name="id" value={d.id} /><input type="hidden" name="decisao" value="ACEITAR" />
                <input name="observacao" aria-label="Observação" placeholder="Observação" className="campo w-56" />
              </FormularioAcao>
              <FormularioAcao acao={resolverDivergenciaAcao} rotulo="Manter vendedor atual" emLinha>
                <input type="hidden" name="id" value={d.id} /><input type="hidden" name="decisao" value="REJEITAR" />
                <input name="observacao" aria-label="Observação" placeholder="Por que manter" className="campo w-56" />
              </FormularioAcao>
            </div>
          ) : null}
        </Aviso>
      ))}

      <Secao titulo="Comissões" descricao="Cada linha é uma obrigação sobre uma parcela. Canceladas ficam como histórico (append-only). Clique em “De onde saiu” para a memória de cálculo." semPadding>
        {cota.comissoes.length === 0 ? <EstadoVazio titulo="Nenhuma comissão apurada">Veja as pendências acima, ou aguarde a fila de apuração.</EstadoVazio> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Destino</th><th className="direita">Parcela</th><th>Quem recebe</th><th className="direita">Base</th><th className="direita">%</th><th className="direita">Valor</th><th>Quem paga</th><th>Situação</th><th>Memória</th></tr></thead>
              <tbody>
                {cota.comissoes.map((c) => (
                  <tr key={c.id} className={c.status === 'CANCELADA' ? 'opacity-55' : ''}>
                    <td>{ROTULO_DESTINO[c.destino as Destino]}{c.ajusteDeId ? <> <Etiqueta tom="azul">ajuste</Etiqueta></> : null}</td>
                    <td className="direita numero">{c.parcela}ª</td>
                    <td>{c.titularPessoa.nome}{c.titularVendedor ? <span className="numero block text-[11px] text-wr-texto-3">{c.titularVendedor.tipoDocumento} {formatarDocumento(c.titularVendedor.documento)}</span> : null}</td>
                    <td className="direita"><Dinheiro valor={c.base} /></td>
                    <td className="direita"><Percentual valor={c.percentual} /></td>
                    <td className="direita"><Dinheiro valor={c.valor} forte tom={c.valor.isNegative() ? 'vermelho' : undefined} /></td>
                    <td>{c.pagaPelaWr ? 'WR' : <Etiqueta tom="azul" titulo="Calculada como base do estorno; a administradora paga direto">administradora</Etiqueta>}</td>
                    <td>
                      <Etiqueta tom={TOM_COMISSAO[c.status] ?? 'neutro'}>{ROTULO_COMISSAO[c.status]}</Etiqueta>
                      {c.status === 'CANCELADA' && c.motivoCancelamento ? <span className="block max-w-[220px] text-[11px] text-wr-texto-3">{c.motivoCancelamento}</span> : null}
                      {c.folha ? <span className="block text-[11px] text-wr-texto-3">folha {c.folha.competencia}</span> : null}
                    </td>
                    <td><MemoriaDeCalculo memoria={c.memoria} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="Estorno" descricao="Percentual pela data do cancelamento; base pela comissão da data da venda. Único por venda e destino — nunca cobrado duas vezes." semPadding>
        {cota.estornos.length === 0 ? <EstornoVazio cancelada={cota.cancelada} /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Destino</th><th>Tipo</th><th>Titular</th><th className="direita">Comissão base</th><th className="direita">%</th><th className="direita">Valor</th><th>Débito adm.</th><th>Situação</th><th>Memória</th></tr></thead>
              <tbody>
                {cota.estornos.map((e) => (
                  <tr key={e.id} className={e.status === 'INVALIDADO' ? 'opacity-55' : ''}>
                    <td>{ROTULO_DESTINO[e.destino as Destino]}</td>
                    <td>{e.tipo === 'RECUPERACAO' ? 'Recuperação' : 'Cancelamento'}</td>
                    <td>{e.titularPessoa?.nome ?? <Etiqueta tom="vermelho">SEM TITULAR</Etiqueta>}</td>
                    <td className="direita"><Dinheiro valor={e.comissaoBase} /></td>
                    <td className="direita"><Percentual valor={e.percentual} /></td>
                    <td className="direita"><Dinheiro valor={e.valor} forte tom="vermelho" /></td>
                    <td>{e.dataDebitoAdm ? <DataCurta valor={e.dataDebitoAdm} /> : <Traco />}</td>
                    <td>
                      <Etiqueta tom={TOM_ESTORNO[e.status] ?? 'neutro'}>{ROTULO_ESTORNO[e.status]}</Etiqueta>
                      {e.movimentos.filter((m) => m.de !== m.para).map((m) => <span key={m.id} className="block text-[11px] text-wr-texto-3">{formatarDataHora(m.criadoEm)}: {ROTULO_ESTORNO[m.para]} — {m.motivo}</span>)}
                    </td>
                    <td><MemoriaDeCalculo memoria={e.memoria} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="O que a administradora informou" descricao="Fatos importados (CV056E, CV069E, GC070A). É a administradora que informa quando a parcela foi recebida e quando o cancelamento foi debitado. Não existe tela de fechamento da administradora: o dado aparece aqui." semPadding>
        {cota.lancamentos.length + cota.comissoesAdm.length + cota.bonus.length === 0 ? <EstadoVazio titulo="Nenhum lançamento da administradora vinculado" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Relatório</th><th>Texto de origem</th><th className="direita">Parcela</th><th>Data</th><th className="direita">Valor</th></tr></thead>
              <tbody>
                {cota.lancamentos.map((l) => <tr key={l.id}><td>CV056E · {l.tipo === 'CANCELAMENTO' ? <Etiqueta tom="vermelho">cancelamento</Etiqueta> : l.tipo === 'OUTRO' ? <Etiqueta tom="ambar">fora dos tipos</Etiqueta> : 'comissão à WR'}</td><td>{l.tipoOrigemTexto}</td><td className="direita numero">{l.parcela ?? '—'}</td><td><DataCurta valor={l.dataReferencia} /></td><td className="direita"><Dinheiro valor={l.valor} /></td></tr>)}
                {cota.comissoesAdm.map((l) => <tr key={l.id}><td>CV069E · pago direto ao vendedor</td><td>{l.vendedorTexto ?? '—'}</td><td className="direita numero">{l.parcela ?? '—'}</td><td><DataCurta valor={l.dataReferencia} /></td><td className="direita"><Dinheiro valor={l.valor} /></td></tr>)}
                {cota.bonus.map((b) => <tr key={b.id}><td>GC070A · bônus à WR</td><td>{b.gerencia ? `atribuído à ${b.gerencia.nome}` : 'sem atribuição'}</td><td className="direita numero">{b.parcela ?? '—'}</td><td><DataCurta valor={b.dataReferencia} /></td><td className="direita"><Dinheiro valor={b.valorBonus} /></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="Transferências de responsabilidade" descricao="Reverter é transferência nova, nunca apagar.">
        {cota.transferencias.length === 0 ? <p className="text-[12px] text-wr-texto-3">Nenhuma transferência.</p> : (
          <ul className="mb-3 space-y-1 text-[13px]">
            {cota.transferencias.map((t) => <li key={t.id}>{formatarDataHora(t.criadoEm)}: {nomeVendedor(t.vendedorAnteriorId)} → <strong>{nomeVendedor(t.vendedorNovoId)}</strong> · {t.motivo} <Etiqueta>{t.origem === 'MANUAL' ? 'manual' : 'correção da administradora'}</Etiqueta></li>)}
          </ul>
        )}
        {podeTransferir ? (
          <FormularioAcao acao={transferirAcao} rotulo="Transferir venda" perigo confirmacao="O snapshot é recongelado com o novo vendedor, na data original da venda. Comissões não pagas são canceladas e recriadas; as já em folha fechada ficam, e a diferença vira ajuste. Bônus já atribuído não muda.">
            <input type="hidden" name="cotaId" value={cota.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo rotulo="Novo vendedor" nome="vendedorNovoId">
                <select id="vendedorNovoId" name="vendedorNovoId" className="campo">{vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome} · {v.tipoDocumento} {formatarDocumento(v.documento)}</option>)}</select>
              </Campo>
              <Campo rotulo="Motivo" nome="motivo-transf"><input id="motivo-transf" name="motivo" className="campo" required /></Campo>
            </div>
          </FormularioAcao>
        ) : null}
      </Secao>

      <Secao titulo="Versões e auditoria" descricao="Cada importação em que a venda mudou gera uma versão append-only. Nada se perde numa reimportação.">
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="space-y-1 text-[12px]">
            {cota.versoes.map((v) => (
              <li key={v.id}>
                <details><summary className="cursor-pointer">{formatarDataHora(v.criadoEm)} · {v.importacao?.nomeArquivo ?? 'origem desconhecida'}</summary>
                  <pre className="numero mt-1 max-h-60 overflow-auto rounded bg-wr-fundo p-2 text-[11px]">{JSON.stringify(v.dados, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
          <ul className="space-y-1 text-[12px]">
            {f.auditoria.length === 0 ? <li className="text-wr-texto-3">Nenhuma alteração manual registrada.</li> : f.auditoria.map((a) => (
              <li key={String(a.id)}>{formatarDataHora(a.criadoEm)} · <strong>{a.acao}</strong> · {a.usuario?.nome ?? a.email ?? 'sistema'}</li>
            ))}
          </ul>
        </div>
      </Secao>
    </Pagina>
  );
}

function EstornoVazio({ cancelada }: { cancelada: boolean }) {
  return <EstadoVazio titulo={cancelada ? 'Venda cancelada sem estorno' : 'Venda não cancelada'}>{cancelada ? 'O cancelamento não se enquadra no critério, os destinos não participam, ou há pendência acima.' : 'Estorno só existe quando a venda cai.'}</EstadoVazio>;
}
