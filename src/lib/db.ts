import { PrismaClient, Prisma } from '@prisma/client';

const global = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : process.env.NODE_ENV === 'test' ? [] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/** Transação com tempo suficiente para lotes de importação/apuração. */
export function transacao<T>(fn: (tx: Tx) => Promise<T>, opcoes: { timeoutMs?: number } = {}): Promise<T> {
  return prisma.$transaction(fn, { timeout: opcoes.timeoutMs ?? 30_000, maxWait: 10_000 });
}
