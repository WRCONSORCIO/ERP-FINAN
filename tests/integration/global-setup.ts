import { execSync } from 'node:child_process';
import { carregarAmbienteDeTeste } from './env';

export default function setup() {
  const banco = carregarAmbienteDeTeste();
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: process.env });
  console.warn(`[integração] migrations aplicadas em "${banco}"`);
}
