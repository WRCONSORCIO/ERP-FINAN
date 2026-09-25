import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatarDataHora } from '@/lib/datas';
import { obterSessao } from '@/servidor/sessao';
import { EstadoVazio, Etiqueta, Pagina, Secao, classeBotao } from '@/ui/base';
import { marcarLidaAcao, marcarTodasAcao } from './acoes';

export const metadata: Metadata = { title: 'Notificações' };
export const dynamic = 'force-dynamic';

export default async function Notificacoes() {
  const s = await obterSessao();
  if (!s) redirect('/login');
  const lista = await prisma.notificacao.findMany({ where: { usuarioId: s.usuarioId }, orderBy: [{ lidaEm: { sort: 'desc', nulls: 'first' } }, { criadoEm: 'desc' }], take: 200 });
  const naoLidas = lista.filter((n) => !n.lidaEm).length;
  return (
    <Pagina
      titulo="Notificações"
      descricao="Avisos que ficam até alguém ler: meta atingida, venda sem comissão, arquivo com diferença, erro de importação, login bloqueado."
      acoes={naoLidas > 0 ? <form action={marcarTodasAcao}><button type="submit" className={classeBotao('secundario')}>Marcar todas como lidas</button></form> : null}
    >
      <Secao titulo={`${naoLidas} não lida(s)`} semPadding>
        {lista.length === 0 ? <EstadoVazio titulo="Nenhuma notificação" icone="ok" /> : (
          <ul className="divide-y divide-wr-borda">
            {lista.map((n) => (
              <li key={n.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 ${n.lidaEm ? 'opacity-65' : ''}`}>
                <Etiqueta tom={n.severidade === 'CRITICA' ? 'vermelho' : n.severidade === 'ATENCAO' ? 'ambar' : 'azul'}>{n.severidade === 'CRITICA' ? 'crítica' : n.severidade === 'ATENCAO' ? 'atenção' : 'info'}</Etiqueta>
                <div className="min-w-[220px] flex-1">
                  <p className="font-semibold">{n.link ? <Link href={n.link}>{n.titulo}</Link> : n.titulo}</p>
                  <p className="text-[12px] text-wr-texto-2">{n.mensagem}</p>
                  <p className="numero text-[11px] text-wr-texto-3">{formatarDataHora(n.criadoEm)}{n.lidaEm ? ` · lida em ${formatarDataHora(n.lidaEm)}` : ''}</p>
                </div>
                {!n.lidaEm ? <form action={marcarLidaAcao}><input type="hidden" name="id" value={n.id} /><button type="submit" className={classeBotao('fantasma', true)}>Marcar lida</button></form> : null}
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </Pagina>
  );
}
