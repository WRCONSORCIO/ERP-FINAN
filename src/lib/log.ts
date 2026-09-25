/** Log estruturado (JSON em uma linha). Nunca registra senha, token, hash ou segredo. */
type Nivel = 'info' | 'warn' | 'error';

const CHAVES_SENSIVEIS = /senha|password|token|secret|hash|authorization|cookie/i;

function limpar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 4) return '[...]';
  if (valor instanceof Error) return { nome: valor.name, mensagem: valor.message, pilha: process.env.NODE_ENV === 'production' ? undefined : valor.stack };
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => limpar(v, profundidade + 1));
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) saida[k] = CHAVES_SENSIVEIS.test(k) ? '[omitido]' : limpar(v, profundidade + 1);
    return saida;
  }
  return valor;
}

function escrever(nivel: Nivel, evento: string, dados?: Record<string, unknown>) {
  const linha = JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...(dados ? (limpar(dados) as object) : {}) });
  if (nivel === 'error') console.error(linha);
  else console.warn(linha);
}

export const log = {
  info: (evento: string, dados?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'test') escrever('info', evento, dados);
  },
  aviso: (evento: string, dados?: Record<string, unknown>) => escrever('warn', evento, dados),
  erro: (evento: string, dados?: Record<string, unknown>) => escrever('error', evento, dados),
};
