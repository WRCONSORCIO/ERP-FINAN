'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone, type NomeIcone } from './icones';
import { IndicadorLink } from './indicador-link';

export interface ItemMenu {
  href: string;
  rotulo: string;
  icone: NomeIcone;
  grupo: string;
  contador?: number;
}

function Marca({ recolhida }: { recolhida: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      {/* Monograma provisório: a especificação registra que ainda não há arquivo oficial da logo. Substituir por <img> quando houver. */}
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white text-[13px] font-bold tracking-tight text-white" aria-hidden="true">WR</span>
      {!recolhida ? (
        <span className="min-w-0 leading-tight">
          <span className="block whitespace-nowrap text-[15px] font-bold text-white">WR Consórcio</span>
          <span className="block text-[11px] text-white/70">ERP Financeiro</span>
        </span>
      ) : null}
    </div>
  );
}

function Navegacao({ itens, recolhida, aoNavegar }: { itens: ItemMenu[]; recolhida: boolean; aoNavegar?: () => void }) {
  const pathname = usePathname();
  const grupos = [...new Set(itens.map((i) => i.grupo))];
  return (
    <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-2 pb-4">
      {grupos.map((g) => (
        <div key={g} className="mt-3 first:mt-1">
          {!recolhida ? <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">{g}</p> : <div className="mx-3 my-2 border-t border-white/10" />}
          <ul className="space-y-0.5">
            {itens.filter((i) => i.grupo === g).map((i) => {
              const ativo = pathname === i.href || pathname.startsWith(i.href + '/');
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    prefetch={false}
                    {...(aoNavegar ? { onClick: aoNavegar } : {})}
                    aria-current={ativo ? 'page' : undefined}
                    title={recolhida ? i.rotulo : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold no-underline transition-colors ${
                      ativo ? 'bg-white/12 text-white ring-1 ring-white/15' : 'text-white/80 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <Icone nome={i.icone} tamanho={18} className="shrink-0" />
                    {!recolhida ? <span className="flex-1 truncate">{i.rotulo}</span> : null}
                    <IndicadorLink claro />
                    {i.contador && i.contador > 0 ? (
                      <span className={`numero rounded-full bg-wr-vermelho px-1.5 text-[10px] font-bold leading-4 text-white ${recolhida ? 'absolute ml-4 -mt-4' : ''}`}>
                        {i.contador > 999 ? '999+' : i.contador}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Menu lateral (desktop) que vira gaveta no celular. Esconder item aqui não é segurança: o servidor recusa de novo. */
export function BarraLateral({ itens }: { itens: ItemMenu[] }) {
  const [recolhida, setRecolhida] = useState(false);
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    try {
      setRecolhida(window.localStorage.getItem('menu:recolhido') === '1');
    } catch {
      /* ignora */
    }
  }, []);
  const alternar = () => {
    setRecolhida((r) => {
      try { window.localStorage.setItem('menu:recolhido', r ? '0' : '1'); } catch { /* ignora */ }
      return !r;
    });
  };
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} className="fixed left-3 top-3 z-40 inline-flex size-9 items-center justify-center rounded-lg bg-wr-escuro text-white lg:hidden" aria-label="Abrir menu">
        <Icone nome="menu" />
      </button>
      {aberta ? <div className="fixed inset-0 z-40 bg-wr-texto/40 lg:hidden" onClick={() => setAberta(false)} aria-hidden="true" /> : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-wr-escuro transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${aberta ? 'translate-x-0' : '-translate-x-full'} ${recolhida ? 'lg:w-[72px]' : 'lg:w-60'}`}
        aria-label="Navegação"
      >
        <div className="flex items-center justify-between border-b border-white/10">
          <Marca recolhida={recolhida} />
          <button type="button" onClick={() => setAberta(false)} className="mr-3 inline-flex size-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 lg:hidden" aria-label="Fechar menu">
            <Icone nome="fechar" />
          </button>
          <button type="button" onClick={alternar} className={`mr-3 hidden size-7 items-center justify-center rounded-lg border border-white/20 text-white/80 hover:bg-white/10 lg:inline-flex ${recolhida ? 'absolute left-[58px] top-5 bg-wr-escuro' : ''}`} aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}>
            <Icone nome={recolhida ? 'direita' : 'esquerda'} tamanho={14} />
          </button>
        </div>
        <Navegacao itens={itens} recolhida={recolhida} aoNavegar={() => setAberta(false)} />
        {!recolhida ? <p className="border-t border-white/10 px-4 py-3 text-[11px] text-white/50">WR Consórcio · uso interno</p> : null}
      </aside>
    </>
  );
}
