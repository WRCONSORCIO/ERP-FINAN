/**
 * Matriz de permissões — seção 07 da especificação.
 * Três níveis: ver lê · editar inclui criar · tudo inclui desfazer um fato já registrado.
 * Célula ausente = SEM ACESSO. Padrão é negar: um recurso novo não abre acesso a ninguém.
 */
export const PERFIS = ['ADMINISTRADOR', 'FINANCEIRO', 'CADASTRO', 'GERENTE', 'SUPERVISOR'] as const;
export type PerfilCodigo = (typeof PERFIS)[number];

export const RECURSOS = [
  'dashboard', 'vendedores', 'equipes', 'gerencias', 'cotas', 'transferencias', 'comissoes',
  'estornos', 'bonus', 'lancamentos', 'importacoes', 'regras', 'usuarios', 'auditoria',
] as const;
export type Recurso = (typeof RECURSOS)[number];

export type Nivel = 'ver' | 'editar' | 'tudo';
const ORDEM: Record<Nivel, number> = { ver: 1, editar: 2, tudo: 3 };

type Matriz = Record<Recurso, Partial<Record<PerfilCodigo, Nivel>>>;

export const MATRIZ: Matriz = {
  dashboard:      { ADMINISTRADOR: 'tudo', FINANCEIRO: 'ver', CADASTRO: 'ver', GERENTE: 'ver', SUPERVISOR: 'ver' },
  vendedores:     { ADMINISTRADOR: 'tudo', CADASTRO: 'editar', GERENTE: 'ver', SUPERVISOR: 'ver' },
  equipes:        { ADMINISTRADOR: 'tudo', CADASTRO: 'editar', GERENTE: 'ver', SUPERVISOR: 'ver' },
  gerencias:      { ADMINISTRADOR: 'tudo', CADASTRO: 'editar', GERENTE: 'ver' },
  cotas:          { ADMINISTRADOR: 'tudo', FINANCEIRO: 'ver', GERENTE: 'ver', SUPERVISOR: 'ver' },
  transferencias: { ADMINISTRADOR: 'tudo' },
  comissoes:      { ADMINISTRADOR: 'tudo', FINANCEIRO: 'editar', CADASTRO: 'ver', GERENTE: 'ver', SUPERVISOR: 'ver' },
  estornos:       { ADMINISTRADOR: 'tudo', FINANCEIRO: 'editar', GERENTE: 'ver', SUPERVISOR: 'ver' },
  bonus:          { ADMINISTRADOR: 'tudo', FINANCEIRO: 'editar', GERENTE: 'ver' },
  lancamentos:    { ADMINISTRADOR: 'tudo', FINANCEIRO: 'editar' },
  importacoes:    { ADMINISTRADOR: 'tudo', FINANCEIRO: 'editar' },
  regras:         { ADMINISTRADOR: 'tudo', FINANCEIRO: 'editar' },
  usuarios:       { ADMINISTRADOR: 'tudo' },
  auditoria:      { ADMINISTRADOR: 'tudo' },
};

export function nivelDe(perfil: PerfilCodigo, recurso: Recurso): Nivel | null {
  return MATRIZ[recurso]?.[perfil] ?? null;
}

export function pode(perfil: PerfilCodigo, recurso: Recurso, nivel: Nivel = 'ver'): boolean {
  const atual = nivelDe(perfil, recurso);
  return atual !== null && ORDEM[atual] >= ORDEM[nivel];
}

export const ROTULO_PERFIL: Record<PerfilCodigo, string> = {
  ADMINISTRADOR: 'Administrador',
  FINANCEIRO: 'Financeiro',
  CADASTRO: 'Cadastro',
  GERENTE: 'Gerente',
  SUPERVISOR: 'Supervisor',
};

export const ROTULO_RECURSO: Record<Recurso, string> = {
  dashboard: 'Dashboard', vendedores: 'Vendedores', equipes: 'Equipes', gerencias: 'Gerências', cotas: 'Cotas (carteira)',
  transferencias: 'Transferências', comissoes: 'Comissões', estornos: 'Estornos', bonus: 'Bônus', lancamentos: 'Lançamentos da administradora',
  importacoes: 'Importações', regras: 'Regras', usuarios: 'Usuários', auditoria: 'Auditoria',
};
