import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatarData, vigenteEm, hoje } from '@/lib/datas';
import { formatarDocumento } from '@/lib/documento';
import { pode } from '@/lib/permissoes';
import { exigirPagina } from '@/servidor/sessao';
import { fichaDaPessoa } from '@/servidor/consultas/vendedores';
import { opcoesDeFormulario } from '@/servidor/consultas/opcoes';
import { Aviso, BarraProgresso, Campo, Cartao, DataCurta, Dinheiro, Etiqueta, LinkBotao, Monograma, Pagina, Secao, Traco } from '@/ui/base';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import {
  alterarAlocacaoAcao, alterarCategoriaAcao, cancelarRecuperacaoAcao, corrigirInicioAcao, desligarAcao, reativarAcao, registrarRecuperacaoAcao, vincularNomeAcao,
} from '../acoes';

export const metadata: Metadata = { title: 'Ficha do vendedor' };
export const dynamic = 'force-dynamic';

export default async function FichaVendedor({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirPagina('vendedores');
  const { id } = await params;
  const ficha = await fichaDaPessoa(s, id);
  if (!ficha) notFound();
  const opcoes = await opcoesDeFormulario(s);
  const podeEditar = pode(s.perfil, 'vendedores', 'editar');
  const d = hoje();
  const promo = ficha.promocao?.situacao;

  return (
    <Pagina
      titulo={ficha.pessoa.nome}
      descricao="Uma seção por documento. Cada documento tem categoria, alocação e exceções próprias; a pessoa só consolida a produção e a folha."
      acoes={
        <>
          {pode(s.perfil, 'comissoes') ? <LinkBotao href={`/vendedores/${id}/extrato`} icone="auditoria">Extrato</LinkBotao> : null}
          <LinkBotao href={`/clientes?pessoa=${id}`} icone="clientes">Vendas desta pessoa</LinkBotao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao destaque rotulo="Produção acumulada" valor={<Dinheiro valor={ficha.promocao?.volume ?? '0'} />} detalhe="Carteira completa da pessoa, crédito total (flex não reduz)" />
        <Cartao rotulo="Degrau atual" valor={ficha.promocao?.categoriaAtual?.nome ?? '—'} tom="azul" detalhe="Maior categoria entre os documentos ativos" />
        <Cartao
          rotulo="Próxima categoria"
          valor={promo?.proximaCategoria ?? '—'}
          tom={promo?.atingiu ? 'verde' : promo?.proxima ? 'ambar' : 'neutro'}
          detalhe={promo?.meta ? <>Meta <Dinheiro valor={promo.meta} />{promo.documentoExigido ? ` · abre documento ${promo.documentoExigido}` : ''}</> : 'Sem meta vigente a partir deste degrau'}
        />
        <Cartao rotulo="Falta" valor={promo?.falta ? <Dinheiro valor={promo.falta} /> : '—'} tom={promo?.atingiu ? 'verde' : promo?.proxima ? 'ambar' : 'neutro'} detalhe={promo?.atingiu ? 'Meta atingida — a promoção é um ato registrado abaixo' : undefined} />
      </div>
      {promo?.progressoPct ? <BarraProgresso pct={Number(promo.progressoPct.toFixed(1))} tom={promo.atingiu ? 'verde' : promo.proxima ? 'ambar' : 'azul'} rotulo="Progresso para a próxima categoria" /> : null}
      {ficha.desligada ? <Aviso tom="vermelho" titulo="Pessoa desligada">Todos os documentos desta pessoa estão desligados.</Aviso> : null}

      {ficha.documentos.map((doc) => {
        const catAtual = doc.categorias.find((c) => vigenteEm(d, c.vigenteDe, c.vigenteAte));
        const alocAtual = doc.alocacoes.find((a) => vigenteEm(d, a.vigenteDe, a.vigenteAte));
        const prod = ficha.producaoPorDoc.find((p) => p.snapVendedorId === doc.id);
        const categoriasAceitas = opcoes.categorias.filter((c) => c.documentosAceitos.includes(doc.tipoDocumento));
        return (
          <Secao
            key={doc.id}
            titulo={`${doc.tipoDocumento} ${formatarDocumento(doc.documento)}`}
            descricao={<>Nome no documento: {doc.nome} · {prod?._count ?? 0} venda(s) · <Dinheiro valor={prod?._sum.credito ?? '0'} /></>}
            acoes={
              <div className="flex flex-wrap gap-1">
                {doc.status === 'DESLIGADO' ? <Etiqueta tom="vermelho">desligado em {formatarData(doc.desligadoEm)}</Etiqueta> : <Etiqueta tom="verde">ativo</Etiqueta>}
                {catAtual ? <Etiqueta tom="verde">{catAtual.categoria.nome}</Etiqueta> : <Etiqueta tom="ambar">sem categoria vigente</Etiqueta>}
                {alocAtual ? <Etiqueta tom="azul">{alocAtual.equipe.gerencia.nome} › {alocAtual.equipe.nome}</Etiqueta> : <Etiqueta tom="ambar">sem equipe vigente</Etiqueta>}
              </div>
            }
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="min-w-0 xl:col-span-2 space-y-4">
                <div>
                  <p className="rotulo mb-1">Histórico de categoria</p>
                  <div className="tabela-quadro rounded-lg border border-wr-borda">
                    <table className="tabela">
                      <thead><tr><th>Categoria</th><th>De</th><th>Até</th><th>Tipo</th><th>Motivo</th>{podeEditar ? <th>Corrigir início</th> : null}</tr></thead>
                      <tbody>
                        {doc.categorias.map((c) => (
                          <tr key={c.id}>
                            <td className="font-semibold">{c.categoria.nome} {c.vigenteDe > d ? <Etiqueta tom="ambar">futura</Etiqueta> : null}</td>
                            <td><DataCurta valor={c.vigenteDe} /></td>
                            <td>{c.vigenteAte ? <DataCurta valor={c.vigenteAte} /> : <Etiqueta tom="verde">vigente</Etiqueta>}</td>
                            <td>{c.promocao ? <Etiqueta tom="verde">promoção</Etiqueta> : <Traco />}</td>
                            <td className="text-wr-texto-2">{c.motivo ?? <Traco />}</td>
                            {podeEditar ? (
                              <td>
                                <FormularioAcao acao={corrigirInicioAcao} rotulo="Corrigir" emLinha confirmacao="A correção é recusada se atropelar o período anterior ou tirar a regra de uma comissão já apurada.">
                                  <input type="hidden" name="vigenciaId" value={c.id} />
                                  <input name="novoInicio" type="date" aria-label="Novo início" className="campo w-36" required />
                                  <input name="motivo" aria-label="Motivo" placeholder="Motivo" className="campo w-40" required />
                                </FormularioAcao>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                        {doc.categorias.length === 0 ? <tr><td colSpan={6}><Traco /></td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <p className="rotulo mb-1">Histórico de equipe / gerência</p>
                  <div className="tabela-quadro rounded-lg border border-wr-borda">
                    <table className="tabela">
                      <thead><tr><th>Gerência</th><th>Equipe</th><th>De</th><th>Até</th><th>Motivo</th></tr></thead>
                      <tbody>
                        {doc.alocacoes.map((a) => (
                          <tr key={a.id}>
                            <td>{a.equipe.gerencia.nome}</td><td className="font-semibold">{a.equipe.nome}</td>
                            <td><DataCurta valor={a.vigenteDe} /></td>
                            <td>{a.vigenteAte ? <DataCurta valor={a.vigenteAte} /> : <Etiqueta tom="verde">vigente</Etiqueta>}</td>
                            <td className="text-wr-texto-2">{a.motivo ?? <Traco />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <p className="rotulo mb-1">Períodos de recuperação</p>
                  {doc.recuperacoes.length === 0 ? <p className="text-[12px] text-wr-texto-3">Nenhum período registrado.</p> : (
                    <div className="tabela-quadro rounded-lg border border-wr-borda">
                      <table className="tabela">
                        <thead><tr><th>Início</th><th>Fim</th><th>Situação</th><th>Motivo</th>{podeEditar ? <th /> : null}</tr></thead>
                        <tbody>
                          {doc.recuperacoes.map((r) => (
                            <tr key={r.id}>
                              <td><DataCurta valor={r.inicio} /></td>
                              <td>{r.fim ? <DataCurta valor={r.fim} /> : <Traco />}</td>
                              <td>{r.canceladoEm ? <Etiqueta tom="neutro" titulo={r.motivoCancelamento ?? ''}>cancelado (ignorado)</Etiqueta> : <Etiqueta tom="ambar">vale</Etiqueta>}</td>
                              <td className="text-wr-texto-2">{r.motivo ?? <Traco />}</td>
                              {podeEditar ? (
                                <td>
                                  {!r.canceladoEm ? (
                                    <FormularioAcao acao={cancelarRecuperacaoAcao} rotulo="Cancelar período" perigo emLinha confirmacao="O período fica no histórico, ignorado. Vendas já marcadas como recuperação continuam marcadas (a marcação é permanente).">
                                      <input type="hidden" name="id" value={r.id} />
                                      <input name="motivo" aria-label="Motivo" placeholder="Motivo" className="campo w-40" required />
                                    </FormularioAcao>
                                  ) : null}
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {doc.aliases.length > 0 ? (
                  <p className="text-[12px] text-wr-texto-2">Também reconhecido na importação como: {doc.aliases.map((a) => <Etiqueta key={a.id}>{a.nomeNormalizado}</Etiqueta>)}</p>
                ) : null}
              </div>

              {podeEditar ? (
                <div className="space-y-3">
                  <Dobra chave={`cat-${doc.id}`} titulo={promo?.atingiu ? 'Alterar categoria / registrar promoção' : 'Alterar categoria'}>
                    <div className="p-3">
                      <FormularioAcao acao={alterarCategoriaAcao} rotulo="Abrir nova vigência" confirmacao="A categoria atual é encerrada no dia anterior. Vendas já importadas mantêm a categoria congelada; nada do passado muda.">
                        <input type="hidden" name="vendedorId" value={doc.id} />
                        <Campo rotulo="Nova categoria" nome={`cat-${doc.id}`}>
                          <select id={`cat-${doc.id}`} name="categoriaId" className="campo">{categoriasAceitas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                        </Campo>
                        <Campo rotulo="Vigente desde" nome={`catde-${doc.id}`}><input id={`catde-${doc.id}`} name="vigenteDe" type="date" className="campo" defaultValue={opcoes.hojeISO} required /></Campo>
                        <Campo rotulo="Motivo" nome={`catm-${doc.id}`}><input id={`catm-${doc.id}`} name="motivo" className="campo" required /></Campo>
                        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="promocao" value="true" /> Registrar como promoção</label>
                      </FormularioAcao>
                    </div>
                  </Dobra>
                  <Dobra chave={`aloc-${doc.id}`} titulo="Alterar equipe">
                    <div className="p-3">
                      <FormularioAcao acao={alterarAlocacaoAcao} rotulo="Abrir nova vigência" confirmacao="A alocação atual é encerrada no dia anterior. Vendas já importadas mantêm equipe, gerência, supervisor e gerente congelados.">
                        <input type="hidden" name="vendedorId" value={doc.id} />
                        <Campo rotulo="Nova equipe" nome={`eq-${doc.id}`}>
                          <select id={`eq-${doc.id}`} name="equipeId" className="campo">{opcoes.equipes.map((e) => <option key={e.id} value={e.id}>{e.gerencia.nome} › {e.nome}</option>)}</select>
                        </Campo>
                        <Campo rotulo="Vigente desde" nome={`eqde-${doc.id}`}><input id={`eqde-${doc.id}`} name="vigenteDe" type="date" className="campo" defaultValue={opcoes.hojeISO} required /></Campo>
                        <Campo rotulo="Motivo" nome={`eqm-${doc.id}`}><input id={`eqm-${doc.id}`} name="motivo" className="campo" required /></Campo>
                      </FormularioAcao>
                    </div>
                  </Dobra>
                  <Dobra chave={`rec-${doc.id}`} titulo="Registrar recuperação">
                    <div className="p-3">
                      <FormularioAcao acao={registrarRecuperacaoAcao} rotulo="Registrar">
                        <input type="hidden" name="vendedorId" value={doc.id} />
                        <Campo rotulo="Início" nome={`ri-${doc.id}`}><input id={`ri-${doc.id}`} name="inicio" type="date" className="campo" required /></Campo>
                        <Campo rotulo="Fim (opcional)" nome={`rf-${doc.id}`}><input id={`rf-${doc.id}`} name="fim" type="date" className="campo" /></Campo>
                        <Campo rotulo="Motivo" nome={`rm-${doc.id}`}><input id={`rm-${doc.id}`} name="motivo" className="campo" /></Campo>
                      </FormularioAcao>
                    </div>
                  </Dobra>
                  <Dobra chave={`alias-${doc.id}`} titulo="Vincular nome da administradora">
                    <div className="p-3">
                      <FormularioAcao acao={vincularNomeAcao} rotulo="Vincular" confirmacao="Decisão registrada: vendas importadas com este nome passam a ser deste documento.">
                        <input type="hidden" name="vendedorId" value={doc.id} />
                        <Campo rotulo="Nome como vem no arquivo" nome={`al-${doc.id}`}><input id={`al-${doc.id}`} name="nomeImportado" className="campo" required /></Campo>
                      </FormularioAcao>
                    </div>
                  </Dobra>
                  <Dobra chave={`desl-${doc.id}`} titulo={doc.status === 'ATIVO' ? 'Desligar documento' : 'Reativar documento'}>
                    <div className="p-3">
                      {doc.status === 'ATIVO' ? (
                        <FormularioAcao acao={desligarAcao} rotulo="Desligar" perigo confirmacao="O documento sai das listas de ativos. O histórico, as vendas e as comissões continuam. A pessoa só fica desligada quando todos os documentos pararem.">
                          <input type="hidden" name="vendedorId" value={doc.id} />
                          <Campo rotulo="Data" nome={`dd-${doc.id}`}><input id={`dd-${doc.id}`} name="data" type="date" className="campo" defaultValue={opcoes.hojeISO} required /></Campo>
                          <Campo rotulo="Motivo" nome={`dm-${doc.id}`}><input id={`dm-${doc.id}`} name="motivo" className="campo" required /></Campo>
                        </FormularioAcao>
                      ) : (
                        <FormularioAcao acao={reativarAcao} rotulo="Reativar" confirmacao="O documento volta à lista de ativos.">
                          <input type="hidden" name="vendedorId" value={doc.id} />
                          <Campo rotulo="Motivo" nome={`ra-${doc.id}`}><input id={`ra-${doc.id}`} name="motivo" className="campo" required /></Campo>
                        </FormularioAcao>
                      )}
                    </div>
                  </Dobra>
                </div>
              ) : null}
            </div>
          </Secao>
        );
      })}
      {ficha.documentos.length === 0 ? (
        <Aviso tom="azul">Esta pessoa não tem documento de venda cadastrado (é só responsável de unidade). <Monograma nome={ficha.pessoa.nome} /></Aviso>
      ) : null}
    </Pagina>
  );
}
