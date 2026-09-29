/** Erro de regra de negócio: a mensagem é segura para mostrar ao usuário. */
export class ErroDeDominio extends Error {
  constructor(mensagem: string, readonly codigo: string = 'REGRA') {
    super(mensagem);
    this.name = 'ErroDeDominio';
  }
}

export class ErroDePermissao extends ErroDeDominio {
  constructor(mensagem = 'Você não tem permissão para esta ação.') {
    super(mensagem, 'PERMISSAO');
    this.name = 'ErroDePermissao';
  }
}

export class ErroNaoEncontrado extends ErroDeDominio {
  constructor(mensagem = 'Registro não encontrado ou fora do seu recorte de visibilidade.') {
    super(mensagem, 'NAO_ENCONTRADO');
    this.name = 'ErroNaoEncontrado';
  }
}

/** Traduz erros do PostgreSQL/Prisma em mensagens humanas, sem vazar detalhes técnicos. */
export function mensagemDeErroDeBanco(e: unknown): string | null {
  const texto = e instanceof Error ? e.message : String(e);
  if (/ex_.*_sobreposicao|conflicting key value violates exclusion constraint/i.test(texto)) {
    return 'Já existe uma vigência que se sobrepõe a este período. Encerre a vigência atual antes de abrir outra.';
  }
  if (/ck_.*_vigencia/i.test(texto)) return 'A data final não pode ser anterior à data inicial.';
  if (/Unique constraint failed|duplicate key value/i.test(texto)) return 'Já existe um registro com estes dados.';
  if (/ck_responsavel_papel/i.test(texto)) return 'Supervisor responde por equipe; gerente, por gerência.';
  if (/ck_usuario_escopo/i.test(texto)) return 'Escopo incoerente com o perfil: gerente usa gerência, supervisor usa equipe.';
  if (/ck_vendedor_documento/i.test(texto)) return 'Documento inválido para o tipo informado.';
  if (/Foreign key constraint/i.test(texto)) return 'Este registro está vinculado a outros e não pode ser removido.';
  if (/imutáve|append-only|nunca é invalidado|não se apaga|nunca muda|não pode sair da folha|não muda/i.test(texto)) {
    const m = /(?:ERROR|Raise|message):?\s*([^\n]+)/i.exec(texto);
    return m?.[1]?.trim() ?? 'Operação bloqueada pela integridade do banco: registros financeiros não são sobrescritos.';
  }
  return null;
}

/**
 * Diz, sem expor senha nem endereço, POR QUE o banco falhou — para a tela orientar quem está
 * tentando entrar e para o administrador saber onde mexer.
 */
export function diagnosticarFalhaDeBanco(e: unknown): { codigo: string; orientacao: string } {
  const texto = e instanceof Error ? `${(e as { code?: string }).code ?? ''} ${e.message}` : String(e);
  const tem = (re: RegExp) => re.test(texto);
  if (tem(/P1001|Can't reach database server|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i)) {
    return { codigo: 'BANCO_INACESSIVEL', orientacao: 'O banco não respondeu. Na Supabase, veja se o projeto está pausado (o plano gratuito pausa sem uso) e clique em “Restore”; depois tente de novo.' };
  }
  if (tem(/P1000|Authentication failed|password authentication failed|Tenant or user not found/i)) {
    return { codigo: 'BANCO_SENHA', orientacao: 'O banco recusou o usuário ou a senha. Confira DATABASE_URL e DIRECT_URL na Vercel (a senha do banco pode ter sido trocada na Supabase) e faça Redeploy.' };
  }
  if (tem(/P2021|P2022|does not exist in the current database|column .* does not exist|relation .* does not exist/i)) {
    return { codigo: 'BANCO_DESATUALIZADO', orientacao: 'O banco está numa versão anterior à do sistema. Na Vercel, faça Redeploy do último deploy (ele aplica as atualizações do banco).' };
  }
  if (tem(/P2024|Timed out fetching a new connection|too many (connections|clients)|remaining connection slots|MaxClientsInSessionMode/i)) {
    return { codigo: 'BANCO_LOTADO', orientacao: 'O banco está sem conexões livres no momento. Aguarde um minuto e tente de novo.' };
  }
  if (tem(/prepared statement/i)) {
    return { codigo: 'BANCO_POOLER', orientacao: 'Conexão com o pooler da Supabase mal configurada: use a porta 6543 com ?pgbouncer=true em DATABASE_URL.' };
  }
  return { codigo: 'BANCO_ERRO', orientacao: 'Tente de novo em instantes; se persistir, avise o administrador.' };
}
