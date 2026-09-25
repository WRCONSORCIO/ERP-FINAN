import { formatarMoedaCompacta, formatarMoeda, ZERO, type Dec } from '@/lib/dinheiro';
import { rotuloMesCurto } from '@/lib/datas';

/**
 * Série de 12 meses em barras (uma cor, uma pergunta: a produção está subindo?).
 * Altura das barras é só geometria de exibição; os valores exibidos vêm de Decimal formatado.
 */
export function GraficoBarras({ serie, destaque }: { serie: Array<{ competencia: string; valor: Dec }>; destaque: string }) {
  const max = serie.reduce<Dec>((m, x) => (x.valor.gt(m) ? x.valor : m), ZERO);
  const L = 1200;
  const A = 150;
  const larg = L / Math.max(serie.length, 1);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${L} ${A + 28}`} className="h-auto w-full max-w-5xl" role="img" aria-label="Produção dos últimos 12 meses">
        <line x1="0" x2={L} y1={A} y2={A} className="stroke-wr-borda" />
        {serie.map((x, i) => {
          const h = !max.isZero() ? Number(x.valor.dividedBy(max).times(A - 18).toFixed(2)) : 0;
          const atual = x.competencia === destaque;
          return (
            <g key={x.competencia}>
              <title>{`${rotuloMesCurto(x.competencia)}: ${formatarMoeda(x.valor)}`}</title>
              <rect x={i * larg + larg * 0.18} y={A - h} width={larg * 0.64} height={Math.max(h, 0)} rx="3" className={atual ? 'fill-wr-escuro' : 'fill-wr-verde/55'} />
              {atual && h > 0 ? <text x={i * larg + larg / 2} y={A - h - 5} textAnchor="middle" className="fill-wr-texto text-[10px] font-semibold">{formatarMoedaCompacta(x.valor)}</text> : null}
              <text x={i * larg + larg / 2} y={A + 18} textAnchor="middle" className={`text-[11px] ${atual ? 'fill-wr-texto font-semibold' : 'fill-wr-texto-3'}`}>{rotuloMesCurto(x.competencia)}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
