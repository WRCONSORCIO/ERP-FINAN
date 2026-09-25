import type { Prisma } from '@prisma/client';
import { ErroDePermissao } from '@/lib/erros';
import { pode, type Nivel, type PerfilCodigo, type Recurso } from '@/lib/permissoes';

/** Sessão já reconferida no banco. Os serviços recebem isto — nunca dados de sessão vindos do navegador. */
export interface Sessao {
  usuarioId: string;
  nome: string;
  email: string;
  perfil: PerfilCodigo;
  gerenciaId: string | null;
  equipeId: string | null;
  ip: string | null;
}

/** Autorização no servidor. Toda Server Action e todo serviço chamam isto antes de agir. */
export function exigir(sessao: Sessao | null, recurso: Recurso, nivel: Nivel = 'ver'): asserts sessao is Sessao {
  if (!sessao) throw new ErroDePermissao('Sessão expirada. Entre novamente.');
  if (!pode(sessao.perfil, recurso, nivel)) throw new ErroDePermissao();
}

// ------------------------------------------------------------------
// RECORTE DE VISIBILIDADE — entra na consulta ao banco (7.1).
// Gerente: própria gerência. Supervisor: própria equipe. Sem unidade: nada.
// ------------------------------------------------------------------

const NADA = '__sem_escopo__';

export type Recorte =
  | { tipo: 'TOTAL' }
  | { tipo: 'GERENCIA'; gerenciaId: string }
  | { tipo: 'EQUIPE'; equipeId: string }
  | { tipo: 'NENHUM' };

export function recorteDe(s: Sessao): Recorte {
  if (s.perfil === 'GERENTE') return s.gerenciaId ? { tipo: 'GERENCIA', gerenciaId: s.gerenciaId } : { tipo: 'NENHUM' };
  if (s.perfil === 'SUPERVISOR') return s.equipeId ? { tipo: 'EQUIPE', equipeId: s.equipeId } : { tipo: 'NENHUM' };
  return { tipo: 'TOTAL' };
}

/** Cotas: pelo recorte CONGELADO na venda. */
export function escopoCotas(s: Sessao): Prisma.CotaWhereInput {
  const r = recorteDe(s);
  switch (r.tipo) {
    case 'TOTAL': return {};
    case 'GERENCIA': return { snapGerenciaId: r.gerenciaId };
    case 'EQUIPE': return { snapEquipeId: r.equipeId };
    case 'NENHUM': return { id: NADA };
  }
}

/** Vendedores (documentos) com alguma alocação dentro do recorte. */
export function escopoVendedores(s: Sessao): Prisma.VendedorWhereInput {
  const r = recorteDe(s);
  switch (r.tipo) {
    case 'TOTAL': return {};
    case 'GERENCIA': return { alocacoes: { some: { equipe: { gerenciaId: r.gerenciaId } } } };
    case 'EQUIPE': return { alocacoes: { some: { equipeId: r.equipeId } } };
    case 'NENHUM': return { id: NADA };
  }
}

export function escopoGerencias(s: Sessao): Prisma.GerenciaWhereInput {
  const r = recorteDe(s);
  switch (r.tipo) {
    case 'TOTAL': return {};
    case 'GERENCIA': return { id: r.gerenciaId };
    case 'EQUIPE': return { equipes: { some: { id: r.equipeId } } };
    case 'NENHUM': return { id: NADA };
  }
}

export function escopoEquipes(s: Sessao): Prisma.EquipeWhereInput {
  const r = recorteDe(s);
  switch (r.tipo) {
    case 'TOTAL': return {};
    case 'GERENCIA': return { gerenciaId: r.gerenciaId };
    case 'EQUIPE': return { id: r.equipeId };
    case 'NENHUM': return { id: NADA };
  }
}

export function escopoComissoes(s: Sessao): Prisma.ComissaoApuradaWhereInput {
  const r = recorteDe(s);
  return r.tipo === 'TOTAL' ? {} : { cota: escopoCotas(s) };
}

export function escopoEstornos(s: Sessao): Prisma.EstornoWhereInput {
  const r = recorteDe(s);
  return r.tipo === 'TOTAL' ? {} : { cota: escopoCotas(s) };
}

/** Bônus: pela gerência atribuída (congelada na importação). */
export function escopoBonus(s: Sessao): Prisma.BonusIncentivoWhereInput {
  const r = recorteDe(s);
  switch (r.tipo) {
    case 'TOTAL': return {};
    case 'GERENCIA': return { gerenciaId: r.gerenciaId };
    case 'EQUIPE': return { equipeId: r.equipeId };
    case 'NENHUM': return { id: NADA };
  }
}

/** Pessoas visíveis: que tenham documento dentro do recorte ou comissão em cota do recorte. */
export function escopoPessoas(s: Sessao): Prisma.PessoaWhereInput {
  const r = recorteDe(s);
  if (r.tipo === 'TOTAL') return {};
  if (r.tipo === 'NENHUM') return { id: NADA };
  return { OR: [{ documentos: { some: escopoVendedores(s) } }, { comissoes: { some: { cota: escopoCotas(s) } } }] };
}
