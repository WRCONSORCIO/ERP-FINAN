import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Suíte de INTEGRAÇÃO: PostgreSQL real (EXCLUDE, CHECK, triggers e unicidade só existem no banco).
 * Exige banco com "test" no nome e apaga todas as tabelas a cada teste — nunca rode contra produção.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/vazio.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/integration/global-setup.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
