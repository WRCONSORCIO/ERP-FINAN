/**
 * Layouts de leitura dos arquivos da administradora.
 * São CONFIGURAÇÃO (ConfiguracaoSistema), não regra fixa: a carga inicial abaixo semeia a implantação
 * e pode ser ajustada em Importações › Layout dos arquivos sem alterar código.
 */

export const CAMPOS_CARTEIRA = [
  'grupo', 'cota', 'grupoCota', 'contrato', 'cpfCliente', 'clienteNome', 'credito', 'dataVenda', 'parcelasPagas',
  'situacao', 'vendedorNome', 'vendedorDocumento', 'segmento', 'flex', 'dataCancelamento', 'clienteEmail', 'clienteTelefone',
] as const;
export type CampoCarteira = (typeof CAMPOS_CARTEIRA)[number];

export interface LayoutCarteira {
  separador: string;
  /** Nome normalizado do cabeçalho aceito para cada campo. */
  colunas: Record<CampoCarteira, string[]>;
  /** Trechos (normalizados) da situação que indicam venda cancelada. */
  situacoesCanceladas: string[];
}

export const CAMPOS_OBRIGATORIOS_CARTEIRA: readonly CampoCarteira[] = [
  'contrato', 'cpfCliente', 'clienteNome', 'credito', 'dataVenda', 'parcelasPagas', 'situacao',
];

export const LAYOUT_CARTEIRA_INICIAL: LayoutCarteira = {
  separador: ';',
  colunas: {
    grupo: ['GRUPO'],
    cota: ['COTA', 'NR COTA', 'NUMERO COTA', 'NUM COTA'],
    grupoCota: ['GRUPO COTA', 'GRUPO/COTA', 'GRUPO.COTA'],
    contrato: ['CONTRATO', 'NR CONTRATO', 'NUMERO CONTRATO', 'NUM CONTRATO', 'N CONTRATO'],
    cpfCliente: ['CPF', 'CPF CNPJ', 'CPF/CNPJ', 'CPF CLIENTE', 'CPF CONSORCIADO', 'CPF CNPJ CLIENTE', 'DOCUMENTO CLIENTE'],
    clienteNome: ['CLIENTE', 'NOME', 'NOME CLIENTE', 'CONSORCIADO', 'NOME CONSORCIADO'],
    credito: ['CREDITO', 'VALOR CREDITO', 'VALOR DO CREDITO', 'VALOR BEM', 'VALOR DO BEM', 'VLR CREDITO'],
    dataVenda: ['DATA VENDA', 'DATA DA VENDA', 'DT VENDA', 'DATA ADESAO', 'DATA DE ADESAO', 'DT ADESAO'],
    parcelasPagas: ['PARC PAGAS', 'PARCELAS PAGAS', 'QTD PARCELAS PAGAS', 'QTDE PARC PAGAS', 'QTD PARC PAGAS'],
    situacao: ['SITUACAO', 'STATUS', 'SITUACAO COTA', 'SITUACAO DA COTA'],
    vendedorNome: ['VENDEDOR', 'NOME VENDEDOR', 'NOME DO VENDEDOR', 'REPRESENTANTE', 'CORRETOR'],
    vendedorDocumento: ['CPF VENDEDOR', 'CNPJ VENDEDOR', 'CPF CNPJ VENDEDOR', 'DOC VENDEDOR', 'DOCUMENTO VENDEDOR'],
    segmento: ['SEGMENTO', 'TIPO BEM', 'TIPO DE BEM', 'BEM', 'PRODUTO'],
    flex: ['FLEX', 'MODALIDADE', 'MODALIDADE FLEX', 'PLANO', 'TIPO PLANO'],
    dataCancelamento: ['DATA CANCELAMENTO', 'DT CANCELAMENTO', 'DATA CANC', 'DATA DO CANCELAMENTO'],
    clienteEmail: ['EMAIL', 'E MAIL', 'EMAIL CLIENTE'],
    clienteTelefone: ['TELEFONE', 'FONE', 'CELULAR', 'TELEFONE CLIENTE'],
  },
  situacoesCanceladas: ['CANCEL'],
};

/**
 * Relatórios em PDF: cada linha de dado é reconhecida por uma expressão regular com grupos nomeados.
 * Grupos aceitos: grupo, cota, contrato, consorciado, parcela, tipo, data, valor, vendedor, valorEvento, percentual.
 * `total` reconhece o total impresso no rodapé, usado na conferência contra o próprio arquivo.
 */
export interface LayoutPdf {
  marcador: string; // texto que identifica o relatório no conteúdo (ex.: "CV056E")
  linha: string; // regex (flags: i)
  total: string; // regex com grupo "total"
  /** Para o CV056E: trechos do texto de origem que classificam o lançamento. */
  classificacao?: { CANCELAMENTO: string[]; COMISSAO_PARCELA: string[] };
}

const VALOR = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}-?`;
const DATA = String.raw`\d{2}/\d{2}/\d{2,4}`;

export const LAYOUT_CV056E_INICIAL: LayoutPdf = {
  marcador: 'CV056E',
  linha: String.raw`^\s*(?<grupo>\d{3,6})\s*[/.\- ]\s*(?<cota>\d{1,4})(?:-\d)?\s+(?:(?<contrato>\d{5,15})\s+)?(?<consorciado>.+?)\s+(?<parcela>\d{1,3})\s+(?<tipo>[A-Za-zÀ-ú .]+?)\s+(?<data>${DATA})\s+(?<valor>${VALOR})\s*$`,
  total: String.raw`TOTAL\s+(?:GERAL)?[^\d-]*(?<total>${VALOR})\s*$`,
  classificacao: { CANCELAMENTO: ['CANCEL', 'ESTORNO', 'DEBITO'], COMISSAO_PARCELA: ['COMISS', 'PARCELA', 'PARC'] },
};

export const LAYOUT_CV069E_INICIAL: LayoutPdf = {
  marcador: 'CV069E',
  linha: String.raw`^\s*(?<grupo>\d{3,6})\s*[/.\- ]\s*(?<cota>\d{1,4})(?:-\d)?\s+(?:(?<contrato>\d{5,15})\s+)?(?<vendedor>.+?)\s+(?<parcela>\d{1,3})\s+(?<data>${DATA})\s+(?<valor>${VALOR})\s*$`,
  total: String.raw`TOTAL\s+(?:GERAL)?[^\d-]*(?<total>${VALOR})\s*$`,
};

export const LAYOUT_GC070A_INICIAL: LayoutPdf = {
  marcador: 'GC070A',
  linha: String.raw`^\s*(?<consorciado>.+?)\s+(?<grupo>\d{3,6})\s*[/.\- ]\s*(?<cota>\d{1,4})(?:-\d)?\s+(?<contrato>\d{5,15})\s+(?:(?<vendedor>[A-Za-zÀ-ú .]+?)\s+)?(?<parcela>\d{1,3})\s+(?<valorEvento>${VALOR})\s+(?<percentual>\d{1,3},\d{1,4})\s*%?\s+(?<valor>${VALOR})\s*$`,
  total: String.raw`TOTAL\s+(?:GERAL)?[^\d-]*(?<total>${VALOR})\s*$`,
};

export const CHAVES_LAYOUT = {
  CARTEIRA_CSV: 'layout.carteira_csv',
  FECHAMENTO_CV056E: 'layout.cv056e',
  COMISSAO_VENDEDOR_CV069E: 'layout.cv069e',
  BONUS_GC070A: 'layout.gc070a',
} as const;
