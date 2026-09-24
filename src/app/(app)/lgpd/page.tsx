import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { formatarDataHora } from '@/lib/datas';
import { formatarDocumento, somenteDigitos } from '@/lib/documento';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { Aviso, Campo, EstadoVazio, Etiqueta, Pagina, Secao, classeBotao } from '@/ui/base';
import { FormularioAcao } from '@/ui/formulario-acao';
import { anonimizarAcao, concluirSolicitacaoAcao, registrarSolicitacaoAcao } from './acoes';

export const metadata: Metadata = { title: 'LGPD' };
export const dynamic = 'force-dynamic';

export default async function Lgpd({ searchParams }: { searchParams: Promise<Params> }) {
  await exigirPagina('usuarios', 'tudo');
  const sp = await searchParams;
  const titular = somenteDigitos(param(sp, 'titular'));
  const [solicitacoes, acessos, cotasTitular] = await Promise.all([
    prisma.solicitacaoTitular.findMany({ orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }], take: 100 }),
    prisma.acessoDadoPessoal.findMany({ orderBy: { criadoEm: 'desc' }, take: 100 }),
    titular.length >= 11 ? prisma.cota.findMany({ where: { cpfCliente: titular }, select: { id: true, clienteNome: true, grupo: true, cota: true, clienteEmail: true, clienteTelefone: true, anonimizadaEm: true } }) : Promise.resolve([]),
  ]);
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: [...new Set(acessos.map((a) => a.usuarioId))] } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  return (
    <Pagina titulo="LGPD" descricao="Registro de quem consultou dado pessoal, atendimento a pedidos de titular e anonimização de contato. Registros financeiros auditáveis não são apagados: há obrigação de retenção.">
      <Aviso tom="azul" titulo="Política adotada">Nome, CPF e valores de vendas com comissão ou estorno são mantidos (prova de registros financeiros). E-mail e telefone de vendas canceladas antigas podem ser anonimizados. Pedidos de exclusão são registrados e respondidos com a base legal de retenção quando aplicável. O prazo de retenção é decisão da WR.</Aviso>
      <Secao titulo="Consultar dados de um titular">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <Campo rotulo="CPF/CNPJ do titular" nome="titular"><input id="titular" name="titular" defaultValue={param(sp, 'titular')} className="campo numero w-56" /></Campo>
          <button type="submit" className={classeBotao('secundario')}>Consultar</button>
        </form>
        {titular ? (cotasTitular.length === 0 ? <p className="mt-2 text-[12px] text-wr-texto-3">Nenhuma cota para {formatarDocumento(titular)}.</p> : (
          <ul className="mt-3 space-y-1 text-[13px]">{cotasTitular.map((c) => <li key={c.id}><a href={`/clientes/${c.id}`}>{c.clienteNome}</a> · {c.grupo}/{c.cota} · {c.anonimizadaEm ? <Etiqueta>contato anonimizado</Etiqueta> : `${c.clienteEmail ?? '—'} · ${c.clienteTelefone ?? '—'}`}</li>)}</ul>
        )) : null}
      </Secao>
      <Secao titulo="Solicitações de titular" semPadding>
        <div className="p-4">
          <FormularioAcao acao={registrarSolicitacaoAcao} rotulo="Registrar solicitação">
            <div className="grid gap-2 sm:grid-cols-4">
              <Campo rotulo="Documento" nome="documento"><input id="documento" name="documento" className="campo numero" required /></Campo>
              <Campo rotulo="Nome" nome="nome"><input id="nome" name="nome" className="campo" required /></Campo>
              <Campo rotulo="Tipo" nome="tipo"><select id="tipo" name="tipo" className="campo"><option value="ACESSO">Acesso</option><option value="CORRECAO">Correção</option><option value="EXCLUSAO">Exclusão</option><option value="ANONIMIZACAO">Anonimização</option></select></Campo>
              <Campo rotulo="Descrição" nome="descricao"><input id="descricao" name="descricao" className="campo" required /></Campo>
            </div>
          </FormularioAcao>
        </div>
        {solicitacoes.length === 0 ? <EstadoVazio titulo="Nenhuma solicitação registrada" /> : (
          <div className="tabela-quadro"><table className="tabela">
            <thead><tr><th>Data</th><th>Titular</th><th>Tipo</th><th>Descrição</th><th>Situação</th><th>Resposta</th></tr></thead>
            <tbody>{solicitacoes.map((r) => (
              <tr key={r.id}>
                <td className="numero">{formatarDataHora(r.criadoEm)}</td><td>{r.nome}<span className="numero block text-[11px] text-wr-texto-3">{formatarDocumento(r.documento)}</span></td><td>{r.tipo}</td><td>{r.descricao}</td>
                <td>{r.status === 'ABERTA' ? <Etiqueta tom="ambar">aberta</Etiqueta> : <Etiqueta tom={r.status === 'ATENDIDA' ? 'verde' : 'neutro'}>{r.status.toLowerCase()}</Etiqueta>}</td>
                <td className="min-w-[280px]">{r.status === 'ABERTA' ? (
                  <FormularioAcao acao={concluirSolicitacaoAcao} rotulo="Concluir" emLinha>
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" aria-label="Resultado" className="campo w-32"><option value="ATENDIDA">atendida</option><option value="RECUSADA">recusada</option></select>
                    <input name="resposta" aria-label="Resposta" placeholder="Resposta / base legal" className="campo w-56" required />
                  </FormularioAcao>
                ) : r.resposta}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Secao>
      <Secao titulo="Anonimizar contato de vendas canceladas antigas" descricao="Apaga e-mail e telefone; mantém nome, CPF e valores (prova financeira).">
        <FormularioAcao acao={anonimizarAcao} rotulo="Anonimizar" perigo confirmacao="Irreversível: e-mail e telefone das vendas canceladas antes da data são apagados. A importação futura não os regrava.">
          <div className="grid max-w-xl gap-2 sm:grid-cols-2">
            <Campo rotulo="Canceladas antes de" nome="canceladasAntesDe"><input id="canceladasAntesDe" name="canceladasAntesDe" type="date" className="campo" required /></Campo>
            <Campo rotulo="Digite ANONIMIZAR" nome="confirmacao"><input id="confirmacao" name="confirmacao" className="campo" required /></Campo>
          </div>
        </FormularioAcao>
      </Secao>
      <Secao titulo="Últimas consultas a dado pessoal" semPadding>
        {acessos.length === 0 ? <EstadoVazio titulo="Nenhuma consulta registrada" /> : (
          <div className="tabela-quadro"><table className="tabela">
            <thead><tr><th>Data</th><th>Usuário</th><th>Registro</th><th>Finalidade</th></tr></thead>
            <tbody>{acessos.map((a) => <tr key={String(a.id)}><td className="numero">{formatarDataHora(a.criadoEm)}</td><td>{usuarios.get(a.usuarioId) ?? a.usuarioId}</td><td>{a.entidade} <a href={`/clientes/${a.entidadeId}`} className="numero text-[11px]">{a.entidadeId}</a></td><td>{a.finalidade}</td></tr>)}</tbody>
          </table></div>
        )}
      </Secao>
    </Pagina>
  );
}
