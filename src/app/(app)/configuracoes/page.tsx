import type { Metadata } from 'next';
import Link from 'next/link';
import { somar, dec } from '@/lib/dinheiro';
import { hoje, vigenteEm } from '@/lib/datas';
import { pode } from '@/lib/permissoes';
import { descreverCriterio, ROTULO_ESCOPO, type Criterio, type EscopoBase } from '@/dominio/estorno';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { dadosDeConfiguracao } from '@/servidor/consultas/regras';
import { Aviso, Campo, DataCurta, Dinheiro, EstadoVazio, Etiqueta, Pagina, Percentual, Secao, Traco } from '@/ui/base';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import { FormularioComSimulacao } from '@/ui/formulario-simulacao';
import {
  abrirConfigEstornoAcao, abrirFlexAcao, abrirMetaAcao, abrirRegraEstornoAcao, abrirTabelaAcao, aliasesFlexAcao, aliasesSegmentoAcao, ativoCategoriaAcao,
  corrigirConfigEstornoAcao, corrigirFlexAcao, corrigirMetaAcao, corrigirRegraEstornoAcao, corrigirTabelaAcao, criarCategoriaAcao, criarSegmentoAcao,
  editarCategoriaAcao, editarSegmentoAcao, excluirCategoriaAcao, excluirSegmentoAcao, excluirVigenciaAcao, simularRegraEstornoAcao, simularTabelaAcao,
} from './acoes';
import type { EntidadeVigencia } from '@/servidor/servicos/vigencias';

export const metadata: Metadata = { title: 'Configurações' };
export const dynamic = 'force-dynamic';

const ABAS = [
  { id: 'categorias', rotulo: 'Categorias' },
  { id: 'comissoes', rotulo: 'Comissões' },
  { id: 'estornos', rotulo: 'Estornos' },
  { id: 'metas', rotulo: 'Metas' },
  { id: 'flex', rotulo: 'Flex e segmentos' },
] as const;

function Vig({ de, ate }: { de: Date; ate: Date | null }) {
  const d = hoje();
  return <span className="whitespace-nowrap"><DataCurta valor={de} /> → {ate ? <DataCurta valor={ate} /> : 'hoje'} {vigenteEm(d, de, ate) ? <Etiqueta tom="verde">em vigor</Etiqueta> : de > d ? <Etiqueta tom="ambar">futura</Etiqueta> : <Etiqueta>encerrada</Etiqueta>}</span>;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
type AcaoForm = React.ComponentProps<typeof FormularioAcao>['acao'];

/**
 * Corrigir ou excluir uma vigência. Só enquanto nenhum cálculo a usou: aí corrigir não reescreve o passado.
 * Usada, ela fica imutável e a mudança é uma vigência nova.
 */
function AcoesVigencia({ entidade, id, uso, de, ate, corrigir, children }: {
  entidade: EntidadeVigencia; id: string; uso: number; de: Date; ate: Date | null; corrigir: AcaoForm; children?: React.ReactNode;
}) {
  if (uso > 0) return <span className="text-[12px] text-wr-texto-3" title="Já foi usada em cálculos e não pode ser alterada. Para mudar daqui para frente, salve uma regra nova com a data da mudança.">usada em {uso} cálculo(s)</span>;
  return (
    <details className="min-w-[110px]">
      <summary className="cursor-pointer text-[12px] font-semibold text-wr-verde">Corrigir / excluir</summary>
      <div className="mt-2 min-w-[300px] space-y-3 rounded border border-wr-borda bg-wr-fundo p-3">
        <FormularioAcao acao={corrigir} rotulo="Salvar correção" confirmacao="Nenhum cálculo usou esta regra ainda, então a correção não altera nada já calculado. Fica registrada na auditoria.">
          <input type="hidden" name="id" value={id} />
          {children}
          <div className="grid gap-2 sm:grid-cols-2">
            <Campo rotulo="Vale a partir de" nome={`de-${id}`}><input id={`de-${id}`} name="vigenteDe" type="date" defaultValue={iso(de)} className="campo" required /></Campo>
            <Campo rotulo="Vale até (vazio = sem fim)" nome={`ate-${id}`}><input id={`ate-${id}`} name="vigenteAte" type="date" defaultValue={iso(ate)} className="campo" /></Campo>
          </div>
          <Campo rotulo="Motivo" nome={`motivo-${id}`}><input id={`motivo-${id}`} name="motivo" className="campo" required minLength={3} /></Campo>
        </FormularioAcao>
        <div className="border-t border-wr-borda pt-3">
          <FormularioAcao acao={excluirVigenciaAcao} rotulo="Excluir" perigo emLinha confirmacao="Exclui esta regra. Se ela tinha substituído uma regra anterior, a anterior volta a valer pelo período.">
            <input type="hidden" name="entidade" value={entidade} /><input type="hidden" name="id" value={id} />
            <input name="motivo" aria-label="Motivo da exclusão" placeholder="Motivo da exclusão" className="campo w-56" required minLength={3} />
          </FormularioAcao>
        </div>
      </div>
    </details>
  );
}

function CamposCategoria({ c }: { c?: { nome: string; descricao: string | null; ordem: number; documentosAceitos: string[]; pagaPelaWr: boolean; geraSupervisao: boolean; geraGerencia: boolean; contaParaPromocao: boolean } }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Campo rotulo="Nome" nome="nome"><input name="nome" defaultValue={c?.nome} className="campo" required /></Campo>
      <Campo rotulo="Posição na carreira (1 = primeira)" nome="ordem"><input name="ordem" type="number" min={0} defaultValue={c?.ordem ?? 1} className="campo" /></Campo>
      <Campo rotulo="Descrição" nome="descricao" className="lg:col-span-2"><input name="descricao" defaultValue={c?.descricao ?? ''} className="campo" /></Campo>
      <fieldset className="text-[13px]"><legend className="rotulo mb-1">Aceita vendedor com</legend>
        <label className="mr-3"><input type="checkbox" name="documentosAceitos" value="CPF" defaultChecked={c?.documentosAceitos.includes('CPF') ?? false} /> CPF</label>
        <label><input type="checkbox" name="documentosAceitos" value="CNPJ" defaultChecked={c?.documentosAceitos.includes('CNPJ') ?? false} /> CNPJ</label>
      </fieldset>
      <fieldset className="space-y-0.5 text-[13px] sm:col-span-2 lg:col-span-3"><legend className="rotulo mb-1">Como funciona a comissão nesta categoria</legend>
        <label className="block"><input type="checkbox" name="pagaPelaWr" value="true" defaultChecked={c?.pagaPelaWr ?? true} /> A WR paga a comissão do vendedor (desmarcado = a administradora paga direto; o valor continua calculado para o estorno)</label>
        <label className="block"><input type="checkbox" name="geraSupervisao" value="true" defaultChecked={c?.geraSupervisao ?? false} /> A venda gera comissão para o supervisor</label>
        <label className="block"><input type="checkbox" name="geraGerencia" value="true" defaultChecked={c?.geraGerencia ?? false} /> A venda gera comissão para o gerente</label>
        <label className="block"><input type="checkbox" name="contaParaPromocao" value="true" defaultChecked={c?.contaParaPromocao ?? true} /> As vendas contam para a meta de promoção</label>
      </fieldset>
    </div>
  );
}

