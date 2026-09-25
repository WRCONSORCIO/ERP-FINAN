import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Suíte UNITÁRIA: em memória, sem banco. */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/vazio.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
