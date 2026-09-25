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
      descricao="Um bloco para cada CPF/CNPJ da pessoa: cada um tem sua categoria e sua equipe. A produção e os pagamentos somam todos."
      acoes={
        <>
          {pode(s.perfil, 'comissoes') ? <LinkBotao href={`/vendedores/${id}/extrato`} icone="auditoria">Extrato</LinkBotao> : null}
          <LinkBotao href={`/clientes?pessoa=${id}`} icone="clientes">Vendas desta pessoa</LinkBotao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao destaque rotulo="Produção acumulada" valor={<Dinheiro valor={ficha.promocao?.volume ?? '0'} />} detalhe="Soma do crédito de todas as vendas da pessoa (o flex não reduz)" />
        <Cartao rotulo="Categoria atual" valor={ficha.promocao?.categoriaAtual?.nome ?? '—'} tom="azul" detalhe="A maior entre os CPF/CNPJ ativos" />
        <Cartao
          rotulo="Próxima categoria"
          valor={promo?.proximaCategoria ?? '—'}
          tom={promo?.atingiu ? 'verde' : promo?.proxima ? 'ambar' : 'neutro'}
          detalhe={promo?.meta ? <>Meta <Dinheiro valor={promo.meta} />{promo.documentoExigido ? ` · abre documento ${promo.documentoExigido}` : ''}</> : 'Não há meta cadastrada para a próxima categoria'}
        />
        <Cartao rotulo="Falta" valor={promo?.falta ? <Dinheiro valor={promo.falta} /> : '—'} tom={promo?.atingiu ? 'verde' : promo?.proxima ? 'ambar' : 'neutro'} detalhe={promo?.atingiu ? 'Meta atingida — para promover, use “Mudar categoria” abaixo e marque “é promoção”' : undefined} />
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
            descricao={<>Nome: {doc.nome} · {prod?._count ?? 0} venda(s) · <Dinheiro valor={prod?._sum.credito ?? '0'} /></>}
            acoes={
              <div className="flex flex-wrap gap-1">
                {doc.status === 'DESLIGADO' ? <Etiqueta tom="vermelho">desligado em {formatarData(doc.desligadoEm)}</Etiqueta> : <Etiqueta tom="verde">ativo</Etiqueta>}
                {catAtual ? <Etiqueta tom="verde">{catAtual.categoria.nome}</Etiqueta> : <Etiqueta tom="ambar">sem categoria hoje</Etiqueta>}
                {alocAtual ? <Etiqueta tom="azul">{alocAtual.equipe.gerencia.nome} › {alocAtual.equipe.nome}</Etiqueta> : <Etiqueta tom="ambar">sem equipe hoje</Etiqueta>}
              </div>
            }
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="min-w-0 xl:col-span-2 space-y-4">
                <div>
                  <p className="rotulo mb-1">Histórico de categoria</p>
                  <div className="tabela-quadro rounded-lg border border-wr-borda">
                    <table className="tabela">
                      <thead><tr><th>Categoria</th><th>De</th><th>Até</th><th>Tipo</th><th>Motivo</th>{podeEditar ? <th>Corrigir data de início</th> : null}</tr></thead>
                      <tbody>
                        {doc.categorias.map((c) => (
                          <tr key={c.id}>
                            <td className="font-semibold">{c.categoria.nome} {c.vigenteDe > d ? <Etiqueta tom="ambar">futura</Etiqueta> : null}</td>
                            <td><DataCurta valor={c.vigenteDe} /></td>
                            <td>{c.vigenteAte ? <DataCurta valor={c.vigenteAte} /> : <Etiqueta tom="verde">atual</Etiqueta>}</td>
                            <td>{c.promocao ? <Etiqueta tom="verde">promoção</Etiqueta> : <Traco />}</td>
                            <td className="text-wr-texto-2">{c.motivo ?? <Traco />}</td>
                            {podeEditar ? (
                              <td>
                                <FormularioAcao acao={corrigirInicioAcao} rotulo="Corrigir" emLinha confirmacao="Muda a data em que esta categoria começou. O sistema recusa se isso alterar comissão já calculada.">
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
                            <td>{a.vigenteAte ? <DataCurta valor={a.vigenteAte} /> : <Etiqueta tom="verde">atual</Etiqueta>}</td>
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
                                    <FormularioAcao acao={cancelarRecuperacaoAcao} rotulo="Cancelar período" perigo emLinha confirmacao="O período fica no histórico, sem valer. Vendas que já entraram como recuperação continuam assim.">
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
                  <p className="text-[12px] text-wr-texto-2">Também reconhecido nos arquivos como: {doc.aliases.map((a) => <Etiqueta key={a.id}>{a.nomeNormalizado}</Etiqueta>)}</p>
                ) : null}
              </div>

              {podeEditar ? (
                <div className="space-y-3">
                  <Dobra chave={`cat-${doc.id}`} titulo={promo?.atingiu ? 'Mudar categoria / promover' : 'Mudar categoria'}>
                    <div className="p-3">
                      <FormularioAcao acao={alterarCategoriaAcao} rotulo="Salvar" confirmacao="A nova categoria vale para as vendas a partir da data informada (pode ser passada). Vendas já calculadas não mudam.">
                        <input type="hidden" name="vendedorId" value={doc.id} />
                        <Campo rotulo="Nova categoria" nome={`cat-${doc.id}`}>
                          <select id={`cat-${doc.id}`} name="categoriaId" className="campo">{categoriasAceitas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                        </Campo>
                        <Campo rotulo="A partir de" nome={`catde-${doc.id}`}><input id={`catde-${doc.id}`} name="vigenteDe" type="date" className="campo" defaultValue={opcoes.hojeISO} required /></Campo>
                        <Campo rotulo="Motivo" nome={`catm-${doc.id}`}><input id={`catm-${doc.id}`} name="motivo" className="campo" required /></Campo>
                        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="promocao" value="true" /> É promoção (atingiu a meta)</label>
                      </FormularioAcao>
                    </div>
                  </Dobra>
                  <Dobra chave={`aloc-${doc.id}`} titulo="Mudar de equipe">
                    <div className="p-3">
                      <FormularioAcao acao={alterarAlocacaoAcao} rotulo="Salvar" confirmacao="A nova equipe vale para as vendas a partir da data informada (pode ser passada). Vendas já calculadas continuam com a equipe da época.">
                        <input type="hidden" name="vendedorId" value={doc.id} />
                        <Campo rotulo="Nova equipe" nome={`eq-${doc.id}`}>
                          <select id={`eq-${doc.id}`} name="equipeId" className="campo">{opcoes.equipes.map((e) => <option key={e.id} value={e.id}>{e.gerencia.nome} › {e.nome}</option>)}</select>
                        </Campo>
                        <Campo rotulo="A partir de" nome={`eqde-${doc.id}`}><input id={`eqde-${doc.id}`} name="vigenteDe" type="date" className="campo" defaultValue={opcoes.hojeISO} required /></Campo>
                        <Campo rotulo="Motivo" nome={`eqm-${doc.id}`}><input id={`eqm-${doc.id}`} name="motivo" className="campo" required /></Campo>
                      </FormularioAcao>
                    </div>
                  </Dobra>
                  <Dobra chave={`rec-${doc.id}`} titulo="Registrar período de recuperação">
                    <div className="p-3">
                      <FormularioAcao acao={registrarRecuperacaoAcao} rotulo="Registrar">
                        <input type="hidden" name="vendedorId" value={doc.id} />
                        <Campo rotulo="Início" nome={`ri-${doc.id}`}><input id={`ri-${doc.id}`} name="inicio" type="date" className="campo" required /></Campo>
                        <Campo rotulo="Fim (opcional)" nome={`rf-${doc.id}`}><input id={`rf-${doc.id}`} name="fim" type="date" className="campo" /></Campo>
                        <Campo rotulo="Motivo" nome={`rm-${doc.id}`}><input id={`rm-${doc.id}`} name="motivo" className="campo" /></Campo>
                      </FormularioAcao>
                    </div>
                  </Dobra>
                  <Dobra chave={`alias-${doc.id}`} titulo="Outro nome usado nos arquivos">
                    <div className="p-3">
                      <FormularioAcao acao={vincularNomeAcao} rotulo="Vincular" confirmacao="As vendas que chegarem com este nome passam a ser deste vendedor.">
                        <input type="hidden" name="vendedorId" value={doc.id} />
                        <Campo rotulo="Nome como vem no arquivo" nome={`al-${doc.id}`}><input id={`al-${doc.id}`} name="nomeImportado" className="campo" required /></Campo>
                      </FormularioAcao>
                    </div>
                  </Dobra>
                  <Dobra chave={`desl-${doc.id}`} titulo={doc.status === 'ATIVO' ? 'Desligar' : 'Reativar'}>
                    <div className="p-3">
                      {doc.status === 'ATIVO' ? (
                        <FormularioAcao acao={desligarAcao} rotulo="Desligar" perigo confirmacao="Sai da lista de ativos. O histórico, as vendas e as comissões continuam. A pessoa só fica desligada quando todos os CPF/CNPJ dela forem desligados.">
                          <input type="hidden" name="vendedorId" value={doc.id} />
                          <Campo rotulo="Data" nome={`dd-${doc.id}`}><input id={`dd-${doc.id}`} name="data" type="date" className="campo" defaultValue={opcoes.hojeISO} required /></Campo>
                          <Campo rotulo="Motivo" nome={`dm-${doc.id}`}><input id={`dm-${doc.id}`} name="motivo" className="campo" required /></Campo>
                        </FormularioAcao>
                      ) : (
                        <FormularioAcao acao={reativarAcao} rotulo="Reativar" confirmacao="Volta para a lista de ativos.">
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
