import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatarMoeda, formatarPercentual, type EntradaDecimal } from '@/lib/dinheiro';
import { formatarData } from '@/lib/datas';
import { hashEstavel, iniciais } from '@/lib/texto';
import { Icone, type NomeIcone } from './icones';

export type Tom = 'verde' | 'ambar' | 'vermelho' | 'azul' | 'neutro';

const TOM_ETIQUETA: Record<Tom, string> = {
  verde: 'bg-wr-verde-claro text-wr-verde border-wr-verde/20',
  ambar: 'bg-wr-ambar-claro text-wr-ambar border-wr-ambar/25',
  vermelho: 'bg-wr-vermelho-claro text-wr-vermelho border-wr-vermelho/20',
  azul: 'bg-wr-azul-claro text-wr-azul border-wr-azul/20',
  neutro: 'bg-wr-fundo text-wr-texto-2 border-wr-borda',
};
const TOM_BORDA: Record<Tom, string> = {
  verde: 'border-l-wr-verde', ambar: 'border-l-wr-ambar', vermelho: 'border-l-wr-vermelho', azul: 'border-l-wr-azul', neutro: 'border-l-wr-borda-forte',
};
const TOM_TEXTO: Record<Tom, string> = {
  verde: 'text-wr-verde', ambar: 'text-wr-ambar', vermelho: 'text-wr-vermelho', azul: 'text-wr-azul', neutro: 'text-wr-texto',
};
const TOM_PONTO: Record<Tom, string> = {
  verde: 'bg-wr-verde', ambar: 'bg-wr-ambar', vermelho: 'bg-wr-vermelho', azul: 'bg-wr-azul', neutro: 'bg-wr-texto-3',
};

/** Invólucro de toda tela: um h1, a explicação do que a tela decide, e as ações. */
export function Pagina({ titulo, descricao, acoes, children }: { titulo: string; descricao: ReactNode; acoes?: ReactNode | undefined; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold leading-tight text-wr-texto">{titulo}</h1>
          <p className="mt-0.5 max-w-3xl text-[13px] text-wr-texto-2">{descricao}</p>
        </div>
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
      </header>
      {children}
    </div>
  );
}

