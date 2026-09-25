import type { Metadata } from 'next';
import Link from 'next/link';
import { somar, dec } from '@/lib/dinheiro';
import { hoje, vigenteEm } from '@/lib/datas';
import { pode } from '@/lib/permissoes';
import { ROTULO_DESTINO, type Destino } from '@/dominio/comissao';
import { ROTULO_ESCOPO, type EscopoBase } from '@/dominio/estorno';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { dadosDeConfiguracao } from '@/servidor/consultas/regras';
import { Aviso, Campo, DataCurta, Dinheiro, EstadoVazio, Etiqueta, Pagina, Percentual, Secao, Traco } from '@/ui/base';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import { FormularioComSimulacao } from '@/ui/formulario-simulacao';
import {
  abrirConfigEstornoAcao, abrirFlexAcao, abrirMetaAcao, abrirRegraEstornoAcao, abrirTabelaAcao, aliasesFlexAcao, aliasesSegmentoAcao, ativoCategoriaAcao,
  criarCategoriaAcao, criarSegmentoAcao, definirEscopoAcao, editarCategoriaAcao, excluirCategoriaAcao, simularRegraEstornoAcao, simularTabelaAcao,
} from './acoes';

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
  return <span className="whitespace-nowrap"><DataCurta valor={de} /> → {ate ? <DataCurta valor={ate} /> : 'aberta'} {vigenteEm(d, de, ate) ? <Etiqueta tom="verde">vigente</Etiqueta> : de > d ? <Etiqueta tom="ambar">futura</Etiqueta> : <Etiqueta>encerrada</Etiqueta>}</span>;
}

