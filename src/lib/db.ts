import { PrismaClient, Prisma } from '@prisma/client';

const global = globalThis as unknown as { __prisma?: PrismaClient };

/**
 * O pooler de transações da Supabase (porta 6543) não aceita prepared statements reutilizados:
 * sem `pgbouncer=true` a primeira consulta funciona e as seguintes quebram. Acrescenta o parâmetro
 * (e connection_limit=1, adequado a funções serverless) quando faltam.
 */
export function urlDoBanco(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.port === '6543') {
      if (!u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true');
      if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '1');
      return u.toString();
    }
  } catch {
    return url;
  }
  return url;
}

const urlAjustada = urlDoBanco(process.env.DATABASE_URL);

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    ...(urlAjustada ? { datasourceUrl: urlAjustada } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : process.env.NODE_ENV === 'test' ? [] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/** Transação com tempo suficiente para lotes de importação/apuração. */
export function transacao<T>(fn: (tx: Tx) => Promise<T>, opcoes: { timeoutMs?: number } = {}): Promise<T> {
  return prisma.$transaction(fn, { timeout: opcoes.timeoutMs ?? 30_000, maxWait: 10_000 });
}
