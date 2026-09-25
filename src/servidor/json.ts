import type { Prisma } from '@prisma/client';

/** Serializa para JSON de auditoria/memória: Decimal e BigInt viram texto, Date vira ISO. */
export function paraJson(valor: unknown): Prisma.InputJsonValue | null {
  if (valor === null || valor === undefined) return null;
  return JSON.parse(
    JSON.stringify(valor, (_k, v: unknown) => {
      if (typeof v === 'bigint') return v.toString();
      if (v && typeof v === 'object' && 'toFixed' in v && 'd' in v && 'e' in v) return (v as { toString(): string }).toString();
      return v;
    }),
  ) as Prisma.InputJsonValue;
}

const CAMPOS_OMITIDOS = new Set(['senhaHash']);

/** Remove campos sensíveis antes de gravar "antes/depois". */
export function semSegredos<T extends Record<string, unknown>>(obj: T | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!CAMPOS_OMITIDOS.has(k)) saida[k] = v;
  return saida;
}
