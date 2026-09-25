import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { PERFIS } from './permissoes';

/** Conteúdo do token. É só um atalho: a cada tela a sessão é reconferida no banco. */
export const conteudoToken = z.object({
  sub: z.string().min(1),
  perfil: z.enum(PERFIS),
  gerenciaId: z.string().nullable(),
  equipeId: z.string().nullable(),
  v: z.number().int().positive(),
});
export type ConteudoToken = z.infer<typeof conteudoToken>;

export const COOKIE_SESSAO = 'wr_sessao';
export const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 10; // 10 horas (um dia de trabalho)

function chave(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET ausente ou curta demais');
  return new TextEncoder().encode(s);
}

export async function assinarToken(c: ConteudoToken): Promise<string> {
  return new SignJWT({ perfil: c.perfil, gerenciaId: c.gerenciaId, equipeId: c.equipeId, v: c.v })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.sub)
    .setIssuedAt()
    .setIssuer('erp-wr')
    .setAudience('erp-wr')
    .setExpirationTime(`${DURACAO_SESSAO_SEGUNDOS}s`)
    .sign(chave());
}

export async function lerToken(token: string | undefined): Promise<ConteudoToken | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave(), { issuer: 'erp-wr', audience: 'erp-wr', algorithms: ['HS256'] });
    const r = conteudoToken.safeParse(payload);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
