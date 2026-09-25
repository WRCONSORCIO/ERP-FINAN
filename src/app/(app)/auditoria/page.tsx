import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { formatarDataHora } from '@/lib/datas';
import { ACOES, filtroAuditoria } from '@/servidor/consultas/auditoria';
import { exigirPagina } from '@/servidor/sessao';
import { paginaDe, param, POR_PAGINA, type Params } from '@/servidor/consultas/comum';
import { Campo, EstadoVazio, Etiqueta, LinkBotao, Pagina, Secao, Traco, classeBotao } from '@/ui/base';
import { Paginacao, queryDe } from '@/ui/paginacao';
import { Bloco } from '@/ui/memoria';

export const metadata: Metadata = { title: 'Auditoria' };
export const dynamic = 'force-dynamic';

/** Antes/depois legíveis: chave → valor, ausente vira travessão (nunca "null"). */
function Json({ v }: { v: Prisma.JsonValue | null }) {
  if (v === null || v === undefined) return <Traco />;
  if (typeof v !== 'object' || Array.isArray(v)) return <span className="numero text-[12px]">{Array.isArray(v) ? v.join(', ') : String(v)}</span>;
  return <div className="max-h-56 max-w-[420px] overflow-auto"><Bloco dados={v as Record<string, unknown>} /></div>;
}

export default async function Auditoria({ searchParams }: { searchParams: Promise<Params> }) {
  await exigirPagina('auditoria');
  const sp = await searchParams;
  const pagina = paginaDe(sp);
  const where = filtroAuditoria(sp);
  const [total, linhas, usuarios, entidades] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA, include: { usuario: { select: { nome: true } } } }),
    prisma.usuario.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['entidade'], select: { entidade: true }, orderBy: { entidade: 'asc' } }),
  ]);
  return (
    <Pagina
      titulo="Auditoria"
      descricao="Quem fez o quê, com os dados antes e depois — gravado na mesma transação do fato. Responde “quem mudou este percentual e quando?” sem consulta direta ao banco."
      acoes={<LinkBotao href={`/exportar/auditoria${queryDe(sp, { pagina: null })}`} icone="download" download>Exportar</LinkBotao>}
    >
      <form method="get" className="cartao grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-7">
        <Campo rotulo="De" nome="de"><input id="de" name="de" type="date" defaultValue={param(sp, 'de')} className="campo" /></Campo>
        <Campo rotulo="Até" nome="ate"><input id="ate" name="ate" type="date" defaultValue={param(sp, 'ate')} className="campo" /></Campo>
        <Campo rotulo="Usuário" nome="usuario"><select id="usuario" name="usuario" defaultValue={param(sp, 'usuario')} className="campo"><option value="">Todos</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></Campo>
        <Campo rotulo="Ação" nome="acao"><select id="acao" name="acao" defaultValue={param(sp, 'acao')} className="campo"><option value="">Todas</option>{ACOES.map((a) => <option key={a} value={a}>{a}</option>)}</select></Campo>
        <Campo rotulo="Entidade" nome="entidade"><select id="entidade" name="entidade" defaultValue={param(sp, 'entidade')} className="campo"><option value="">Todas</option>{entidades.map((e) => <option key={e.entidade} value={e.entidade}>{e.entidade}</option>)}</select></Campo>
        <Campo rotulo="Registro (id)" nome="registro"><input id="registro" name="registro" defaultValue={param(sp, 'registro')} className="campo numero" /></Campo>
        <div className="flex items-end gap-2"><button type="submit" className={classeBotao('primario')}>Filtrar</button><LinkBotao href="/auditoria" variante="fantasma">Limpar</LinkBotao></div>
      </form>
      <Secao titulo={`${total.toLocaleString('pt-BR')} registro(s)`} semPadding>
        {linhas.length === 0 ? <EstadoVazio titulo="Nenhum registro neste filtro" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Antes</th><th>Depois</th><th>Contexto</th></tr></thead>
              <tbody>
                {linhas.map((a) => (
                  <tr key={String(a.id)} className="align-top">
                    <td className="numero whitespace-nowrap">{formatarDataHora(a.criadoEm)}</td>
                    <td>{a.usuario?.nome ?? a.email ?? 'sistema'}{a.ip ? <span className="numero block text-[11px] text-wr-texto-3">{a.ip}</span> : null}</td>
                    <td><Etiqueta tom={a.acao.startsWith('LOGIN_') ? 'vermelho' : a.acao === 'ALTERACAO_REGRA' ? 'ambar' : 'neutro'}>{a.acao}</Etiqueta></td>
                    <td>{a.entidade}{a.entidadeId ? <span className="numero block text-[11px] text-wr-texto-3">{a.entidadeId}</span> : null}</td>
                    <td><Json v={a.antes} /></td>
                    <td><Json v={a.depois} /></td>
                    <td><Json v={a.contexto} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao caminho="/auditoria" params={sp} pagina={pagina} total={total} porPagina={POR_PAGINA} />
      </Secao>
    </Pagina>
  );
}
