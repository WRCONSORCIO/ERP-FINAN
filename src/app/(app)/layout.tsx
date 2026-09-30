import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { pode, ROTULO_PERFIL, type Recurso } from '@/lib/permissoes';
import { obterSessao } from '@/servidor/sessao';
import { contarVendedoresSemCadastro } from '@/servidor/consultas/vendedores';
import { BarraLateral, type ItemMenu } from '@/ui/barra-lateral';
import { classeBotao } from '@/ui/base';
import { Icone, type NomeIcone } from '@/ui/icones';
import { sair } from '../sessao/acoes';

export const dynamic = 'force-dynamic';

const MENU: Array<{ href: string; rotulo: string; icone: NomeIcone; grupo: string; recurso: Recurso }> = [
  { href: '/dashboard', rotulo: 'Dashboard', icone: 'dashboard', grupo: 'Visão geral', recurso: 'dashboard' },
  { href: '/ajuda', rotulo: 'Como usar', icone: 'info', grupo: 'Visão geral', recurso: 'dashboard' },
  { href: '/vendedores', rotulo: 'Vendedores', icone: 'vendedores', grupo: 'Comercial', recurso: 'vendedores' },
  { href: '/estrutura', rotulo: 'Estrutura', icone: 'estrutura', grupo: 'Comercial', recurso: 'equipes' },
  { href: '/clientes', rotulo: 'Carteira', icone: 'clientes', grupo: 'Carteira', recurso: 'cotas' },
  { href: '/bonus', rotulo: 'Bônus', icone: 'bonus', grupo: 'Carteira', recurso: 'bonus' },
  { href: '/a-pagar', rotulo: 'A Pagar', icone: 'aPagar', grupo: 'Financeiro', recurso: 'comissoes' },
  { href: '/estornos', rotulo: 'Estornos', icone: 'estornos', grupo: 'Financeiro', recurso: 'estornos' },
  { href: '/importacoes', rotulo: 'Importações', icone: 'importacoes', grupo: 'Operação', recurso: 'importacoes' },
  { href: '/configuracoes', rotulo: 'Configurações', icone: 'configuracoes', grupo: 'Operação', recurso: 'regras' },
  { href: '/acessos', rotulo: 'Acessos', icone: 'acessos', grupo: 'Administração', recurso: 'usuarios' },
  { href: '/auditoria', rotulo: 'Auditoria', icone: 'auditoria', grupo: 'Administração', recurso: 'auditoria' },
  { href: '/lgpd', rotulo: 'LGPD', icone: 'lgpd', grupo: 'Administração', recurso: 'usuarios' },
];

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await obterSessao();
  if (!s) redirect('/login?expirada=1');

  const [naoLidas, semCadastro, pendencias] = await Promise.all([
    prisma.notificacao.count({ where: { usuarioId: s.usuarioId, lidaEm: null } }),
    pode(s.perfil, 'vendedores', 'editar') ? contarVendedoresSemCadastro() : Promise.resolve(0),
    pode(s.perfil, 'importacoes') ? prisma.pendencia.count({ where: { resolvidaEm: null } }) : Promise.resolve(0),
  ]);

  const itens: ItemMenu[] = MENU.filter((m) => pode(s.perfil, m.recurso)).map((m) => ({
    href: m.href, rotulo: m.rotulo, icone: m.icone, grupo: m.grupo,
    ...(m.href === '/vendedores' && semCadastro > 0 ? { contador: semCadastro } : {}),
    ...(m.href === '/importacoes' && pendencias > 0 ? { contador: pendencias } : {}),
  }));

  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="sr-only z-50 rounded bg-wr-escuro px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Pular para o conteúdo
      </a>
      <BarraLateral itens={itens} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="nao-imprimir sticky top-0 z-30 border-b border-wr-borda bg-wr-superficie/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 py-2.5 pl-14 pr-4 lg:px-6">
            <form action="/busca" method="get" role="search" className="order-last flex w-full min-w-0 items-center gap-2 rounded-lg border border-wr-borda bg-wr-fundo px-3 sm:order-none sm:w-auto sm:flex-1 sm:max-w-md">
              <Icone nome="busca" tamanho={16} className="shrink-0 text-wr-texto-3" />
              <label htmlFor="busca-global" className="sr-only">Buscar cliente, vendedor, cota, contrato, CPF ou CNPJ</label>
              <input id="busca-global" name="q" type="search" placeholder="Buscar cliente, vendedor, grupo/cota, contrato, CPF/CNPJ…" className="min-h-9 w-full bg-transparent text-[13px] outline-none" />
            </form>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/notificacoes" className="relative inline-flex size-9 items-center justify-center rounded-lg border border-wr-borda text-wr-texto-2 hover:bg-wr-fundo" aria-label={`Notificações${naoLidas > 0 ? `: ${naoLidas} não lida(s)` : ''}`}>
                <Icone nome="sino" tamanho={17} />
                {naoLidas > 0 ? <span className="numero absolute -right-1 -top-1 rounded-full bg-wr-vermelho px-1 text-[10px] font-bold leading-4 text-white">{naoLidas > 99 ? '99+' : naoLidas}</span> : null}
              </Link>
              <Link href="/minha-conta" className="hidden items-center gap-1.5 rounded-full border border-wr-borda px-3 py-1.5 text-[12px] text-wr-texto no-underline hover:bg-wr-fundo md:inline-flex">
                <Icone nome="usuario" tamanho={14} className="text-wr-texto-3" />
                <span className="max-w-[180px] truncate">{s.email}</span>
                <span className="text-wr-texto-3">· {ROTULO_PERFIL[s.perfil].toLowerCase()}</span>
              </Link>
              <form action={sair}>
                <button type="submit" className={classeBotao('secundario')}>
                  <Icone nome="sair" tamanho={15} />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </form>
            </div>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 outline-none lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
