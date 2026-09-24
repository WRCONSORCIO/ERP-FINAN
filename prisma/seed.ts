import { PrismaClient } from '@prisma/client';
import { VIGENCIA_INICIO_PADRAO } from './carga-inicial';
import { semearCargaInicial } from './carga-seed';

/**
 * Seed idempotente: só cria o que não existe. Nunca altera regra já cadastrada
 * (depois da implantação, a fonte de verdade é o banco). Não cria clientes, vendedores nem usuários.
 */
const prisma = new PrismaClient();

async function main() {
  const inicio = process.env.CARGA_VIGENCIA_INICIO ?? VIGENCIA_INICIO_PADRAO;
  console.log(`Carga inicial com vigência a partir de ${inicio}`);
  await semearCargaInicial(prisma, inicio);
  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