function CamposCategoria({ c }: { c?: { nome: string; descricao: string | null; ordem: number; documentosAceitos: string[]; pagaPelaWr: boolean; geraSupervisao: boolean; geraGerencia: boolean; contaParaPromocao: boolean } }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Campo rotulo="Nome" nome="nome"><input name="nome" defaultValue={c?.nome} className="campo" required /></Campo>
      <Campo rotulo="Ordem (degrau)" nome="ordem"><input name="ordem" type="number" min={0} defaultValue={c?.ordem ?? 1} className="campo" /></Campo>
      <Campo rotulo="Descrição" nome="descricao" className="lg:col-span-2"><input name="descricao" defaultValue={c?.descricao ?? ''} className="campo" /></Campo>
      <fieldset className="text-[13px]"><legend className="rotulo mb-1">Documentos aceitos</legend>
        <label className="mr-3"><input type="checkbox" name="documentosAceitos" value="CPF" defaultChecked={c?.documentosAceitos.includes('CPF') ?? false} /> CPF</label>
        <label><input type="checkbox" name="documentosAceitos" value="CNPJ" defaultChecked={c?.documentosAceitos.includes('CNPJ') ?? false} /> CNPJ</label>
      </fieldset>
      <fieldset className="space-y-0.5 text-[13px] sm:col-span-2 lg:col-span-3"><legend className="rotulo mb-1">O que a categoria decide</legend>
        <label className="block"><input type="checkbox" name="pagaPelaWr" value="true" defaultChecked={c?.pagaPelaWr ?? true} /> Paga pela WR (falso = a administradora paga direto; o percentual continua calculado como base do estorno)</label>
        <label className="block"><input type="checkbox" name="geraSupervisao" value="true" defaultChecked={c?.geraSupervisao ?? false} /> Gera comissão de supervisão</label>
        <label className="block"><input type="checkbox" name="geraGerencia" value="true" defaultChecked={c?.geraGerencia ?? false} /> Gera comissão de gerência</label>
        <label className="block"><input type="checkbox" name="contaParaPromocao" value="true" defaultChecked={c?.contaParaPromocao ?? true} /> Conta para promoção</label>
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

  return (
    <Pagina titulo="Configurações" descricao="Percentuais, metas, critérios de estorno e categorias são cadastro com vigência. Toda alteração abre vigência nova e não reescreve o passado: a regra é resolvida pela data do fato.">
      <nav className="flex flex-wrap gap-1 border-b border-wr-borda" aria-label="Abas de configuração">
        {ABAS.map((a) => (
          <Link key={a.id} href={`/configuracoes?aba=${a.id}`} aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold no-underline ${aba === a.id ? 'border-wr-verde text-wr-verde' : 'border-transparent text-wr-texto-2 hover:text-wr-texto'}`}>
            {a.rotulo}
          </Link>
        ))}
      </nav>
      {configSemEscopo.length > 0 ? (
        <Aviso tom="ambar" titulo="Escopo da base do estorno não definido">A especificação não informa o padrão inicial. Enquanto não for definido, o estorno das vendas canceladas fica em pendência. <Link href="/configuracoes?aba=estornos">Definir em Estornos</Link>.</Aviso>
      ) : null}

      {aba === 'categorias' ? (
        <>
          <Secao titulo="Categorias" descricao="O código é a chave que as vendas gravadas carregam e nunca muda. Nome e comportamento futuro podem ser editados. Categoria que já explica alguma coisa não se apaga — desativa." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Código</th><th>Nome</th><th>Docs</th><th>Paga pela WR</th><th>Supervisão</th><th>Gerência</th><th>Promoção</th><th className="direita">Em uso</th><th>Situação</th>{editar ? <th>Ações</th> : null}</tr></thead>
                <tbody>
                  {d.categorias.map((c) => (
                    <tr key={c.id}>
                      <td className="numero font-semibold">{c.codigo}</td><td>{c.nome}</td><td>{c.documentosAceitos.join('/')}</td>
                      <td>{c.pagaPelaWr ? 'sim' : <Etiqueta tom="azul">administradora</Etiqueta>}</td><td>{c.geraSupervisao ? 'sim' : 'não'}</td><td>{c.geraGerencia ? 'sim' : 'não'}</td><td>{c.contaParaPromocao ? 'sim' : 'não'}</td>
                      <td className="direita numero">{d.usos.get(c.id) ?? 0}</td>
                      <td>{c.ativo ? <Etiqueta tom="verde">ativa</Etiqueta> : <Etiqueta>desativada</Etiqueta>}</td>
                      {editar ? (
                        <td className="min-w-[320px]">
                          <details><summary className="cursor-pointer text-[12px] font-semibold text-wr-verde">Editar</summary>
                            <div className="mt-2">
                              <FormularioAcao acao={editarCategoriaAcao} rotulo="Salvar" confirmacao="Vale para vendas importadas daqui em diante; as já importadas guardam o comportamento congelado.">
                                <input type="hidden" name="id" value={c.id} />
                                <CamposCategoria c={c} />
                                <Campo rotulo="Motivo" nome="motivo"><input name="motivo" className="campo" required /></Campo>
                              </FormularioAcao>
                            </div>
                          </details>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <FormularioAcao acao={ativoCategoriaAcao} rotulo={c.ativo ? 'Desativar' : 'Reativar'} perigo={c.ativo} confirmacao={c.ativo ? 'Deixa de ser oferecida em cadastros novos. Histórico preservado.' : 'Volta a ser oferecida.'}>
                              <input type="hidden" name="id" value={c.id} />{c.ativo ? null : <input type="hidden" name="ativo" value="true" />}
                            </FormularioAcao>
                            {(d.usos.get(c.id) ?? 0) === 0 ? (
                              <FormularioAcao acao={excluirCategoriaAcao} rotulo="Excluir" perigo confirmacao="A categoria não explica nenhum registro e será excluída.">
                                <input type="hidden" name="id" value={c.id} />
                              </FormularioAcao>
                            ) : null}
                          </div>
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
                  <Campo rotulo="Código (imutável)" nome="codigo" ajuda="Ex.: SDR. Letras maiúsculas, números e _"><input name="codigo" className="campo w-48 uppercase" required /></Campo>
                  <CamposCategoria />
                </FormularioAcao>
                <p className="mt-2 text-[12px] text-wr-texto-3">Categoria nova precisa de tabela de comissão própria (aba Comissões) — sem tabela, a venda vira pendência.</p>
              </div>
            </Dobra>
          ) : null}
        </>
      ) : null}

      {aba === 'comissoes' ? (
        <>
          <Secao titulo="Percentuais por destino × segmento × parcela" descricao="base = crédito × flex; valor = base × percentual da parcela. Parcela sem faixa não paga nada. Titular preenchido = exceção individual, que vence a regra padrão." semPadding>
            {d.tabelas.length === 0 ? <EstadoVazio titulo="Nenhuma tabela cadastrada" /> : (
              <div className="tabela-quadro">
                <table className="tabela">
                  <thead><tr><th>Destino</th><th>Segmento</th><th>Exceção</th>{[1, 2, 3, 4, 5, 6].map((n) => <th key={n} className="direita">{n}ª</th>)}<th className="direita">Total</th><th>Vigência</th></tr></thead>
                  <tbody>
                    {d.tabelas.map((t) => (
                      <tr key={t.id} className={t.vigenteAte && t.vigenteAte < hoje() ? 'opacity-60' : ''}>
                        <td className="font-semibold">{t.destino === 'VENDEDOR' ? t.categoria?.nome : ROTULO_DESTINO[t.destino as Destino]}</td>
                        <td>{t.segmento.nome}</td>
                        <td>{t.titularVendedor ? <Etiqueta tom="azul">{t.titularVendedor.nome}</Etiqueta> : t.titularPessoaId ? <Etiqueta tom="azul">{d.pessoasTitulares.find((p) => p.id === t.titularPessoaId)?.nome}</Etiqueta> : <Traco />}</td>
                        {[1, 2, 3, 4, 5, 6].map((n) => { const f = t.faixas.find((x) => x.parcela === n); return <td key={n} className="direita">{f ? <Percentual valor={f.percentual} /> : <Traco />}</td>; })}
                        <td className="direita font-semibold"><Percentual valor={somar(t.faixas.map((f) => dec(f.percentual)))} /></td>
                        <td><Vig de={t.vigenteDe} ate={t.vigenteAte} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
          {editar ? (
            <Secao titulo="Abrir nova vigência" descricao="A vigência atual da mesma chave (destino, segmento, categoria, exceção) é encerrada no dia anterior. Recusado se a nova data tiraria a regra de venda já apurada. Simule antes de salvar.">
              <FormularioComSimulacao salvar={abrirTabelaAcao} simular={simularTabelaAcao} confirmacao="Confirma a nova vigência? Vendas anteriores à data continuam com a regra delas. O percentual novo vale para vendas a partir da data informada.">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo rotulo="Destino" nome="destino"><select id="destino" name="destino" className="campo"><option value="VENDEDOR">Vendedor (por categoria)</option><option value="SUPERVISAO">Supervisão</option><option value="GERENCIA">Gerência</option></select></Campo>
                  <Campo rotulo="Categoria (só vendedor)" nome="categoriaId"><select id="categoriaId" name="categoriaId" className="campo" defaultValue=""><option value="">—</option>{d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
                  <Campo rotulo="Segmento" nome="segmentoId"><select id="segmentoId" name="segmentoId" className="campo">{d.segmentos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></Campo>
                  <Campo rotulo="Vigente desde" nome="vigenteDe"><input id="vigenteDe" name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" required /></Campo>
                  <Campo rotulo="Exceção: documento (vendedor)" nome="titularVendedorId"><select id="titularVendedorId" name="titularVendedorId" className="campo" defaultValue=""><option value="">—</option>{d.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome} · {v.tipoDocumento}</option>)}</select></Campo>
                  <Campo rotulo="Exceção: pessoa (supervisão/gerência)" nome="titularPessoaId"><select id="titularPessoaId" name="titularPessoaId" className="campo" defaultValue=""><option value="">Regra padrão</option>{d.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
                  <Campo rotulo="Observação" nome="observacao" className="lg:col-span-2"><input id="observacao" name="observacao" className="campo" /></Campo>
                </div>
                <fieldset>
                  <legend className="rotulo mb-1">Percentual por parcela (em %, vazio = não paga)</legend>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <label key={n} className="text-[11px] text-wr-texto-3">{n}ª<input name={`p${n}`} inputMode="decimal" placeholder="—" className="campo numero mt-0.5" /></label>
                    ))}
                  </div>
                </fieldset>
              </FormularioComSimulacao>
            </Secao>
          ) : null}
        </>
      ) : null}

      {aba === 'estornos' ? (
        <>
          <Secao titulo="Quem participa e critério" descricao="Recuperação tem precedência sobre cancelamento. Limite zero desliga o estorno por cancelamento. Participantes são configuração, não código.">
            {configAtual ? (
              <dl className="grid gap-3 text-[13px] sm:grid-cols-4">
                <div><dt className="rotulo">Participantes</dt><dd className="mt-1 flex flex-wrap gap-1">{configAtual.participantes.map((p) => <Etiqueta key={p}>{p}</Etiqueta>)}</dd></div>
                <div><dt className="rotulo">Critério de cancelamento</dt><dd className="mt-1">{configAtual.limiteParcelas === 0 ? 'desligado' : `${configAtual.criterioCancelamento === 'IGUAL' ? 'exatamente' : 'abaixo de'} ${configAtual.limiteParcelas} parcela(s) paga(s)`}</dd></div>
                <div><dt className="rotulo">Escopo da base</dt><dd className="mt-1">{configAtual.escopoBase ? ROTULO_ESCOPO[configAtual.escopoBase as EscopoBase] : <Etiqueta tom="ambar">não definido</Etiqueta>}</dd></div>
                <div><dt className="rotulo">Vigência</dt><dd className="mt-1"><Vig de={configAtual.vigenteDe} ate={configAtual.vigenteAte} /></dd></div>
              </dl>
            ) : <EstadoVazio titulo="Nenhuma configuração de estorno" />}
            {editar && configSemEscopo.length > 0 ? (
              <div className="mt-4 space-y-3 border-t border-wr-borda pt-3">
                {configSemEscopo.map((c) => (
                  <FormularioAcao key={c.id} acao={definirEscopoAcao} rotulo="Definir escopo" emLinha confirmacao="Completar o escopo indefinido não reescreve nada: com ele indefinido nenhum estorno foi apurado. As vendas canceladas pendentes vão para a fila de apuração.">
                    <input type="hidden" name="configuracaoId" value={c.id} />
                    <span className="text-[12px]">Vigência de <DataCurta valor={c.vigenteDe} />:</span>
                    <select name="escopoBase" aria-label="Escopo da base" className="campo w-64">{(Object.keys(ROTULO_ESCOPO) as EscopoBase[]).map((e) => <option key={e} value={e}>{ROTULO_ESCOPO[e]}</option>)}</select>
                  </FormularioAcao>
                ))}
              </div>
            ) : null}
            {d.configs.length > 1 ? <ul className="mt-3 text-[12px] text-wr-texto-2">{d.configs.map((c) => <li key={c.id}><Vig de={c.vigenteDe} ate={c.vigenteAte} /> · {c.participantes.join(', ')} · {c.criterioCancelamento} {c.limiteParcelas} · {c.escopoBase ? ROTULO_ESCOPO[c.escopoBase as EscopoBase] : 'escopo indefinido'}</li>)}</ul> : null}
          </Secao>
          {editar ? (
            <Dobra chave="cfg-config-estorno" titulo="Abrir nova vigência de participantes/critério">
              <div className="p-4">
                <FormularioAcao acao={abrirConfigEstornoAcao} rotulo="Abrir nova vigência" confirmacao="A configuração atual é encerrada no dia anterior. Estornos já apurados não mudam; recusado se tirar a regra de estorno já apurado.">
                  <fieldset className="text-[13px]"><legend className="rotulo mb-1">Participantes</legend>
                    {d.categorias.map((c) => <label key={c.id} className="mr-4"><input type="checkbox" name="participantes" value={c.codigo} defaultChecked={configAtual?.participantes.includes(c.codigo) ?? false} /> {c.nome}</label>)}
                    <label className="mr-4"><input type="checkbox" name="participantes" value="SUPERVISAO" defaultChecked={configAtual?.participantes.includes('SUPERVISAO') ?? false} /> Supervisão</label>
                    <label><input type="checkbox" name="participantes" value="GERENCIA" defaultChecked={configAtual?.participantes.includes('GERENCIA') ?? false} /> Gerência</label>
                  </fieldset>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Campo rotulo="Critério" nome="criterioCancelamento"><select id="criterioCancelamento" name="criterioCancelamento" defaultValue={configAtual?.criterioCancelamento ?? 'IGUAL'} className="campo"><option value="IGUAL">igual a</option><option value="ABAIXO_DE">abaixo de</option></select></Campo>
                    <Campo rotulo="Parcelas pagas (0 = desliga)" nome="limiteParcelas"><input id="limiteParcelas" name="limiteParcelas" type="number" min={0} defaultValue={configAtual?.limiteParcelas ?? 1} className="campo" /></Campo>
                    <Campo rotulo="Escopo da base" nome="escopoBase"><select id="escopoBase" name="escopoBase" defaultValue={configAtual?.escopoBase ?? 'PARCELAS_RECEBIDAS'} className="campo">{(Object.keys(ROTULO_ESCOPO) as EscopoBase[]).map((e) => <option key={e} value={e}>{ROTULO_ESCOPO[e]}</option>)}</select></Campo>
                    <Campo rotulo="Vigente desde" nome="vigenteDe-cfg"><input id="vigenteDe-cfg" name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" /></Campo>
                  </div>
                </FormularioAcao>
              </div>
            </Dobra>
          ) : null}
          <Secao titulo="Percentuais a devolver" descricao="Por tipo, por categoria e por vendedor. Vale o mais específico: exceção do vendedor, depois o percentual da categoria (ou supervisão/gerência), depois o padrão. O percentual é o vigente na data do CANCELAMENTO." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Tipo</th><th>Aplica-se a</th><th className="direita">Percentual</th><th>Vigência</th></tr></thead>
                <tbody>{d.regras.map((r) => <tr key={r.id}><td>{r.tipo === 'RECUPERACAO' ? 'Recuperação' : 'Cancelamento'}</td><td>{r.titularVendedor ? <>Vendedor: {r.titularVendedor.nome}</> : r.participante ? nomeParticipante(r.participante) : 'padrão (demais)'}</td><td className="direita"><Percentual valor={r.percentual} /></td><td><Vig de={r.vigenteDe} ate={r.vigenteAte} /></td></tr>)}</tbody>
              </table>
            </div>
          </Secao>
          {editar ? (
            <Secao titulo="Abrir nova vigência de percentual">
              <FormularioComSimulacao salvar={abrirRegraEstornoAcao} simular={simularRegraEstornoAcao} confirmacao="O percentual atual é encerrado no dia anterior e vale só para cancelamentos a partir da data informada.">
                <div className="grid gap-2 sm:grid-cols-5">
                  <Campo rotulo="Tipo" nome="tipo"><select id="tipo" name="tipo" className="campo"><option value="CANCELAMENTO">Cancelamento</option><option value="RECUPERACAO">Recuperação</option></select></Campo>
                  <Campo rotulo="Categoria" nome="participante"><select id="participante" name="participante" defaultValue="" className="campo"><option value="">Padrão (demais)</option>{d.categorias.map((c) => <option key={c.id} value={c.codigo}>{c.nome}</option>)}<option value="SUPERVISAO">Supervisão</option><option value="GERENCIA">Gerência</option></select></Campo>
                  <Campo rotulo="Vendedor (exceção)" nome="titularVendedorId-e"><select id="titularVendedorId-e" name="titularVendedorId" defaultValue="" className="campo"><option value="">—</option>{d.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome} · {v.tipoDocumento}</option>)}</select></Campo>
                  <Campo rotulo="Percentual (%)" nome="percentual"><input id="percentual" name="percentual" inputMode="decimal" className="campo numero" required /></Campo>
                  <Campo rotulo="Vigente desde" nome="vigenteDe-e"><input id="vigenteDe-e" name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" /></Campo>
                </div>
              </FormularioComSimulacao>
            </Secao>
          ) : null}
        </>
      ) : null}

      {aba === 'metas' ? (
        <>
          <Secao titulo="Metas de promoção" descricao="O volume conta a carteira completa da pessoa, sempre pelo crédito total. A promoção é ato registrado, nunca automática. Mudar a meta não reclassifica quem já foi promovido." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>De → Para</th><th className="direita">Volume mínimo</th><th className="direita">Alerta ao faltar</th><th>Abre documento</th><th>Vigência</th></tr></thead>
                <tbody>{d.metas.map((m) => <tr key={m.id}><td className="font-semibold">{m.categoriaOrigem.nome} → {m.categoriaAlvo.nome}</td><td className="direita"><Dinheiro valor={m.volumeMinimo} /></td><td className="direita"><Dinheiro valor={m.alertaAoFaltar} /></td><td>{m.documentoExigido ?? <Traco />}</td><td><Vig de={m.vigenteDe} ate={m.vigenteAte} /></td></tr>)}</tbody>
              </table>
            </div>
          </Secao>
          {editar ? (
            <Secao titulo="Abrir nova vigência de meta">
              <FormularioAcao acao={abrirMetaAcao} rotulo="Abrir nova vigência" confirmacao="A meta atual do mesmo degrau é encerrada no dia anterior.">
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Campo rotulo="De" nome="categoriaOrigemId"><select id="categoriaOrigemId" name="categoriaOrigemId" className="campo">{d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
                  <Campo rotulo="Para" nome="categoriaAlvoId"><select id="categoriaAlvoId" name="categoriaAlvoId" className="campo">{d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
                  <Campo rotulo="Volume mínimo (R$)" nome="volumeMinimo"><input id="volumeMinimo" name="volumeMinimo" inputMode="decimal" className="campo numero" required /></Campo>
                  <Campo rotulo="Alerta ao faltar (R$)" nome="alertaAoFaltar"><input id="alertaAoFaltar" name="alertaAoFaltar" inputMode="decimal" className="campo numero" required /></Campo>
                  <Campo rotulo="Abre documento" nome="documentoExigido"><select id="documentoExigido" name="documentoExigido" className="campo" defaultValue=""><option value="">—</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select></Campo>
                  <Campo rotulo="Vigente desde" nome="vigenteDe-m"><input id="vigenteDe-m" name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" /></Campo>
                </div>
              </FormularioAcao>
            </Secao>
          ) : null}
        </>
      ) : null}

      {aba === 'flex' ? (
        <>
          <Secao titulo="Modalidades flex" descricao="Flex reduz a BASE da comissão (Flex 50 = base é 50% do crédito). Não reduz a produção que conta para promoção. Apelidos = textos da base de clientes que identificam a modalidade." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Código</th><th>Nome</th><th className="direita">Base (% do crédito)</th><th>Vigência</th><th>Apelidos no arquivo</th></tr></thead>
                <tbody>{d.flex.map((f) => (
                  <tr key={f.id}>
                    <td className="numero font-semibold">{f.codigo}</td><td>{f.nome}</td><td className="direita"><Percentual valor={f.percentual} /></td><td><Vig de={f.vigenteDe} ate={f.vigenteAte} /></td>
                    <td className="min-w-[280px]">
                      {editar ? (
                        <FormularioAcao acao={aliasesFlexAcao} rotulo="Salvar" emLinha>
                          <input type="hidden" name="id" value={f.id} /><input name="aliases" aria-label="Apelidos" defaultValue={f.aliases.join(', ')} className="campo w-64 text-[12px]" />
                        </FormularioAcao>
                      ) : f.aliases.join(', ')}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Secao>
          {editar ? (
            <Dobra chave="cfg-novo-flex" titulo="Abrir nova vigência de flex (ou criar modalidade)">
              <div className="p-4">
                <FormularioAcao acao={abrirFlexAcao} rotulo="Abrir vigência" confirmacao="A vigência atual do mesmo código é encerrada no dia anterior. Recusado se tirar a regra de venda já congelada.">
                  <div className="grid gap-2 sm:grid-cols-5">
                    <Campo rotulo="Código" nome="codigo-f"><input id="codigo-f" name="codigo" className="campo uppercase" required /></Campo>
                    <Campo rotulo="Nome" nome="nome-f"><input id="nome-f" name="nome" className="campo" required /></Campo>
                    <Campo rotulo="Base (% do crédito)" nome="percentual-f"><input id="percentual-f" name="percentual" inputMode="decimal" className="campo numero" required /></Campo>
                    <Campo rotulo="Apelidos" nome="aliases-f"><input id="aliases-f" name="aliases" className="campo" /></Campo>
                    <Campo rotulo="Vigente desde" nome="vigenteDe-f"><input id="vigenteDe-f" name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" /></Campo>
                  </div>
                </FormularioAcao>
              </div>
            </Dobra>
          ) : null}
          <Secao titulo="Segmentos" descricao="Imóveis e Móveis na carga inicial. Apelidos = textos da base de clientes que identificam o segmento." semPadding>
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Código</th><th>Nome</th><th>Apelidos</th></tr></thead>
                <tbody>{d.segmentos.map((g) => (
                  <tr key={g.id}><td className="numero font-semibold">{g.codigo}</td><td>{g.nome}</td>
                    <td className="min-w-[320px]">{editar ? <FormularioAcao acao={aliasesSegmentoAcao} rotulo="Salvar" emLinha><input type="hidden" name="id" value={g.id} /><input name="aliases" aria-label="Apelidos" defaultValue={g.aliases.join(', ')} className="campo w-80 text-[12px]" /></FormularioAcao> : g.aliases.join(', ')}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {editar ? (
              <div className="border-t border-wr-borda p-4">
                <FormularioAcao acao={criarSegmentoAcao} rotulo="Criar segmento" emLinha>
                  <input name="codigo" aria-label="Código" placeholder="CÓDIGO" className="campo w-32 uppercase" required />
                  <input name="nome" aria-label="Nome" placeholder="Nome" className="campo w-40" required />
                  <input name="aliases" aria-label="Apelidos" placeholder="Apelidos (vírgula)" className="campo w-64" />
                </FormularioAcao>
              </div>
            ) : null}
          </Secao>
        </>
      ) : null}
    </Pagina>
  );
}
