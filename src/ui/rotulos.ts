import type { Tom } from './base';

export const TOM_COMISSAO: Record<string, Tom> = { PREVISTA: 'azul', LIBERADA: 'verde', EM_FOLHA: 'neutro', PAGA: 'verde', CANCELADA: 'neutro' };
export const ROTULO_COMISSAO: Record<string, string> = { PREVISTA: 'prevista', LIBERADA: 'liberada', EM_FOLHA: 'em folha', PAGA: 'paga', CANCELADA: 'cancelada' };
export const TOM_ESTORNO: Record<string, Tom> = { A_COBRAR: 'ambar', EM_COBRANCA: 'azul', QUITADO: 'verde', PERDOADO: 'neutro', INVALIDADO: 'neutro' };
export const ROTULO_ESTORNO: Record<string, string> = { A_COBRAR: 'a cobrar', EM_COBRANCA: 'em cobrança', QUITADO: 'quitado', PERDOADO: 'perdoado', INVALIDADO: 'invalidado' };
export const ROTULO_PENDENCIA: Record<string, string> = {
  SEM_VENDEDOR: 'Sem vendedor na base', VENDEDOR_SEM_CADASTRO: 'Vendedor sem cadastro', SEM_CATEGORIA: 'Sem categoria vigente', SEM_ESTRUTURA: 'Sem equipe/gerência',
  SEM_SEGMENTO: 'Segmento não reconhecido', SEM_FLEX: 'Flex não reconhecido', SEM_TABELA: 'Sem tabela de comissão vigente', SEM_RESPONSAVEL: 'Unidade sem responsável',
  ESTORNO_SEM_CONFIGURACAO: 'Estorno sem configuração/escopo', ESTORNO_SEM_REGRA: 'Estorno sem percentual vigente', ESTORNO_SEM_TITULAR: 'Estorno sem titular',
  AJUSTE_FOLHA_FECHADA: 'Ajuste de folha fechada', ESTORNO_DIVERGENTE: 'Estorno já cobrado divergente', DIVERGENCIA_VENDEDOR: 'Vendedor corrigido pela administradora',
};
export const CONSERTO_PENDENCIA: Record<string, string> = {
  SEM_VENDEDOR: 'A base não trouxe vendedor: peça a correção à administradora; a próxima importação completa.',
  VENDEDOR_SEM_CADASTRO: 'Cadastre o documento ou vincule o nome em Vendedores › Vendem sem cadastro (o vínculo é automático).',
  SEM_CATEGORIA: 'Cadastre a categoria do documento com vigência que cubra a data da venda e use “Recongelar todas”.',
  SEM_ESTRUTURA: 'Aloque o documento numa equipe com vigência que cubra a data da venda e use “Recongelar todas”.',
  SEM_SEGMENTO: 'Acrescente o texto do arquivo aos apelidos do segmento em Configurações e use “Recongelar todas”.',
  SEM_FLEX: 'Acrescente o texto do arquivo aos apelidos do flex (ou abra vigência que cubra a data) e use “Recongelar todas”.',
  SEM_TABELA: 'Abra uma vigência de tabela de comissão que cubra a data da venda em Configurações › Comissões.',
  SEM_RESPONSAVEL: 'Defina supervisor/gerente com vigência que cubra a data da venda em Estrutura e use “Recongelar todas”.',
  ESTORNO_SEM_CONFIGURACAO: 'Defina o escopo da base do estorno em Configurações › Estornos.',
  ESTORNO_SEM_REGRA: 'Abra vigência do percentual de estorno cobrindo a data do cancelamento.',
  ESTORNO_SEM_TITULAR: 'Cadastre o responsável da unidade na data da venda e recongele — o estorno não some.',
  AJUSTE_FOLHA_FECHADA: 'Informativo: a diferença entra na próxima folha como ajuste.',
  ESTORNO_DIVERGENTE: 'Estorno já em cobrança não é alterado: trate manualmente em Estornos.',
  DIVERGENCIA_VENDEDOR: 'Decida na ficha da cota: aceitar (transfere) ou manter.',
};
