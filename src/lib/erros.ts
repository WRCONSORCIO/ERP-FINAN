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
