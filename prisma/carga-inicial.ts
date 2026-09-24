/**
 * CARGA INICIAL — Especificação do ERP WR, seções 6.4 a 6.7 (levantada em 11/09/2026).
 * Único lugar do projeto onde aparecem percentuais e metas. Nenhum motor de cálculo importa este arquivo:
 * depois da implantação, quem manda é o que está cadastrado no banco, com vigência.
 */

/**
 * Início da vigência da carga inicial. A especificação data os percentuais de "setembro/2026".
 * Vendas anteriores a esta data NÃO recebem regra automaticamente (viram pendência SEM_TABELA),
 * para que comissões históricas já pagas fora do sistema não reapareçam como "a pagar".
 * Ajuste pela variável CARGA_VIGENCIA_INICIO (AAAA-MM-DD) antes de rodar o seed, se a WR decidir outra data.
 */
export const VIGENCIA_INICIO_PADRAO = '2026-09-01';

export const ADMINISTRADORA = { codigo: 'SERVOPA', nome: 'SERVOPA' };

export const SEGMENTOS = [
  { codigo: 'IMOVEIS', nome: 'Imóveis', aliases: ['IMOVEIS', 'IMOVEL', 'IMOBILIARIO', 'IMOB'] },
  { codigo: 'MOVEIS', nome: 'Móveis', aliases: ['MOVEIS', 'MOVEL', 'VEICULO', 'VEICULOS', 'AUTOMOVEL', 'AUTOMOVEIS', 'AUTO', 'MOTO', 'MOTOCICLETA', 'CAMINHAO', 'PESADOS', 'LEVES'] },
];

/**
 * Categorias (6.8). CPF é sempre Iniciante; CNPJ é Veterano ou Expert (6.1).
 * pagaPelaWr: Veterano e Expert recebem direto da administradora (6.6, CV069E) — o percentual continua sendo calculado (base do estorno).
 * geraSupervisao: "hoje, só iniciante" (6.4).
 * geraGerencia: a especificação não restringe a gerência a uma categoria (diferente da supervisão) — carga com todas.
 *   PONTO A CONFIRMAR PELA WR; ajustável em Configurações › Categorias (vale para vendas futuras).
 */
export const CATEGORIAS = [
  { codigo: 'INICIANTE', nome: 'Iniciante', ordem: 1, documentosAceitos: ['CPF'] as const, pagaPelaWr: true, geraSupervisao: true, geraGerencia: true, contaParaPromocao: true },
  { codigo: 'VETERANO', nome: 'Veterano', ordem: 2, documentosAceitos: ['CNPJ'] as const, pagaPelaWr: false, geraSupervisao: false, geraGerencia: true, contaParaPromocao: true },
  { codigo: 'EXPERT', nome: 'Expert', ordem: 3, documentosAceitos: ['CNPJ'] as const, pagaPelaWr: false, geraSupervisao: false, geraGerencia: true, contaParaPromocao: true },
];

type Parcelas = Partial<Record<1 | 2 | 3 | 4 | 5 | 6, string>>;

/** Percentuais da carga inicial (setembro/2026), tabela da seção 6.4. Célula "—" = sem faixa (não paga). */
export const TABELAS_COMISSAO: Array<{ destino: 'VENDEDOR' | 'SUPERVISAO' | 'GERENCIA'; categoria: string | null; segmento: string; parcelas: Parcelas }> = [
  { destino: 'VENDEDOR', categoria: 'INICIANTE', segmento: 'IMOVEIS', parcelas: { 1: '0.5', 2: '0.4', 3: '0.3', 4: '0.3' } },
  { destino: 'VENDEDOR', categoria: 'VETERANO', segmento: 'IMOVEIS', parcelas: { 1: '0.8', 3: '0.4', 4: '0.4', 6: '0.4' } },
  { destino: 'VENDEDOR', categoria: 'EXPERT', segmento: 'IMOVEIS', parcelas: { 1: '0.3', 3: '0.1', 4: '0.1' } },
  { destino: 'SUPERVISAO', categoria: null, segmento: 'IMOVEIS', parcelas: { 1: '0.3', 3: '0.1', 4: '0.1' } },
  { destino: 'GERENCIA', categoria: null, segmento: 'IMOVEIS', parcelas: { 1: '0.3' } },
  { destino: 'VENDEDOR', categoria: 'INICIANTE', segmento: 'MOVEIS', parcelas: { 1: '0.4', 2: '0.4', 3: '0.4' } },
  { destino: 'VENDEDOR', categoria: 'VETERANO', segmento: 'MOVEIS', parcelas: { 1: '0.5', 3: '0.5', 5: '0.5' } },
  { destino: 'VENDEDOR', categoria: 'EXPERT', segmento: 'MOVEIS', parcelas: { 1: '0.3', 3: '0.2' } },
  { destino: 'SUPERVISAO', categoria: null, segmento: 'MOVEIS', parcelas: { 1: '0.3', 3: '0.2' } },
  { destino: 'GERENCIA', categoria: null, segmento: 'MOVEIS', parcelas: { 1: '0.3' } },
];

/** Onze modalidades (6.5): Flex 10 a Flex 100 e Integral. "Flex 50 = base é 50% do crédito." Integral = crédito cheio. */
export const MODALIDADES_FLEX = [
  ...[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => ({ codigo: `FLEX${n}`, nome: `Flex ${n}`, percentual: String(n), aliases: [`FLEX ${n}`, `FLEX${n}`, `FLEX ${n}%`, `FLEX-${n}`] })),
  { codigo: 'INTEGRAL', nome: 'Integral', percentual: '100', aliases: ['INTEGRAL'] },
];

/**
 * Estorno (6.6). Participam hoje Veterano e Expert. Cancelamento com exatamente 1 parcela paga (IGUAL, 1).
 * Escopo da base: a especificação lista as três opções mas NÃO informa o padrão — fica INDEFINIDO,
 * e o estorno vira pendência até a WR escolher em Configurações › Estornos.
 */
export const CONFIGURACAO_ESTORNO = { participantes: ['VETERANO', 'EXPERT'], criterioCancelamento: 'IGUAL' as const, limiteParcelas: 1, escopoBase: null };
export const REGRAS_ESTORNO = [
  { tipo: 'RECUPERACAO' as const, percentual: '50' },
  { tipo: 'CANCELAMENTO' as const, percentual: '50' },
];

/** Promoção (6.7). */
export const METAS_PROMOCAO = [
  { de: 'INICIANTE', para: 'VETERANO', volumeMinimo: '3000000', alertaAoFaltar: '500000', documentoExigido: 'CNPJ' as const },
  { de: 'VETERANO', para: 'EXPERT', volumeMinimo: '30000000', alertaAoFaltar: '500000', documentoExigido: 'CNPJ' as const },
];
