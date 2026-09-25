import type { Periodo } from '@/lib/datas';
import { classeBotao } from './base';

/** Período livre por GET (de/até). O mês continua sendo o atalho padrão no seletor. */
export function FormularioPeriodoLivre({ periodo, extras = {} }: { periodo: Periodo; extras?: Record<string, string> }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2 text-[12px]">
      {Object.entries(extras).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="flex flex-col gap-0.5"><span className="rotulo">De</span><input type="date" name="de" defaultValue={periodo.de.toISOString().slice(0, 10)} className="campo w-36" /></label>
      <label className="flex flex-col gap-0.5"><span className="rotulo">Até</span><input type="date" name="ate" defaultValue={periodo.ate.toISOString().slice(0, 10)} className="campo w-36" /></label>
      <button type="submit" className={classeBotao('secundario', true)}>Aplicar período</button>
    </form>
  );
}
