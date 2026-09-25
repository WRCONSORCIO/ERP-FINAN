import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carrega .env.test (se existir) e RECUSA qualquer banco sem "test" no nome. */
export function carregarAmbienteDeTeste(): string {
  const arquivo = resolve(process.cwd(), '.env.test');
  if (existsSync(arquivo)) {
    for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/.exec(linha);
      if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2] ?? "";
    }
  }
  const url = process.env.DATABASE_URL ?? '';
  const nomeBanco = new URL(url.replace(/^postgres(ql)?:/, 'http:')).pathname.replace(/^\//, '');
  if (!/test/i.test(nomeBanco)) {
    throw new Error(`RECUSADO: a suíte de integração apaga tabelas e exige banco com "test" no nome (atual: "${nomeBanco}").`);
  }
  process.env.DIRECT_URL = process.env.DIRECT_URL || url;
  (process.env as Record<string, string>).NODE_ENV = 'test';
  return nomeBanco;
}
