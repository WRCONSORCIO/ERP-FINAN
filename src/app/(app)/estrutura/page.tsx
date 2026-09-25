import type { Metadata } from 'next';
import Link from 'next/link';
import { formatarDocumento } from '@/lib/documento';
import { pode } from '@/lib/permissoes';
import { exigirPagina } from '@/servidor/sessao';
import { arvoreDaEstrutura } from '@/servidor/consultas/estrutura';
import { Campo, Cartao, DataCurta, EstadoVazio, Etiqueta, Monograma, Pagina, Secao } from '@/ui/base';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import { hoje } from '@/lib/datas';
import {
  cadastrarAdministradoraAcao, criarEquipeAcao, criarGerenciaAcao, definirResponsavelAcao, encerrarResponsavelAcao, excluirEquipeAcao,
  excluirGerenciaAcao, renomearEquipeAcao, renomearGerenciaAcao, statusEquipeAcao, statusGerenciaAcao,
} from './acoes';

export const metadata: Metadata = { title: 'Estrutura' };
export const dynamic = 'force-dynamic';

function FormResponsavel({ papel, unidadeId, pessoas, hojeISO }: { papel: 'GERENTE' | 'SUPERVISOR'; unidadeId: string; pessoas: Array<{ id: string; nome: string }>; hojeISO: string }) {
  return (
    <FormularioAcao acao={definirResponsavelAcao} rotulo={`Definir ${papel === 'GERENTE' ? 'gerente' : 'supervisor'}`} confirmacao="Vale para as vendas a partir da data informada (pode ser passada). Vendas já calculadas continuam com o responsável da época.">
      <input type="hidden" name="papel" value={papel} />
      <input type="hidden" name="unidadeId" value={unidadeId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Campo rotulo="Pessoa existente" nome={`p-${unidadeId}`}>
          <select id={`p-${unidadeId}`} name="pessoaId" className="campo" defaultValue="">
            <option value="">— ou informe um nome novo —</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nome (pessoa nova)" nome={`n-${unidadeId}`}><input id={`n-${unidadeId}`} name="novoNome" className="campo" /></Campo>
        <Campo rotulo="Vigente desde" nome={`d-${unidadeId}`}><input id={`d-${unidadeId}`} name="vigenteDe" type="date" defaultValue={hojeISO} className="campo" required /></Campo>
      </div>
    </FormularioAcao>
  );
}

export default async function Estrutura() {
  const s = await exigirPagina('equipes');
  const { arvore, indicadores, pessoas, administradoras } = await arvoreDaEstrutura(s);
  const editarGerencia = pode(s.perfil, 'gerencias', 'editar');
  const editarEquipe = pode(s.perfil, 'equipes', 'editar');
  const hojeISO = hoje().toISOString().slice(0, 10);

  return (
    <Pagina titulo="Estrutura" descricao="Gerência → supervisão → vendedor. É esta corrente que decide quem recebe comissão de gerência e de supervisão em cada venda. Quem já explica um pagamento não se apaga — desativar tira das listas e mantém o histórico.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao destaque rotulo="Gerências" valor={indicadores.gerencias} detalhe="ativas" />
        <Cartao rotulo="Supervisões" valor={indicadores.supervisoes} tom="azul" detalhe="equipes ativas" />
        <Cartao rotulo="Gerências sem gerente" valor={indicadores.gerenciasSemGerente} tom={indicadores.gerenciasSemGerente > 0 ? 'ambar' : 'verde'} detalhe="vendas delas ficam sem comissão de gerência" />
        <Cartao rotulo="Supervisões sem supervisor" valor={indicadores.supervisoesSemSupervisor} tom={indicadores.supervisoesSemSupervisor > 0 ? 'ambar' : 'verde'} detalhe="vendas delas ficam sem comissão de supervisão" />
      </div>

      {editarGerencia ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Dobra chave="estrutura-nova-gerencia" titulo="Criar gerência">
            <div className="p-3"><FormularioAcao acao={criarGerenciaAcao} rotulo="Criar" emLinha><input name="nome" aria-label="Nome da gerência" placeholder="Nome da gerência" className="campo w-64" required /></FormularioAcao></div>
          </Dobra>
          <Dobra chave="estrutura-administradoras" titulo="Administradoras" resumo={`${administradoras.length} cadastrada(s)`}>
            <div className="space-y-3 p-3">
              <ul className="text-[13px]">{administradoras.map((a) => <li key={a.id}><strong>{a.codigo}</strong> · {a.nome} {a.cnpj ? <span className="numero text-wr-texto-2">{formatarDocumento(a.cnpj)}</span> : null}</li>)}</ul>
              <FormularioAcao acao={cadastrarAdministradoraAcao} rotulo="Cadastrar administradora" emLinha>
                <input name="codigo" aria-label="Código" placeholder="Código" className="campo w-28" required />
                <input name="nome" aria-label="Nome" placeholder="Nome" className="campo w-48" required />
                <input name="cnpj" aria-label="CNPJ" placeholder="CNPJ (opcional)" className="campo w-44" />
              </FormularioAcao>
            </div>
          </Dobra>
        </div>
      ) : null}

      {arvore.length === 0 ? <div className="cartao"><EstadoVazio titulo="Nenhuma gerência que você possa ver" /></div> : null}
      {arvore.map((g) => (
        <Dobra
          key={g.id}
          chave={`g-${g.id}`}
          titulo={<span className="flex flex-wrap items-center gap-2">{g.nome} {g.status === 'INATIVO' ? <Etiqueta tom="neutro">inativa</Etiqueta> : null}</span>}
          resumo={<span className="flex flex-wrap items-center gap-2">Gerente: {g.gerenteAtual ? <strong>{g.gerenteAtual.pessoa.nome}</strong> : <Etiqueta tom="ambar">sem gerente</Etiqueta>} · {g.equipes.length} equipe(s)</span>}
        >
          <div className="space-y-3 p-3">
            {editarGerencia ? (
              <div className="grid gap-3 xl:grid-cols-2">
                <Secao titulo="Gerente">
                  <ul className="mb-3 space-y-1 text-[12px]">
                    {g.responsaveis.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2">
                        <Monograma nome={r.pessoa.nome} tamanho={22} /> {r.pessoa.nome} · <DataCurta valor={r.vigenteDe} /> a {r.vigenteAte ? <DataCurta valor={r.vigenteAte} /> : <Etiqueta tom="verde">vigente</Etiqueta>}
                        {!r.vigenteAte ? (
                          <FormularioAcao acao={encerrarResponsavelAcao} rotulo="Encerrar" perigo emLinha confirmacao="Sem gerente, as vendas novas desta gerência ficam sem comissão de gerência até alguém ser informado.">
                            <input type="hidden" name="id" value={r.id} /><input name="vigenteAte" type="date" aria-label="Encerrar em" defaultValue={hojeISO} className="campo w-36" />
                          </FormularioAcao>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {g.status === 'ATIVO' ? <FormResponsavel papel="GERENTE" unidadeId={g.id} pessoas={pessoas} hojeISO={hojeISO} /> : null}
                </Secao>
                <Secao titulo="Gerência">
                  <div className="space-y-3">
                    <FormularioAcao acao={renomearGerenciaAcao} rotulo="Renomear" emLinha><input type="hidden" name="id" value={g.id} /><input name="nome" aria-label="Novo nome" defaultValue={g.nome} className="campo w-56" /></FormularioAcao>
                    {g.status === 'ATIVO' && editarEquipe ? (
                      <FormularioAcao acao={criarEquipeAcao} rotulo="Criar equipe" emLinha><input type="hidden" name="gerenciaId" value={g.id} /><input name="nome" aria-label="Nome da equipe" placeholder="Nome da equipe" className="campo w-56" required /></FormularioAcao>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <FormularioAcao acao={statusGerenciaAcao} rotulo={g.status === 'ATIVO' ? 'Desativar gerência' : 'Reativar gerência'} perigo={g.status === 'ATIVO'} confirmacao={g.status === 'ATIVO' ? 'A gerência sai das listas; histórico, vendas e comissões ficam.' : 'A gerência volta às listas.'}>
                        <input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value={g.status === 'ATIVO' ? 'INATIVO' : 'ATIVO'} />
                      </FormularioAcao>
                      <FormularioAcao acao={excluirGerenciaAcao} rotulo="Excluir" perigo confirmacao="Só é possível excluir gerência sem nenhum histórico. Com histórico, o sistema recusa — desative.">
                        <input type="hidden" name="id" value={g.id} />
                      </FormularioAcao>
                    </div>
                  </div>
                </Secao>
              </div>
            ) : null}

            {g.equipes.map((e) => (
              <Dobra
                key={e.id}
                chave={`e-${e.id}`}
                titulo={<span className="flex flex-wrap items-center gap-2">{e.nome} {e.status === 'INATIVO' ? <Etiqueta>inativa</Etiqueta> : null}</span>}
                resumo={<span className="flex flex-wrap items-center gap-2">Supervisor: {e.supervisorAtual ? <strong>{e.supervisorAtual.pessoa.nome}</strong> : <Etiqueta tom="ambar">sem supervisor</Etiqueta>} · {e.alocacoes.length} vendedor(es)</span>}
              >
                <div className="space-y-3 p-3">
                  {e.alocacoes.length === 0 ? <p className="text-[12px] text-wr-texto-3">Nenhum vendedor alocado hoje.</p> : (
                    <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                      {e.alocacoes.map((a) => (
                        <li key={a.id} className="flex items-center gap-2 text-[13px]">
                          <Monograma nome={a.vendedor.pessoa.nome} tamanho={22} />
                          <Link href={`/vendedores/${a.vendedor.pessoaId}`}>{a.vendedor.pessoa.nome}</Link>
                          <Etiqueta tom={a.vendedor.tipoDocumento === 'CPF' ? 'azul' : 'neutro'}>{a.vendedor.tipoDocumento}</Etiqueta>
                          {a.vendedor.status === 'DESLIGADO' ? <Etiqueta tom="vermelho">desligado</Etiqueta> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {editarEquipe ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      <Secao titulo="Supervisor">
                        <ul className="mb-3 space-y-1 text-[12px]">
                          {e.responsaveis.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center gap-2">
                              {r.pessoa.nome} · <DataCurta valor={r.vigenteDe} /> a {r.vigenteAte ? <DataCurta valor={r.vigenteAte} /> : <Etiqueta tom="verde">vigente</Etiqueta>}
                              {!r.vigenteAte ? (
                                <FormularioAcao acao={encerrarResponsavelAcao} rotulo="Encerrar" perigo emLinha confirmacao="Sem supervisor, as vendas novas desta equipe ficam sem comissão de supervisão até alguém ser informado.">
                                  <input type="hidden" name="id" value={r.id} /><input name="vigenteAte" type="date" aria-label="Encerrar em" defaultValue={hojeISO} className="campo w-36" />
                                </FormularioAcao>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {e.status === 'ATIVO' ? <FormResponsavel papel="SUPERVISOR" unidadeId={e.id} pessoas={pessoas} hojeISO={hojeISO} /> : null}
                      </Secao>
                      <Secao titulo="Equipe">
                        <div className="space-y-3">
                          <FormularioAcao acao={renomearEquipeAcao} rotulo="Renomear" emLinha><input type="hidden" name="id" value={e.id} /><input name="nome" aria-label="Novo nome" defaultValue={e.nome} className="campo w-56" /></FormularioAcao>
                          <div className="flex flex-wrap gap-2">
                            <FormularioAcao acao={statusEquipeAcao} rotulo={e.status === 'ATIVO' ? 'Desativar equipe' : 'Reativar equipe'} perigo={e.status === 'ATIVO'} confirmacao={e.status === 'ATIVO' ? 'Recusado se houver vendedor ativo alocado. Histórico fica.' : 'A equipe volta às listas.'}>
                              <input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value={e.status === 'ATIVO' ? 'INATIVO' : 'ATIVO'} />
                            </FormularioAcao>
                            <FormularioAcao acao={excluirEquipeAcao} rotulo="Excluir" perigo confirmacao="Só é possível excluir equipe sem nenhum histórico. Com histórico, desative.">
                              <input type="hidden" name="id" value={e.id} />
                            </FormularioAcao>
                          </div>
                        </div>
                      </Secao>
                    </div>
                  ) : null}
                </div>
              </Dobra>
            ))}
          </div>
        </Dobra>
      ))}
    </Pagina>
  );
}
