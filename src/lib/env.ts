import { z } from 'zod';

const esquema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET precisa de pelo menos 32 caracteres'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

let cache: z.infer<typeof esquema> | null = null;

export function env() {
  if (cache) return cache;
  const r = esquema.safeParse(process.env);
  if (!r.success) {
    throw new Error('Variáveis de ambiente inválidas: ' + r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  cache = r.data;
  return cache;
}