/** Bloco de conteúdo: título pequeno (é rótulo, não anúncio) e explicação. */
export function Secao({ titulo, descricao, acoes, children, id, semPadding }: { titulo: string; descricao?: ReactNode | undefined; acoes?: ReactNode | undefined; children: ReactNode; id?: string | undefined; semPadding?: boolean  | undefined}) {
  return (
    <section id={id} className="cartao min-w-0 scroll-mt-20">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-wr-borda px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-wr-texto">{titulo}</h2>
          {descricao ? <p className="mt-0.5 text-[12px] text-wr-texto-2">{descricao}</p> : null}
        </div>
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
      </div>
      <div className={semPadding ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

/** Indicador numérico: borda esquerda de 4px na cor do tom; valor 24px bold mono. O primeiro pode receber destaque verde. */
export function Cartao({ rotulo, valor, detalhe, tom = 'neutro', destaque, href }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode | undefined; tom?: Tom | undefined; destaque?: boolean | undefined; href?: string  | undefined}) {
  const corpo = (
    <div
      className={
        destaque
          ? 'h-full rounded-xl bg-wr-escuro p-4 text-white shadow-[0_2px_8px_rgb(10_75_58/0.25)]'
          : `cartao h-full border-l-4 ${TOM_BORDA[tom]} p-4`
      }
    >
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${destaque ? 'text-white/80' : 'text-wr-texto-3'}`}>
        <span className={`inline-block size-1.5 rounded-full ${destaque ? 'bg-white/80' : TOM_PONTO[tom]}`} aria-hidden="true" />
        {rotulo}
      </div>
      <div className={`numero mt-1.5 text-[24px] font-bold leading-tight ${destaque ? 'text-white' : TOM_TEXTO[tom]}`}>{valor}</div>
      {detalhe ? <div className={`mt-1 text-[12px] ${destaque ? 'text-white/80' : 'text-wr-texto-2'}`}>{detalhe}</div> : null}
    </div>
  );
  return href ? <Link href={href} className="block h-full no-underline hover:opacity-95">{corpo}</Link> : corpo;
}

export function GradeCartoes({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">{children}</div>;
}

export function Etiqueta({ tom = 'neutro', children, titulo }: { tom?: Tom | undefined; children: ReactNode; titulo?: string  | undefined}) {
  return (
    <span title={titulo} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TOM_ETIQUETA[tom]}`}>
      {children}
    </span>
  );
}

export function Dinheiro({ valor, tom, forte }: { valor: EntradaDecimal | null | undefined; tom?: Tom | undefined; forte?: boolean  | undefined}) {
  return <span className={`numero ${tom ? TOM_TEXTO[tom] : ''} ${forte ? 'font-semibold' : ''}`}>{formatarMoeda(valor)}</span>;
}

export function Percentual({ valor }: { valor: EntradaDecimal | null | undefined }) {
  return <span className="numero">{formatarPercentual(valor)}</span>;
}

export function DataCurta({ valor }: { valor: Date | null | undefined }) {
  return <span className="numero">{formatarData(valor)}</span>;
}

export function Numero({ children }: { children: ReactNode }) {
  return <span className="numero">{children}</span>;
}

/** Iniciais em círculo com cor estável derivada do nome (só tons da paleta). */
export function Monograma({ nome, tamanho = 28 }: { nome: string | null | undefined; tamanho?: number }) {
  const tons = ['bg-wr-escuro text-white', 'bg-wr-verde text-white', 'bg-wr-azul text-white', 'bg-wr-escuro-2 text-white', 'bg-wr-verde-claro text-wr-escuro', 'bg-wr-azul-claro text-wr-azul'];
  const tom = tons[hashEstavel(nome ?? '') % tons.length];
  return (
    <span aria-hidden="true" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.4) }} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tom}`}>
      {iniciais(nome)}
    </span>
  );
}

export function BarraProgresso({ pct, tom = 'verde', rotulo }: { pct: number; tom?: Tom | undefined; rotulo: string }) {
  const largura = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-wr-fundo" role="progressbar" aria-valuenow={Math.round(largura)} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
      <div className={`h-full rounded-full ${TOM_PONTO[tom]}`} style={{ width: `${largura}%` }} />
    </div>
  );
}

export function EstadoVazio({ titulo, children, icone = 'info' }: { titulo: string; children?: ReactNode; icone?: NomeIcone  | undefined}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
      <Icone nome={icone} tamanho={22} className="text-wr-texto-3" />
      <p className="text-[13px] font-semibold text-wr-texto-2">{titulo}</p>
      {children ? <div className="max-w-md text-[12px] text-wr-texto-3">{children}</div> : null}
    </div>
  );
}

export function Aviso({ tom = 'azul', titulo, children }: { tom?: Tom | undefined; titulo?: string | undefined; children: ReactNode }) {
  const icone: NomeIcone = tom === 'vermelho' || tom === 'ambar' ? 'alerta' : tom === 'verde' ? 'ok' : 'info';
  return (
    <div role={tom === 'vermelho' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border px-3 py-2 text-[13px] ${TOM_ETIQUETA[tom]}`}>
      <Icone nome={icone} tamanho={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        <div className="text-wr-texto-2">{children}</div>
      </div>
    </div>
  );
}

const BOTAO: Record<'primario' | 'secundario' | 'perigo' | 'fantasma', string> = {
  primario: 'bg-wr-escuro text-white hover:bg-wr-escuro-2 border-transparent',
  secundario: 'bg-wr-superficie text-wr-texto border-wr-borda-forte hover:bg-wr-fundo',
  perigo: 'bg-wr-vermelho text-white border-transparent hover:opacity-90',
  fantasma: 'bg-transparent text-wr-texto-2 border-transparent hover:bg-wr-fundo',
};

export function classeBotao(v: keyof typeof BOTAO = 'secundario', pequeno = false) {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pequeno ? 'min-h-7 px-2.5 text-[12px]' : 'min-h-9 px-3.5 text-[13px]'} ${BOTAO[v]}`;
}

export function LinkBotao({ href, children, variante = 'secundario', pequeno, icone, download }: { href: string; children: ReactNode; variante?: keyof typeof BOTAO | undefined; pequeno?: boolean | undefined; icone?: NomeIcone | undefined; download?: boolean  | undefined}) {
  if (download) {
    return (
      <a href={href} className={classeBotao(variante, pequeno)} download>
        {icone ? <Icone nome={icone} tamanho={15} /> : null}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classeBotao(variante, pequeno)}>
      {icone ? <Icone nome={icone} tamanho={15} /> : null}
      {children}
    </Link>
  );
}

export function Campo({ rotulo, nome, children, erro, ajuda, className }: { rotulo: string; nome: string; children: ReactNode; erro?: string | undefined | undefined; ajuda?: ReactNode | undefined; className?: string  | undefined}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <label htmlFor={nome} className="rotulo mb-1 block">{rotulo}</label>
      {children}
      {erro ? <p className="mt-1 text-[12px] text-wr-vermelho">{erro}</p> : ajuda ? <p className="mt-1 text-[11px] text-wr-texto-3">{ajuda}</p> : null}
    </div>
  );
}

/** Célula nula nunca vira "null"/"undefined": vira travessão. */
export function Traco() {
  return <span className="text-wr-texto-3">—</span>;
}
