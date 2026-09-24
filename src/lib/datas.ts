/**
 * Datas de fato (venda, cancelamento, vigência) são DATAS, sem hora.
 * Representação interna: Date em meia-noite UTC — o mesmo que o Prisma devolve para @db.Date.
 * "Hoje" é sempre o dia civil em America/Sao_Paulo.
 */
const FUSO = 'America/Sao_Paulo';
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataUTC(ano: number, mes1a12: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1a12 - 1, dia));
}

export function hoje(agora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return deISO(partes) as Date;
}

export function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** AAAA-MM-DD → Date (UTC). Retorna null se inválida. */
export function deISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = dataUTC(ano, mes, dia);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d;
}

/** DD/MM/AAAA (ou DD/MM/AA, DD-MM-AAAA) → Date (UTC). Retorna null se inválida. */
export function deBR(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s.trim());
  if (!m) return deISO(s.trim().slice(0, 10));
  let ano = Number(m[3]);
  if (ano < 100) ano += 2000;
  const mes = Number(m[2]);
  const dia = Number(m[1]);
  const d = dataUTC(ano, mes, dia);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d;
}

export function formatarData(d: Date | null | undefined): string {
  if (!d) return '—';
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

export function formatarDataHora(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export function somarDias(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * 86_400_000);
}

export function diaAnterior(d: Date): Date {
  return somarDias(d, -1);
}

export function mesmoDia(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return a === b;
  return paraISO(a) === paraISO(b);
}

/** A vigência [de, ate] (inclusiva; ate nulo = aberta) contém a data? */
export function vigenteEm(data: Date, de: Date, ate: Date | null): boolean {
  const t = data.getTime();
  return de.getTime() <= t && (ate === null || ate.getTime() >= t);
}

// ---------------- Competência (mês) ----------------

export interface Periodo {
  de: Date; // inclusivo
  ate: Date; // inclusivo
  rotulo: string;
  competencia: string | null; // AAAA-MM quando o período é um mês cheio
}

export function competenciaDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodoDoMes(competencia: string): Periodo | null {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  const de = dataUTC(ano, mes, 1);
  const ate = diaAnterior(dataUTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 1 : mes + 1, 1));
  return { de, ate, rotulo: rotuloMesLongo(competencia), competencia };
}

export function deslocarCompetencia(competencia: string, meses: number): string {
  const [a, m] = competencia.split('-').map(Number) as [number, number];
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function rotuloMesCurto(competencia: string): string {
  const [a, m] = competencia.split('-');
  return `${MESES_CURTOS[Number(m) - 1] ?? '?'}/${(a ?? '').slice(2)}`;
}

export function rotuloMesLongo(competencia: string): string {
  const [a, m] = competencia.split('-');
  const nome = MESES_LONGOS[Number(m) - 1] ?? '?';
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${a}`;
}

/**
 * Lê o período dos parâmetros GET: ?mes=AAAA-MM ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD.
 * Sem parâmetro: mês corrente.
 */
export function periodoDosParametros(p: { mes?: string | undefined; de?: string | undefined; ate?: string | undefined }, agora = new Date()): Periodo {
  const de = deISO(p.de ?? null);
  const ate = deISO(p.ate ?? null);
  if (de && ate && de.getTime() <= ate.getTime()) {
    return { de, ate, rotulo: `${formatarData(de)} a ${formatarData(ate)}`, competencia: null };
  }
  if (p.mes) {
    const per = periodoDoMes(p.mes);
    if (per) return per;
  }
  return periodoDoMes(competenciaDe(hoje(agora))) as Periodo;
}

/** Fim exclusivo (para comparar com timestamps): dia seguinte ao "ate". */
export function fimExclusivo(p: Periodo): Date {
  return somarDias(p.ate, 1);
}
