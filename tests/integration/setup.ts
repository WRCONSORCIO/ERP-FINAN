import { beforeEach, afterAll } from 'vitest';
import { carregarAmbienteDeTeste } from './env';

carregarAmbienteDeTeste();

const { prisma } = await import('@/lib/db');

/** Apaga TODAS as tabelas antes de cada teste (TRUNCATE ignora os gatilhos append-only, de propósito, só aqui). */
beforeEach(async () => {
  const banco = (await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`)[0]?.db ?? '';
  if (!/test/i.test(banco)) throw new Error(`RECUSADO: banco "${banco}" não é de teste.`);
  const tabelas = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tabelas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
