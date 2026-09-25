import type { Tom } from './base';

export const TOM_COMISSAO: Record<string, Tom> = { PREVISTA: 'azul', LIBERADA: 'verde', EM_FOLHA: 'neutro', PAGA: 'verde', CANCELADA: 'neutro' };
export const ROTULO_COMISSAO: Record<string, string> = { PREVISTA: 'prevista', LIBERADA: 'liberada', EM_FOLHA: 'em folha', PAGA: 'paga', CANCELADA: 'cancelada' };
export const TOM_ESTORNO: Record<string, Tom> = { A_COBRAR: 'ambar', EM_COBRANCA: 'azul', QUITADO: 'verde', PERDOADO: 'neutro', INVALIDADO: 'neutro' };
export const ROTULO_ESTORNO: Record<string, string> = { A_COBRAR: 'a cobrar', EM_COBRANCA: 'em cobrança', QUITADO: 'quitado', PERDOADO: 'perdoado', INVALIDADO: 'invalidado' };
export const ROTULO_PENDENCIA: Record<string, string> = {
  SEM_VENDEDOR: 'Sem vendedor na base', VENDEDOR_SEM_CADASTRO: 'Vendedor sem cadastro', SEM_CATEGORIA: 'Vendedor sem categoria na data da venda', SEM_ESTRUTURA: 'Vendedor sem equipe na data da venda',
  SEM_SEGMENTO: 'Tipo de bem (segmento) não reconhecido', SEM_FLEX: 'Plano flex não reconhecido', SEM_TABELA: 'Sem percentual de comissão para a data', SEM_RESPONSAVEL: 'Equipe sem supervisor ou gerente na data',
  ESTORNO_SEM_CONFIGURACAO: 'Regras de estorno incompletas', ESTORNO_SEM_REGRA: 'Sem percentual de estorno para a data', ESTORNO_SEM_TITULAR: 'Estorno sem ninguém para cobrar',
  AJUSTE_FOLHA_FECHADA: 'Diferença em folha já fechada', ESTORNO_DIVERGENTE: 'Estorno já cobrado mudou', DIVERGENCIA_VENDEDOR: 'Vendedor trocado pela administradora',
};
export const CONSERTO_PENDENCIA: Record<string, string> = {
  SEM_VENDEDOR: 'O arquivo não trouxe o vendedor. Peça a correção à administradora; o próximo arquivo resolve.',
  VENDEDOR_SEM_CADASTRO: 'Cadastre o vendedor (CPF/CNPJ) em Vendedores, ou ligue o nome a um vendedor em Vendedores › Vendem sem cadastro.',
  SEM_CATEGORIA: 'Na ficha do vendedor, informe a categoria desde uma data anterior à venda. Depois, “Processar pendências agora”.',
  SEM_ESTRUTURA: 'Na ficha do vendedor, coloque-o numa equipe desde uma data anterior à venda. Depois, “Processar pendências agora”.',
  SEM_SEGMENTO: 'Em Configurações › Flex e segmentos, acrescente o texto do arquivo aos “nomes no arquivo” do segmento. Depois, “Processar pendências agora”.',
  SEM_FLEX: 'Em Configurações › Flex e segmentos, acrescente o texto do arquivo aos “nomes no arquivo” do plano. Depois, “Processar pendências agora”.',
  SEM_TABELA: 'Em Configurações › Comissões, cadastre o percentual valendo desde uma data anterior à venda.',
  SEM_RESPONSAVEL: 'Em Estrutura, informe o supervisor/gerente desde uma data anterior à venda. Depois, “Processar pendências agora”.',
  ESTORNO_SEM_CONFIGURACAO: 'Em Configurações › Estornos, complete as regras (sobre qual valor o estorno é calculado).',
  ESTORNO_SEM_REGRA: 'Em Configurações › Estornos, cadastre o percentual valendo desde uma data anterior ao cancelamento.',
  ESTORNO_SEM_TITULAR: 'Informe em Estrutura quem era o supervisor/gerente na data da venda e processe as pendências. O estorno não se perde.',
  AJUSTE_FOLHA_FECHADA: 'Só informativo: a diferença entra sozinha na próxima folha.',
  ESTORNO_DIVERGENTE: 'O estorno já estava em cobrança e não é alterado sozinho. Confira em Estornos.',
  DIVERGENCIA_VENDEDOR: 'Abra a venda e escolha: aceitar a troca de vendedor ou manter o atual.',
};
