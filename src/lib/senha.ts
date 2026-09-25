import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

export const CUSTO_BCRYPT = 12;
export const SENHA_MINIMA = 10;

export function validarSenha(senha: string): string | null {
  if (senha.length < SENHA_MINIMA) return `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  return null;
}

export function gerarHash(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// Hash de referência (custo 12) para igualar o tempo de resposta quando o e-mail não existe.
let hashFalso: Promise<string> | null = null;
export function hashParaTempoConstante(): Promise<string> {
  hashFalso ??= bcrypt.hash(randomBytes(16).toString('hex'), CUSTO_BCRYPT);
  return hashFalso;
}

/** Senha provisória legível (entregue em mãos pelo administrador; exibida uma única vez). */
export function gerarSenhaProvisoria(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(14);
  let s = '';
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return `${s.slice(0, 4)}-${s.slice(4, 9)}-${s.slice(9)}`;
}
