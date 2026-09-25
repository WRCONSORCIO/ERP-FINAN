'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { competenciaDe, deslocarCompetencia, hoje, rotuloMesCurto } from '@/lib/datas';
import { Icone } from './icones';
import { IndicadorLink } from './indicador-link';

/** Navegação de mês (rótulo curto Set/26). Abre sempre no mês corrente; o período vai na URL (GET). */
export function SeletorDePeriodo() {
  const pathname = usePathname();
  const params = useSearchParams();
  const atual = params.get('mes') ?? competenciaDe(hoje());
  const livre = params.get('de') && params.get('ate');
  const hrefMes = (mes: string) => {
    const p = new URLSearchParams(params.toString());
    p.set('mes', mes);
    p.delete('de');
    p.delete('ate');
    p.delete('pagina');
    return `${pathname}?${p.toString()}`;
  };
  return (
    <div className="inline-flex items-center rounded-full border border-wr-borda bg-wr-superficie text-[13px]">
      <Link href={hrefMes(deslocarCompetencia(atual, -1))} className="inline-flex items-center gap-1 rounded-l-full px-2 py-1.5 text-wr-texto-2 hover:bg-wr-fundo" aria-label="Mês anterior">
        <Icone nome="esquerda" tamanho={15} />
        <IndicadorLink />
      </Link>
      <span className="numero flex items-center gap-1.5 px-1 font-semibold text-wr-texto">
        <span className="inline-block size-1.5 rounded-full bg-wr-verde" aria-hidden="true" />
        {livre ? 'Período livre' : rotuloMesCurto(atual)}
      </span>
      <Link href={hrefMes(deslocarCompetencia(atual, 1))} className="inline-flex items-center gap-1 rounded-r-full px-2 py-1.5 text-wr-texto-2 hover:bg-wr-fundo" aria-label="Próximo mês">
        <Icone nome="direita" tamanho={15} />
        <IndicadorLink />
      </Link>
    </div>
  );
}