export default async function Configuracoes({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('regras');
  const sp = await searchParams;
  const aba = ABAS.find((a) => a.id === param(sp, 'aba'))?.id ?? 'categorias';
  const d = await dadosDeConfiguracao(s);
  const editar = pode(s.perfil, 'regras', 'editar');
  const hojeISO = hoje().toISOString().slice(0, 10);
  const configAtual = d.configs.find((c) => vigenteEm(hoje(), c.vigenteDe, c.vigenteAte)) ?? d.configs[0] ?? null;
  const configSemEscopo = d.configs.filter((c) => c.escopoBase === null);
  const nomeParticipante = (codigo: string) =>
    codigo === 'SUPERVISAO' ? 'Supervisão' : codigo === 'GERENCIA' ? 'Gerência' : (d.categorias.find((c) => c.codigo === codigo)?.nome ?? codigo);
  const nomeQuemRecebe = (t: { destino: string; categoria: { nome: string } | null }) =>
    t.destino === 'VENDEDOR' ? `Vendedor ${t.categoria?.nome ?? ''}` : t.destino === 'SUPERVISAO' ? 'Supervisor' : 'Gerente';
  const regrasHoje = d.regras.filter((r) => vigenteEm(hoje(), r.vigenteDe, r.vigenteAte));
  const chavesPercentual = ['PADRAO', ...new Set([...(configAtual?.participantes ?? []), ...regrasHoje.filter((r) => r.participante).map((r) => r.participante as string)]),
    ...new Set(regrasHoje.filter((r) => r.titularVendedorId).map((r) => `v:${r.titularVendedorId}`))];
  const quadroPercentuais = chavesPercentual.map((chave) => {
    const daChave = regrasHoje.filter((r) => (chave === 'PADRAO' ? !r.participante && !r.titularVendedorId : chave.startsWith('v:') ? r.titularVendedorId === chave.slice(2) : r.participante === chave));
    const nome = chave === 'PADRAO' ? 'Todos (padrão)' : chave.startsWith('v:') ? `Vendedor: ${daChave[0]?.titularVendedor?.nome ?? ''}` : nomeParticipante(chave);
    return { chave, nome, valores: { CANCELAMENTO: daChave.find((r) => r.tipo === 'CANCELAMENTO')?.percentual ?? null, RECUPERACAO: daChave.find((r) => r.tipo === 'RECUPERACAO')?.percentual ?? null } };
  });

  return (
    <Pagina titulo="Configurações" descricao="As regras do dinheiro: comissões, estornos, metas e flex. Cada regra vale a partir de uma data, que pode ser passada; cada venda usa a regra da data dela e o que já foi calculado não muda. Enquanto uma regra não foi usada, dá para corrigir ou excluir.">
      <nav className="flex flex-wrap gap-1 border-b border-wr-borda" aria-label="Abas de configuração">
        {ABAS.map((a) => (
          <Link key={a.id} href={`/configuracoes?aba=${a.id}`} aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold no-underline ${aba === a.id ? 'border-wr-verde text-wr-verde' : 'border-transparent text-wr-texto-2 hover:text-wr-texto'}`}>
            {a.rotulo}
          </Link>
        ))}
      </nav>
      {configSemEscopo.length > 0 ? (
        <Aviso tom="ambar" titulo="Falta dizer sobre qual valor o estorno é calculado">Enquanto isso não for escolhido, nenhum estorno é calculado (as vendas canceladas ficam em pendência). <Link href="/configuracoes?aba=estornos">Escolher em Estornos</Link>.</Aviso>
      ) : null}

      {aba === 'categorias' ? (
        <>
          <Secao titulo="Categorias de vendedor" descricao="Cada vendedor tem uma categoria. Ela decide quem paga a comissão dele e se a venda também gera comissão para o supervisor e o gerente. Alterações valem para as vendas que chegarem depois. Categoria já usada não pode ser excluída, só desativada." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Categoria</th><th>Aceita</th><th>Quem paga o vendedor</th><th>Gera p/ supervisor</th><th>Gera p/ gerente</th><th>Conta p/ promoção</th><th className="direita">Usos</th><th>Situação</th>{editar ? <th>Ações</th> : null}</tr></thead>
                <tbody>
                  {d.categorias.map((c) => (
                    <tr key={c.id}>
                      <td className="font-semibold">{c.nome}<span className="numero block text-[11px] font-normal text-wr-texto-3">{c.codigo}</span></td><td>{c.documentosAceitos.join(' ou ')}</td>
                      <td>{c.pagaPelaWr ? 'WR' : <Etiqueta tom="azul">administradora</Etiqueta>}</td><td>{c.geraSupervisao ? 'sim' : 'não'}</td><td>{c.geraGerencia ? 'sim' : 'não'}</td><td>{c.contaParaPromocao ? 'sim' : 'não'}</td>
                      <td className="direita numero">{d.usos.get(c.id) ?? 0}</td>
                      <td>{c.ativo ? <Etiqueta tom="verde">ativa</Etiqueta> : <Etiqueta>desativada</Etiqueta>}</td>
                      {editar ? (
                        <td className="min-w-[320px]">
                          <details><summary className="cursor-pointer text-[12px] font-semibold text-wr-verde">Editar</summary>
                            <div className="mt-2">
                              <FormularioAcao acao={editarCategoriaAcao} rotulo="Salvar" confirmacao="Vale para as vendas que chegarem daqui em diante. As que já estão no sistema não mudam.">
                                <input type="hidden" name="id" value={c.id} />
                                <CamposCategoria c={c} />
                                <Campo rotulo="Motivo" nome="motivo"><input name="motivo" className="campo" required /></Campo>
                              </FormularioAcao>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-wr-borda pt-3">
                              <FormularioAcao acao={ativoCategoriaAcao} rotulo={c.ativo ? 'Desativar' : 'Reativar'} perigo={c.ativo} confirmacao={c.ativo ? 'Deixa de aparecer nos cadastros novos. O histórico fica.' : 'Volta a aparecer nos cadastros.'}>
                                <input type="hidden" name="id" value={c.id} />{c.ativo ? null : <input type="hidden" name="ativo" value="true" />}
                              </FormularioAcao>
                              {(d.usos.get(c.id) ?? 0) === 0 ? (
                                <FormularioAcao acao={excluirCategoriaAcao} rotulo="Excluir" perigo confirmacao="Nenhum vendedor ou venda usa esta categoria. Ela será excluída.">
                                  <input type="hidden" name="id" value={c.id} />
                                </FormularioAcao>
                              ) : null}
                            </div>
                          </details>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
          {editar ? (
            <Dobra chave="cfg-nova-categoria" titulo="Criar categoria">
              <div className="p-4">
                <FormularioAcao acao={criarCategoriaAcao} rotulo="Criar categoria">
                  <Campo rotulo="Código curto (não muda depois)" nome="codigo" ajuda="Ex.: SDR. Letras maiúsculas, números e _"><input name="codigo" className="campo w-48 uppercase" required /></Campo>
                  <CamposCategoria />
                </FormularioAcao>
                <p className="mt-2 text-[12px] text-wr-texto-3">Depois de criar, cadastre os percentuais dela na aba Comissões — sem isso, as vendas dela não geram comissão.</p>
              </div>
            </Dobra>
          ) : null}
        </>
      ) : null}

      {aba === 'comissoes' ? (
        <>
          <Aviso tom="azul" titulo="Como a comissão é calculada">
            Crédito × % da base do plano flex × % da parcela. Exemplo: crédito de R$ 100.000, Flex 30 (base de 70%) e 0,50% na 1ª parcela = R$ 100.000 × 70% × 0,50% = <strong>R$ 350,00</strong>. Sem flex (Integral), a base é o crédito cheio.
            A comissão de cada parcela é liberada quando o cliente paga aquela parcela. Parcela em branco não paga comissão.
          </Aviso>
          {d.segmentos.map((g) => {
            const linhas = d.tabelas.filter((t) => t.segmentoId === g.id && vigenteEm(hoje(), t.vigenteDe, t.vigenteAte));
            const nParcelas = Math.max(4, ...linhas.flatMap((t) => t.faixas.map((f) => f.parcela)));
            return (
              <Secao key={g.id} titulo={`${g.nome}: percentuais em vigor hoje`} semPadding>
                {linhas.length === 0 ? <EstadoVazio titulo="Nenhum percentual em vigor para este segmento" /> : (
                  <div className="tabela-quadro">
                    <table className="tabela">
                      <thead><tr><th>Quem recebe</th>{Array.from({ length: nParcelas }, (_, i) => <th key={i} className="direita">{i + 1}ª parcela</th>)}<th className="direita">Total</th><th>Desde</th></tr></thead>
                      <tbody>
                        {linhas.map((t) => (
                          <tr key={t.id}>
                            <td className="font-semibold">{nomeQuemRecebe(t)}{t.titularVendedor || t.titularPessoaId ? <span className="block text-[11px] font-normal text-wr-azul">só para {t.titularVendedor?.nome ?? d.pessoasTitulares.find((p) => p.id === t.titularPessoaId)?.nome}</span> : null}</td>
                            {Array.from({ length: nParcelas }, (_, i) => { const f = t.faixas.find((x) => x.parcela === i + 1); return <td key={i} className="direita">{f ? <Percentual valor={f.percentual} /> : <Traco />}</td>; })}
                            <td className="direita font-semibold"><Percentual valor={somar(t.faixas.map((f) => dec(f.percentual)))} /></td>
                            <td><DataCurta valor={t.vigenteDe} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Secao>
            );
          })}
          {editar ? (
            <Secao titulo="Definir percentuais" descricao="Preencha e salve. A data pode ser passada: o sistema encaixa no histórico. Vendas já calculadas não mudam; se a data mudaria alguma, o sistema avisa e não salva. Use “Simular impacto” para ver a diferença antes.">
              <FormularioComSimulacao salvar={abrirTabelaAcao} simular={simularTabelaAcao} confirmacao="Os percentuais valem para as vendas feitas a partir da data informada.">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo rotulo="Quem recebe" nome="quem">
                    <select id="quem" name="quem" className="campo">
                      <optgroup label="Vendedor da categoria">{d.categorias.map((c) => <option key={c.id} value={`V:${c.id}`}>Vendedor {c.nome}</option>)}</optgroup>
                      <option value="SUPERVISAO">Supervisor</option>
                      <option value="GERENCIA">Gerente</option>
                    </select>
                  </Campo>
                  <Campo rotulo="Segmento (tipo de bem)" nome="segmentoId"><select id="segmentoId" name="segmentoId" className="campo">{d.segmentos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></Campo>
                  <Campo rotulo="A partir de" nome="vigenteDe"><input id="vigenteDe" name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" required /></Campo>
                  <Campo rotulo="Só para uma pessoa (opcional)" nome="soPara" ajuda="Deixe “Todos” para a regra geral">
                    <select id="soPara" name="soPara" className="campo" defaultValue="">
                      <option value="">Todos</option>
                      <optgroup label="Vendedor">{d.vendedores.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.nome} · {v.tipoDocumento}</option>)}</optgroup>
                      <optgroup label="Supervisor / gerente">{d.pessoas.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.nome}</option>)}</optgroup>
                    </select>
                  </Campo>
                </div>
                <fieldset>
                  <legend className="rotulo mb-1">% de comissão em cada parcela (em branco = não paga)</legend>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
                      <label key={n} className="text-[11px] text-wr-texto-3">{n}ª parcela<input name={`p${n}`} inputMode="decimal" placeholder="—" className="campo numero mt-0.5" /></label>
                    ))}
                  </div>
                  <details className="mt-2 text-[12px]"><summary className="cursor-pointer font-semibold text-wr-verde">Mais parcelas (7ª a 12ª)</summary>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {Array.from({ length: 6 }, (_, i) => i + 7).map((n) => (
                        <label key={n} className="text-[11px] text-wr-texto-3">{n}ª parcela<input name={`p${n}`} inputMode="decimal" placeholder="—" className="campo numero mt-0.5" /></label>
                      ))}
                    </div>
                  </details>
                </fieldset>
                <Campo rotulo="Observação (opcional)" nome="observacao"><input id="observacao" name="observacao" className="campo" /></Campo>
              </FormularioComSimulacao>
            </Secao>
          ) : null}
          <Dobra chave="cfg-hist-tabelas" titulo={`Histórico completo dos percentuais (${d.tabelas.length})`}>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Quem recebe</th><th>Segmento</th>{[1, 2, 3, 4, 5, 6].map((n) => <th key={n} className="direita">{n}ª</th>)}<th className="direita">Total</th><th>Período</th>{editar ? <th>Ações</th> : null}</tr></thead>
                <tbody>
                  {d.tabelas.map((t) => (
                    <tr key={t.id}>
                      <td className="font-semibold">{nomeQuemRecebe(t)}{t.titularVendedor || t.titularPessoaId ? <span className="block text-[11px] font-normal text-wr-azul">só para {t.titularVendedor?.nome ?? d.pessoasTitulares.find((p) => p.id === t.titularPessoaId)?.nome}</span> : null}</td>
                      <td>{t.segmento.nome}</td>
                      {[1, 2, 3, 4, 5, 6].map((n) => { const f = t.faixas.find((x) => x.parcela === n); return <td key={n} className="direita">{f ? <Percentual valor={f.percentual} /> : <Traco />}</td>; })}
                      <td className="direita font-semibold"><Percentual valor={somar(t.faixas.map((f) => dec(f.percentual)))} /></td>
                      <td><Vig de={t.vigenteDe} ate={t.vigenteAte} /></td>
                      {editar ? (
                        <td>
                          <AcoesVigencia entidade="TABELA" id={t.id} uso={d.usosVigencia.get(t.id) ?? 0} de={t.vigenteDe} ate={t.vigenteAte} corrigir={corrigirTabelaAcao}>
                            <fieldset>
                              <legend className="rotulo mb-1">% por parcela (em branco = não paga)</legend>
                              <div className="grid grid-cols-4 gap-1">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                  <label key={n} className="text-[11px] text-wr-texto-3">{n}ª<input name={`p${n}`} inputMode="decimal" placeholder="—" defaultValue={t.faixas.find((f) => f.parcela === n)?.percentual.toString() ?? ''} className="campo numero mt-0.5" /></label>
                                ))}
                              </div>
                            </fieldset>
                            <Campo rotulo="Observação" nome={`obs-${t.id}`}><input id={`obs-${t.id}`} name="observacao" defaultValue={t.observacao ?? ''} className="campo" /></Campo>
                          </AcoesVigencia>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Dobra>
        </>
      ) : null}

      {aba === 'estornos' ? (
        <>
          <Secao titulo="1. Quando a venda cancelada gera estorno" descricao="As regras em vigor hoje, em linguagem simples.">
            {configAtual ? (
              <ul className="space-y-2 text-[14px]">
                <li><strong>Estorno de cancelamento:</strong> {configAtual.limiteParcelas === 0 ? 'desligado.' : <>quando a venda cancelar {descreverCriterio(configAtual.criterioCancelamento as Criterio, configAtual.limiteParcelas)}.</>}</li>
                <li><strong>Estorno de recuperação:</strong> quando uma venda feita em período de recuperação cancelar {descreverCriterio(configAtual.criterioRecuperacao as Criterio | null, configAtual.limiteRecuperacao)}.</li>
                <li><strong>Quem devolve:</strong> {configAtual.participantes.length ? configAtual.participantes.map(nomeParticipante).join(', ') : 'ninguém'}.</li>
                <li><strong>Calculado sobre:</strong> {configAtual.escopoBase ? <>a comissão das {ROTULO_ESCOPO[configAtual.escopoBase as EscopoBase]}.</> : <Etiqueta tom="ambar">ainda não definido — escolha abaixo</Etiqueta>}</li>
                <li className="text-[12px] text-wr-texto-3">Em vigor desde <DataCurta valor={configAtual.vigenteDe} />{configAtual.vigenteAte ? <> até <DataCurta valor={configAtual.vigenteAte} /></> : null}. Se a venda for de período de recuperação mas não se encaixar na regra de recuperação, vale a regra de cancelamento.</li>
              </ul>
            ) : <EstadoVazio titulo="Nenhuma regra de estorno cadastrada" />}
            {d.configs.filter((c) => c.vigenteDe > hoje()).reverse().map((c) => (
              <div key={c.id} className="mt-3"><Aviso tom="azul" titulo={`Agendada: a partir de ${c.vigenteDe.toISOString().slice(0, 10).split('-').reverse().join('/')}`}>
                Cancelamento {c.limiteParcelas === 0 ? 'desligado' : descreverCriterio(c.criterioCancelamento as Criterio, c.limiteParcelas)}; recuperação {descreverCriterio(c.criterioRecuperacao as Criterio | null, c.limiteRecuperacao)}; quem devolve: {c.participantes.map(nomeParticipante).join(', ')}.
              </Aviso></div>
            ))}
            {editar ? (
              <div className="mt-4 border-t border-wr-borda pt-4">
                <h3 className="mb-3 text-[13px] font-semibold">Alterar estas regras</h3>
                <FormularioAcao acao={abrirConfigEstornoAcao} rotulo="Salvar regras" confirmacao="As regras passam a valer a partir da data informada. O que já foi calculado não muda; se a data tirar a regra de um estorno já calculado, o sistema recusa e explica.">
                  <div className="space-y-3 text-[14px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span><strong>Cancelamento:</strong> gera estorno quando a venda cancelar com</span>
                      <select name="criterioCancelamento" aria-label="Critério do cancelamento" defaultValue={configAtual?.criterioCancelamento ?? 'IGUAL'} className="campo w-40"><option value="IGUAL">exatamente</option><option value="ABAIXO_DE">menos de</option></select>
                      <input name="limiteParcelas" aria-label="Parcelas do cancelamento" type="number" min={0} defaultValue={configAtual?.limiteParcelas ?? 1} className="campo w-20" />
                      <span>parcela(s) paga(s). <span className="text-[12px] text-wr-texto-3">(0 = desligado)</span></span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span><strong>Recuperação:</strong> gera estorno quando a venda do período de recuperação cancelar com</span>
                      <select name="criterioRecuperacao" aria-label="Critério da recuperação" defaultValue={configAtual?.criterioRecuperacao ?? ''} className="campo w-48"><option value="">qualquer quantidade de</option><option value="ABAIXO_DE">menos de</option><option value="IGUAL">exatamente</option></select>
                      <input name="limiteRecuperacao" aria-label="Parcelas da recuperação" type="number" min={1} defaultValue={configAtual?.limiteRecuperacao ?? ''} placeholder="nº" className="campo w-20" />
                      <span>parcela(s) paga(s).</span>
                    </div>
                    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1"><legend className="float-left mr-2"><strong>Quem devolve:</strong></legend>
                      {d.categorias.map((c) => <label key={c.id} className="inline-flex items-center gap-1"><input type="checkbox" name="participantes" value={c.codigo} defaultChecked={configAtual?.participantes.includes(c.codigo) ?? false} /> {c.nome}</label>)}
                      <label className="inline-flex items-center gap-1"><input type="checkbox" name="participantes" value="SUPERVISAO" defaultChecked={configAtual?.participantes.includes('SUPERVISAO') ?? false} /> Supervisão</label>
                      <label className="inline-flex items-center gap-1"><input type="checkbox" name="participantes" value="GERENCIA" defaultChecked={configAtual?.participantes.includes('GERENCIA') ?? false} /> Gerência</label>
                    </fieldset>
                    <div className="flex flex-wrap items-center gap-2">
                      <span><strong>Calcular sobre</strong> a comissão das</span>
                      <select name="escopoBase" aria-label="Base do estorno" defaultValue={configAtual?.escopoBase ?? 'PARCELAS_RECEBIDAS'} className="campo w-60">{(Object.keys(ROTULO_ESCOPO) as EscopoBase[]).map((e) => <option key={e} value={e}>{ROTULO_ESCOPO[e]}</option>)}</select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span><strong>Valendo a partir de</strong></span>
                      <input name="vigenteDe" aria-label="Valendo a partir de" type="date" defaultValue={configAtual ? iso(configAtual.vigenteDe) : hojeISO} className="campo w-44" required />
                      <span className="text-[12px] text-wr-texto-3">Pode ser data passada. Mantendo a data atual ({configAtual ? <DataCurta valor={configAtual.vigenteDe} /> : '—'}), a regra em vigor é substituída enquanto não tiver sido usada.</span>
                    </div>
                  </div>
                </FormularioAcao>
              </div>
            ) : null}
          </Secao>
          <Dobra chave="cfg-hist-config-estorno" titulo={`Histórico das regras de estorno (${d.configs.length})`}>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Período</th><th>Cancelamento</th><th>Recuperação</th><th>Quem devolve</th><th>Calculado sobre</th>{editar ? <th>Ações</th> : null}</tr></thead>
                <tbody>{d.configs.map((c) => (
                  <tr key={c.id}>
                    <td><Vig de={c.vigenteDe} ate={c.vigenteAte} /></td>
                    <td>{c.limiteParcelas === 0 ? 'desligado' : descreverCriterio(c.criterioCancelamento as Criterio, c.limiteParcelas)}</td>
                    <td>{descreverCriterio(c.criterioRecuperacao as Criterio | null, c.limiteRecuperacao)}</td>
                    <td>{c.participantes.map(nomeParticipante).join(', ')}</td>
                    <td>{c.escopoBase ? ROTULO_ESCOPO[c.escopoBase as EscopoBase] : <Etiqueta tom="ambar">não definido</Etiqueta>}</td>
                    {editar ? (
                      <td>
                        <AcoesVigencia entidade="CONFIG_ESTORNO" id={c.id} uso={d.usosVigencia.get(c.id) ?? 0} de={c.vigenteDe} ate={c.vigenteAte} corrigir={corrigirConfigEstornoAcao}>
                          <fieldset className="text-[13px]"><legend className="rotulo mb-1">Quem devolve</legend>
                            {d.categorias.map((cat) => <label key={cat.id} className="mr-3 inline-block"><input type="checkbox" name="participantes" value={cat.codigo} defaultChecked={c.participantes.includes(cat.codigo)} /> {cat.nome}</label>)}
                            <label className="mr-3 inline-block"><input type="checkbox" name="participantes" value="SUPERVISAO" defaultChecked={c.participantes.includes('SUPERVISAO')} /> Supervisão</label>
                            <label className="inline-block"><input type="checkbox" name="participantes" value="GERENCIA" defaultChecked={c.participantes.includes('GERENCIA')} /> Gerência</label>
                          </fieldset>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Campo rotulo="Cancelamento: critério" nome={`crit-${c.id}`}><select id={`crit-${c.id}`} name="criterioCancelamento" defaultValue={c.criterioCancelamento} className="campo"><option value="IGUAL">exatamente</option><option value="ABAIXO_DE">menos de</option></select></Campo>
                            <Campo rotulo="Cancelamento: parcelas pagas (0 = desligado)" nome={`lim-${c.id}`}><input id={`lim-${c.id}`} name="limiteParcelas" type="number" min={0} defaultValue={c.limiteParcelas} className="campo" /></Campo>
                            <Campo rotulo="Recuperação: critério" nome={`rcrit-${c.id}`}><select id={`rcrit-${c.id}`} name="criterioRecuperacao" defaultValue={c.criterioRecuperacao ?? ''} className="campo"><option value="">qualquer quantidade</option><option value="ABAIXO_DE">menos de</option><option value="IGUAL">exatamente</option></select></Campo>
                            <Campo rotulo="Recuperação: parcelas pagas" nome={`rlim-${c.id}`}><input id={`rlim-${c.id}`} name="limiteRecuperacao" type="number" min={1} defaultValue={c.limiteRecuperacao ?? ''} className="campo" /></Campo>
                            <Campo rotulo="Calculado sobre" nome={`esc-${c.id}`}><select id={`esc-${c.id}`} name="escopoBase" defaultValue={c.escopoBase ?? ''} className="campo"><option value="">não definido</option>{(Object.keys(ROTULO_ESCOPO) as EscopoBase[]).map((e) => <option key={e} value={e}>{ROTULO_ESCOPO[e]}</option>)}</select></Campo>
                          </div>
                        </AcoesVigencia>
                      </td>
                    ) : null}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Dobra>

          <Secao titulo="2. Quanto cada um devolve" descricao="Percentual da comissão devolvido no estorno, em vigor hoje. Quem não tem percentual próprio usa o padrão. O percentual aplicado é o que valia na data do cancelamento.">
            <div className="tabela-quadro -mx-4 -mt-4 mb-4">
              <table className="tabela">
                <thead><tr><th>Quem</th><th className="direita">Cancelamento</th><th className="direita">Recuperação</th></tr></thead>
                <tbody>{quadroPercentuais.map((q) => (
                  <tr key={q.chave}>
                    <td className={q.chave === 'PADRAO' ? 'font-semibold' : ''}>{q.nome}</td>
                    {(['CANCELAMENTO', 'RECUPERACAO'] as const).map((t) => {
                      const proprio = q.valores[t];
                      const padrao = quadroPercentuais[0]?.valores[t];
                      return <td key={t} className="direita">{proprio ? <Percentual valor={proprio} /> : padrao ? <span className="text-wr-texto-3">padrão (<Percentual valor={padrao} />)</span> : <Etiqueta tom="ambar">sem percentual</Etiqueta>}</td>;
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {editar ? (
              <>
                <h3 className="mb-3 text-[13px] font-semibold">Definir um percentual</h3>
                <FormularioComSimulacao salvar={abrirRegraEstornoAcao} simular={simularRegraEstornoAcao} confirmacao="O percentual vale para cancelamentos a partir da data informada. Estornos já calculados não mudam.">
                  <div className="flex flex-wrap items-center gap-2 text-[14px]">
                    <select name="paraQuem" aria-label="Para quem" defaultValue="PADRAO" className="campo w-56">
                      <option value="PADRAO">Todos (padrão)</option>
                      <optgroup label="Categoria">{d.categorias.map((c) => <option key={c.id} value={c.codigo}>{c.nome}</option>)}<option value="SUPERVISAO">Supervisão</option><option value="GERENCIA">Gerência</option></optgroup>
                      <optgroup label="Vendedor específico">{d.vendedores.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.nome} · {v.tipoDocumento}</option>)}</optgroup>
                    </select>
                    <span>devolve</span>
                    <input name="percentual" aria-label="Percentual" inputMode="decimal" placeholder="0" className="campo numero w-20" required />
                    <span>% da comissão no estorno de</span>
                    <select name="tipo" aria-label="Tipo de estorno" className="campo w-40"><option value="CANCELAMENTO">cancelamento</option><option value="RECUPERACAO">recuperação</option></select>
                    <span>a partir de</span>
                    <input name="vigenteDe" aria-label="A partir de" type="date" defaultValue={hojeISO} className="campo w-44" required />
                  </div>
                  <p className="text-[12px] text-wr-texto-3">A data pode ser passada: o sistema encaixa o percentual no histórico (termina na véspera do seguinte, se houver). Mesma data de um percentual ainda não usado = substitui.</p>
                </FormularioComSimulacao>
              </>
            ) : null}
          </Secao>
          <Dobra chave="cfg-hist-regra-estorno" titulo={`Histórico dos percentuais (${d.regras.length})`}>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Quem</th><th>Tipo</th><th className="direita">Percentual</th><th>Período</th>{editar ? <th>Ações</th> : null}</tr></thead>
                <tbody>{d.regras.map((r) => (
                  <tr key={r.id}>
                    <td>{r.titularVendedor ? <>Vendedor: {r.titularVendedor.nome}</> : r.participante ? nomeParticipante(r.participante) : 'Todos (padrão)'}</td>
                    <td>{r.tipo === 'RECUPERACAO' ? 'Recuperação' : 'Cancelamento'}</td>
                    <td className="direita"><Percentual valor={r.percentual} /></td>
                    <td><Vig de={r.vigenteDe} ate={r.vigenteAte} /></td>
                    {editar ? (
                      <td>
                        <AcoesVigencia entidade="REGRA_ESTORNO" id={r.id} uso={d.usosVigencia.get(r.id) ?? 0} de={r.vigenteDe} ate={r.vigenteAte} corrigir={corrigirRegraEstornoAcao}>
                          <Campo rotulo="Percentual (%)" nome={`pct-${r.id}`}><input id={`pct-${r.id}`} name="percentual" inputMode="decimal" defaultValue={r.percentual.toString()} className="campo numero" required /></Campo>
                        </AcoesVigencia>
                      </td>
                    ) : null}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Dobra>
        </>
      ) : null}

      {aba === 'metas' ? (
        <>
          <Secao titulo="Metas de promoção" descricao="Quanto a pessoa precisa vender (soma do crédito de todas as vendas) para subir de categoria. O sistema avisa quando está perto e quando atinge; a promoção é feita na ficha do vendedor." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Promoção</th><th className="direita">Precisa vender</th><th className="direita">Avisar quando faltar</th><th>Ao promover, passa a usar</th><th>Período</th>{editar ? <th>Ações</th> : null}</tr></thead>
                <tbody>{d.metas.map((m) => <tr key={m.id}><td className="font-semibold">{m.categoriaOrigem.nome} → {m.categoriaAlvo.nome}</td><td className="direita"><Dinheiro valor={m.volumeMinimo} /></td><td className="direita"><Dinheiro valor={m.alertaAoFaltar} /></td><td>{m.documentoExigido ?? <Traco />}</td><td><Vig de={m.vigenteDe} ate={m.vigenteAte} /></td>
                  {editar ? (
                    <td>
                      <AcoesVigencia entidade="META" id={m.id} uso={0} de={m.vigenteDe} ate={m.vigenteAte} corrigir={corrigirMetaAcao}>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Campo rotulo="Para" nome={`alvo-${m.id}`}><select id={`alvo-${m.id}`} name="categoriaAlvoId" defaultValue={m.categoriaAlvoId} className="campo">{d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
                          <Campo rotulo="Abre documento" nome={`doc-${m.id}`}><select id={`doc-${m.id}`} name="documentoExigido" defaultValue={m.documentoExigido ?? ''} className="campo"><option value="">—</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select></Campo>
                          <Campo rotulo="Volume mínimo (R$)" nome={`vol-${m.id}`}><input id={`vol-${m.id}`} name="volumeMinimo" inputMode="decimal" defaultValue={m.volumeMinimo.toFixed(2).replace('.', ',')} className="campo numero" required /></Campo>
                          <Campo rotulo="Alerta ao faltar (R$)" nome={`al-${m.id}`}><input id={`al-${m.id}`} name="alertaAoFaltar" inputMode="decimal" defaultValue={m.alertaAoFaltar.toFixed(2).replace('.', ',')} className="campo numero" required /></Campo>
                        </div>
                      </AcoesVigencia>
                    </td>
                  ) : null}
                </tr>)}</tbody>
              </table>
            </div>
          </Secao>
          {editar ? (
            <Secao titulo="Definir meta" descricao="A data pode ser passada. Quem já foi promovido não é afetado.">
              <FormularioAcao acao={abrirMetaAcao} rotulo="Salvar meta" confirmacao="A meta vale a partir da data informada.">
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Campo rotulo="Para sair de" nome="categoriaOrigemId"><select id="categoriaOrigemId" name="categoriaOrigemId" className="campo">{d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
                  <Campo rotulo="E ir para" nome="categoriaAlvoId"><select id="categoriaAlvoId" name="categoriaAlvoId" className="campo">{d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
                  <Campo rotulo="Precisa vender (R$)" nome="volumeMinimo"><input id="volumeMinimo" name="volumeMinimo" inputMode="decimal" className="campo numero" required /></Campo>
                  <Campo rotulo="Avisar quando faltar (R$)" nome="alertaAoFaltar"><input id="alertaAoFaltar" name="alertaAoFaltar" inputMode="decimal" className="campo numero" required /></Campo>
                  <Campo rotulo="Ao promover, passa a usar" nome="documentoExigido"><select id="documentoExigido" name="documentoExigido" className="campo" defaultValue=""><option value="">—</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select></Campo>
                  <Campo rotulo="A partir de" nome="vigenteDe-m"><input id="vigenteDe-m" name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" /></Campo>
                </div>
              </FormularioAcao>
            </Secao>
          ) : null}
        </>
      ) : null}

      {aba === 'flex' ? (
        <>
          <Secao titulo="Planos flex" descricao="O flex reduz o valor sobre o qual a comissão é calculada: Flex 10 = comissão sobre 90% do crédito, Flex 30 = sobre 70%, e assim por diante. Venda sem flex no arquivo = Integral (crédito cheio). Não diminui a produção que conta para promoção. “Nomes no arquivo” = como o plano aparece na base de clientes." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Código</th><th>Nome</th><th className="direita">Comissão calculada sobre</th><th>Período</th><th>Nomes no arquivo</th>{editar ? <th>Ações</th> : null}</tr></thead>
                <tbody>{d.flex.map((f) => (
                  <tr key={f.id}>
                    <td className="numero font-semibold">{f.codigo}</td><td>{f.nome}</td><td className="direita"><Percentual valor={f.percentual} /></td><td><Vig de={f.vigenteDe} ate={f.vigenteAte} /></td>
                    <td className="min-w-[280px]">
                      {editar ? (
                        <FormularioAcao acao={aliasesFlexAcao} rotulo="Salvar" emLinha>
                          <input type="hidden" name="id" value={f.id} /><input name="aliases" aria-label="Nomes no arquivo" defaultValue={f.aliases.join(', ')} className="campo w-64 text-[12px]" />
                        </FormularioAcao>
                      ) : f.aliases.join(', ')}
                    </td>
                    {editar ? (
                      <td>
                        <AcoesVigencia entidade="FLEX" id={f.id} uso={d.usosVigencia.get(f.id) ?? 0} de={f.vigenteDe} ate={f.vigenteAte} corrigir={corrigirFlexAcao}>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Campo rotulo="Nome" nome={`fn-${f.id}`}><input id={`fn-${f.id}`} name="nome" defaultValue={f.nome} className="campo" required /></Campo>
                            <Campo rotulo="Comissão sobre (% do crédito)" nome={`fp-${f.id}`}><input id={`fp-${f.id}`} name="percentual" inputMode="decimal" defaultValue={f.percentual.toString()} className="campo numero" required /></Campo>
                          </div>
                        </AcoesVigencia>
                      </td>
                    ) : null}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Secao>
          {editar ? (
            <Dobra chave="cfg-novo-flex" titulo="Criar plano flex ou mudar o percentual de um">
              <div className="p-4">
                <FormularioAcao acao={abrirFlexAcao} rotulo="Salvar" confirmacao="Vale para as vendas a partir da data informada (pode ser passada). Use o mesmo código para mudar um plano que já existe.">
                  <div className="grid gap-2 sm:grid-cols-5">
                    <Campo rotulo="Código" nome="codigo-f"><input id="codigo-f" name="codigo" className="campo uppercase" required /></Campo>
                    <Campo rotulo="Nome" nome="nome-f"><input id="nome-f" name="nome" className="campo" required /></Campo>
                    <Campo rotulo="Comissão sobre (% do crédito)" nome="percentual-f"><input id="percentual-f" name="percentual" inputMode="decimal" className="campo numero" required /></Campo>
                    <Campo rotulo="Nomes no arquivo (separe por vírgula)" nome="aliases-f"><input id="aliases-f" name="aliases" className="campo" /></Campo>
                    <Campo rotulo="A partir de" nome="vigenteDe-f"><input id="vigenteDe-f" name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" /></Campo>
                  </div>
                </FormularioAcao>
              </div>
            </Dobra>
          ) : null}
          <Secao titulo="Segmentos (tipo de bem)" descricao="Cada segmento tem seus percentuais de comissão. “Nomes no arquivo” = como o segmento aparece na base de clientes." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Código</th><th>Nome</th><th>Situação</th><th>Nomes no arquivo</th>{editar ? <th>Ações</th> : null}</tr></thead>
                <tbody>{d.segmentos.map((g) => (
                  <tr key={g.id}><td className="numero font-semibold">{g.codigo}</td><td>{g.nome}</td><td>{g.ativo ? <Etiqueta tom="verde">ativo</Etiqueta> : <Etiqueta>desativado</Etiqueta>}</td>
                    <td className="min-w-[320px]">{editar ? <FormularioAcao acao={aliasesSegmentoAcao} rotulo="Salvar" emLinha><input type="hidden" name="id" value={g.id} /><input name="aliases" aria-label="Nomes no arquivo" defaultValue={g.aliases.join(', ')} className="campo w-80 text-[12px]" /></FormularioAcao> : g.aliases.join(', ')}</td>
                    {editar ? (
                      <td>
                        <details className="min-w-[110px]"><summary className="cursor-pointer text-[12px] font-semibold text-wr-verde">Editar</summary>
                          <div className="mt-2 min-w-[280px] space-y-3 rounded border border-wr-borda bg-wr-fundo p-3">
                            <FormularioAcao acao={editarSegmentoAcao} rotulo="Salvar">
                              <input type="hidden" name="id" value={g.id} />
                              <Campo rotulo="Nome" nome={`sn-${g.id}`}><input id={`sn-${g.id}`} name="nome" defaultValue={g.nome} className="campo" required /></Campo>
                              <label className="block text-[13px]"><input type="checkbox" name="ativo" value="true" defaultChecked={g.ativo} /> Ativo</label>
                              <Campo rotulo="Motivo" nome={`sm-${g.id}`}><input id={`sm-${g.id}`} name="motivo" className="campo" required minLength={3} /></Campo>
                            </FormularioAcao>
                            {(d.usosSegmento.get(g.id) ?? 0) === 0 ? (
                              <FormularioAcao acao={excluirSegmentoAcao} rotulo="Excluir segmento" perigo emLinha confirmacao="O segmento não é usado por nenhuma tabela nem venda e será excluído.">
                                <input type="hidden" name="id" value={g.id} />
                                <input name="motivo" aria-label="Motivo da exclusão" placeholder="Motivo" className="campo w-48" required minLength={3} />
                              </FormularioAcao>
                            ) : <p className="text-[12px] text-wr-texto-3">Em uso em {d.usosSegmento.get(g.id)} registro(s): desative em vez de excluir.</p>}
                          </div>
                        </details>
                      </td>
                    ) : null}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {editar ? (
              <div className="border-t border-wr-borda p-4">
                <FormularioAcao acao={criarSegmentoAcao} rotulo="Criar segmento" emLinha>
                  <input name="codigo" aria-label="Código" placeholder="CÓDIGO" className="campo w-32 uppercase" required />
                  <input name="nome" aria-label="Nome" placeholder="Nome" className="campo w-40" required />
                  <input name="aliases" aria-label="Nomes no arquivo" placeholder="Nomes no arquivo (vírgula)" className="campo w-64" />
                </FormularioAcao>
              </div>
            ) : null}
          </Secao>
        </>
      ) : null}
    </Pagina>
  );
}
