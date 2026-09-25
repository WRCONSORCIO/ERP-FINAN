import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { formatarDataHora } from '@/lib/datas';
import { MATRIZ, PERFIS, RECURSOS, ROTULO_PERFIL, ROTULO_RECURSO, type PerfilCodigo } from '@/lib/permissoes';
import { exigirPagina } from '@/servidor/sessao';
import { Campo, Cartao, Etiqueta, Monograma, Pagina, Secao, Traco } from '@/ui/base';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import { alterarUsuarioAcao, ativoUsuarioAcao, criarUsuarioAcao, redefinirSenhaAcao } from './acoes';

export const metadata: Metadata = { title: 'Acessos' };
export const dynamic = 'force-dynamic';

function CamposEscopo({ gerencias, equipes, perfil, gerenciaId, equipeId, sufixo }: { gerencias: Array<{ id: string; nome: string }>; equipes: Array<{ id: string; nome: string; gerencia: { nome: string } }>; perfil?: string; gerenciaId?: string | null; equipeId?: string | null; sufixo: string }) {
  return (
    <>
      <Campo rotulo="Perfil" nome={`perfil-${sufixo}`}>
        <select id={`perfil-${sufixo}`} name="perfil" defaultValue={perfil ?? 'FINANCEIRO'} className="campo">{PERFIS.map((p) => <option key={p} value={p}>{ROTULO_PERFIL[p]}</option>)}</select>
      </Campo>
      <Campo rotulo="Gerência (só gerente)" nome={`g-${sufixo}`}>
        <select id={`g-${sufixo}`} name="gerenciaId" defaultValue={gerenciaId ?? ''} className="campo"><option value="">—</option>{gerencias.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
      </Campo>
      <Campo rotulo="Equipe (só supervisor)" nome={`e-${sufixo}`}>
        <select id={`e-${sufixo}`} name="equipeId" defaultValue={equipeId ?? ''} className="campo"><option value="">—</option>{equipes.map((e) => <option key={e.id} value={e.id}>{e.gerencia.nome} › {e.nome}</option>)}</select>
      </Campo>
    </>
  );
}

export default async function Acessos() {
  await exigirPagina('usuarios', 'tudo');
  const [usuarios, gerencias, equipes] = await Promise.all([
    prisma.usuario.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }], select: { id: true, nome: true, email: true, perfil: true, ativo: true, ultimoAcesso: true, gerencia: { select: { id: true, nome: true } }, equipe: { select: { id: true, nome: true } }, gerenciaId: true, equipeId: true } }),
    prisma.gerencia.findMany({ where: { status: 'ATIVO' }, orderBy: { nome: 'asc' } }),
    prisma.equipe.findMany({ where: { status: 'ATIVO' }, include: { gerencia: true }, orderBy: { nome: 'asc' } }),
  ]);
  const ativos = usuarios.filter((u) => u.ativo);
  const admins = ativos.filter((u) => u.perfil === 'ADMINISTRADOR').length;
  const nunca = usuarios.filter((u) => !u.ultimoAcesso).length;
  const enxerga = (u: (typeof usuarios)[number]) =>
    u.perfil === 'GERENTE' ? (u.gerencia ? `gerência ${u.gerencia.nome}` : 'nada (sem gerência vinculada)')
      : u.perfil === 'SUPERVISOR' ? (u.equipe ? `equipe ${u.equipe.nome}` : 'nada (sem equipe vinculada)') : 'tudo';

  return (
    <Pagina titulo="Acessos" descricao="Uma ficha por pessoa; mexer fica atrás de “gerenciar”. Sem recuperação automática de senha: o administrador redefine e entrega em mãos — a senha aparece uma única vez.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao destaque rotulo="Acessos ativos" valor={ativos.length} />
        <Cartao rotulo="Administradores ativos" valor={admins} tom={admins <= 1 ? 'ambar' : 'verde'} detalhe={admins <= 1 ? 'O sistema recusa desativar ou rebaixar o último' : undefined} />
        <Cartao rotulo="Nunca entraram" valor={nunca} tom={nunca > 0 ? 'azul' : 'neutro'} />
      </div>
      <Dobra chave="acessos-criar" titulo="Criar acesso">
        <div className="p-4">
          <FormularioAcao acao={criarUsuarioAcao} rotulo="Criar acesso">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Campo rotulo="Nome" nome="nome-novo"><input id="nome-novo" name="nome" className="campo" required /></Campo>
              <Campo rotulo="E-mail" nome="email-novo"><input id="email-novo" name="email" type="email" className="campo" required /></Campo>
              <CamposEscopo gerencias={gerencias} equipes={equipes} sufixo="novo" />
            </div>
          </FormularioAcao>
        </div>
      </Dobra>
      <Secao titulo="Fichas" semPadding>
        <ul className="divide-y divide-wr-borda">
          {usuarios.map((u) => (
            <li key={u.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <Monograma nome={u.nome} tamanho={34} />
              <div className="min-w-[220px] flex-1">
                <p className="font-semibold">{u.nome} {u.ativo ? null : <Etiqueta tom="vermelho">desativado</Etiqueta>}</p>
                <p className="text-[12px] text-wr-texto-2">{u.email} · <strong>{ROTULO_PERFIL[u.perfil as PerfilCodigo]}</strong> · enxerga {enxerga(u)}</p>
                <p className="text-[11px] text-wr-texto-3">Último acesso: {u.ultimoAcesso ? formatarDataHora(u.ultimoAcesso) : 'nunca entrou'}</p>
              </div>
              <details className="w-full sm:w-auto">
                <summary className="cursor-pointer text-[12px] font-semibold text-wr-verde">Gerenciar</summary>
                <div className="mt-2 space-y-3 rounded-lg border border-wr-borda p-3">
                  <FormularioAcao acao={alterarUsuarioAcao} rotulo="Salvar alteração" confirmacao="A mudança vale na próxima tela que a pessoa abrir.">
                    <input type="hidden" name="id" value={u.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Campo rotulo="Nome" nome={`nome-${u.id}`}><input id={`nome-${u.id}`} name="nome" defaultValue={u.nome} className="campo" /></Campo>
                      <CamposEscopo gerencias={gerencias} equipes={equipes} perfil={u.perfil} gerenciaId={u.gerenciaId} equipeId={u.equipeId} sufixo={u.id} />
                    </div>
                  </FormularioAcao>
                  <div className="flex flex-wrap gap-2">
                    <FormularioAcao acao={redefinirSenhaAcao} rotulo="Trocar senha" perigo confirmacao="Gera uma senha provisória (exibida uma única vez) e encerra as sessões abertas desta pessoa.">
                      <input type="hidden" name="id" value={u.id} />
                    </FormularioAcao>
                    <FormularioAcao acao={ativoUsuarioAcao} rotulo={u.ativo ? 'Desativar' : 'Reativar'} perigo={u.ativo} confirmacao={u.ativo ? 'A pessoa perde o acesso na próxima tela. O histórico fica.' : 'A pessoa volta a acessar com a senha atual.'}>
                      <input type="hidden" name="id" value={u.id} />{u.ativo ? null : <input type="hidden" name="ativo" value="true" />}
                    </FormularioAcao>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Secao>
      <Secao titulo="Matriz de permissões" descricao="ver lê · editar inclui criar · tudo inclui desfazer um fato já registrado. Célula vazia é sem acesso nenhum — o padrão é negar." semPadding>
        <div className="tabela-quadro">
          <table className="tabela">
            <thead><tr><th>Área</th>{PERFIS.map((p) => <th key={p}>{ROTULO_PERFIL[p]}</th>)}</tr></thead>
            <tbody>{RECURSOS.map((r) => <tr key={r}><td className="font-semibold">{ROTULO_RECURSO[r]}</td>{PERFIS.map((p) => <td key={p}>{MATRIZ[r][p] ? <Etiqueta tom={MATRIZ[r][p] === 'tudo' ? 'verde' : MATRIZ[r][p] === 'editar' ? 'azul' : 'neutro'}>{MATRIZ[r][p]}</Etiqueta> : <Traco />}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Secao>
    </Pagina>
  );
}
