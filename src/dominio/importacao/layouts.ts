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
  /** Versão do layout padrão do sistema: layout salvo no banco com versão menor é substituído pelo padrão. */
  versao: number;
  marcador: string; // texto que identifica o relatório no conteúdo (ex.: "CV056E")
  /**
   * Regex (flags: i). Quando o relatório tem um registro em várias linhas (inicioRegistro), a expressão é
   * aplicada às linhas do registro unidas por " | ".
   */
  linha: string;
  total: string; // regex com grupo "total" (cada ocorrência soma)
  /** Registro em várias linhas: expressão da primeira linha de cada venda e quantas linhas ela ocupa. */
  inicioRegistro?: string;
  linhasPorRegistro?: number;
  /** Linha de cabeçalho com o vendedor (grupos vendedorDocumento e vendedor), válida para as vendas abaixo dela. */
  cabecalhoVendedor?: string;
  /** Linhas de cabeçalho/rodapé de página que não são dado (ignoradas, inclusive no meio de um registro). */
  ignorar?: string;
  /** Para o CV056E: trechos do texto de origem que classificam o lançamento. */
  classificacao?: { CANCELAMENTO: string[]; COMISSAO_PARCELA: string[] };
}

const VALOR = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}-?`;
const DATA = String.raw`\d{2}/\d{2}/\d{2,4}`;
/** Datas do fim do registro: a primeira é a do pagamento; a última, a da venda. */
const DATAS = String.raw`(?<data>${DATA})(?:(?:\s+${DATA})*\s+(?<dataVenda>${DATA}))?`;
const CABECALHO_VENDEDOR = String.raw`^VENDEDOR\s*\(CPF/CNPJ\)\s*:\s*(?<vendedorDocumento>[\d./-]+)\s*-\s*(?<vendedor>.+?)\s*$`;
const IGNORAR_SERVOPA = String.raw`^(SERVOPA|ATIVIDADE|SOLICITANTE|PRESTADORA|CONTRATO\s+(D\s+E|OBJETO)|COTA\s+(D\s+E|OBJETO|CONTRATO)|ORIGEM\s+PARC|PERIODO|SEGMENTO|VLR\.|I\.R\.|TOTAL\s+LIQUIDO|Sub-Total|[-\s*]+$|[\d.,\s-]+$|\*)`;

/**
 * Relatórios da Servopa (layout real, 07/2026). CV056E e CV069E: cada venda ocupa 3 linhas, abaixo do
 * cabeçalho "VENDEDOR (CPF/CNPJ): ...". GC070A: uma linha por cota.
 */
export const LAYOUT_CV056E_INICIAL: LayoutPdf = {
  versao: 2,
  marcador: 'CV056E',
  // 75255I10 E NOME DO CLIENTE / fone | 1574.2754.4 CREDITO P/IMOVEL 7 110.000,00 50,00 825,00 0,00 0,00 1,5000 | PAGAMENTO COMISSAO 9 22/07/2026 30/10/2025 I
  linha: String.raw`^(?<contrato>\d{4,8}I\d{2})\s+\S\s+(?<consorciado>.+?)(?:\s+/[^|]*)?\s*\|\s*(?<grupo>\d{3,6})\.(?<cota>\d{1,5})\.\d\s+(?:[A-Za-zÀ-ú].*?\s+)?(?<valorEvento>${VALOR})\s+(?:(?<flex>\d{1,3},\d{2})\s+)?(?<valor>${VALOR})\s+${VALOR}\s+${VALOR}\s+(?<percentual>\d{1,3},\d{2,4})\s*\|\s*(?<tipo>[A-Za-zÀ-ú][A-Za-zÀ-ú ]*?)\s+(?:(?<parcela>\d{1,3})\s+)?${DATAS}\b.*$`,
  total: String.raw`^Total do Vendedor\s*\.*\s*:\s*(?<total>${VALOR})`,
  inicioRegistro: String.raw`^\d{4,8}I\d{2}\s`,
  linhasPorRegistro: 3,
  cabecalhoVendedor: CABECALHO_VENDEDOR,
  ignorar: IGNORAR_SERVOPA,
  classificacao: { CANCELAMENTO: ['CANCELAMENTO', 'EXCLUSAO', 'ESTORNO'], COMISSAO_PARCELA: ['INCLUSAO', 'PAGAMENTO', 'COMISS', 'PARCELA'] },
};

export const LAYOUT_CV069E_INICIAL: LayoutPdf = {
  versao: 2,
  marcador: 'CV069E',
  // 1553.0425 -9 E NOME DO CLIENTE / fone | 43196I10 507.895,00 50,00 1.015,79 0,00 0,00 0,4000 | 3 22/07/2026 22/04/2026 I
  linha: String.raw`^(?<grupo>\d{3,6})\.(?<cota>\d{1,5})\s*-\s*\d\s+\S\s+(?<consorciado>.+?)(?:\s+/[^|]*)?\s*\|\s*(?<contrato>\d{4,8}I\d{2})\s+(?:[A-Za-zÀ-ú].*?\s+)?(?<valorEvento>${VALOR})\s+(?:(?<flex>\d{1,3},\d{2})\s+)?(?<valor>${VALOR})\s+${VALOR}\s+${VALOR}\s+(?<percentual>\d{1,3},\d{2,4})\s*\|\s*(?:(?<tipo>[A-Za-zÀ-ú][A-Za-zÀ-ú ]*?)\s+)?(?:(?<parcela>\d{1,3})\s+)?${DATAS}\b.*$`,
  total: String.raw`^Total do Vendedor\s*\.*\s*:\s*(?<total>${VALOR})`,
  inicioRegistro: String.raw`^\d{3,6}\.\d{1,5}\s*-\s*\d\s`,
  linhasPorRegistro: 3,
  cabecalhoVendedor: CABECALHO_VENDEDOR,
  ignorar: IGNORAR_SERVOPA,
};

export const LAYOUT_GC070A_INICIAL: LayoutPdf = {
  versao: 2,
  marcador: 'GC070A',
  // 1533.0106-7 26930I09 NOME DO CLIENTE P 018 09/01/2025 222.667,00 0,50 1.113,34 50,00
  linha: String.raw`^(?<grupo>\d{3,6})\.(?<cota>\d{1,5})-\d\s+(?<contrato>\d{4,8}I\d{2})\s+(?<consorciado>.+?)\s+(?<tipo>[A-Z])\s+(?<parcela>\d{1,3})\s+(?<data>${DATA})\s+(?<valorEvento>${VALOR})\s+(?<percentual>\d{1,3},\d{1,4})\s+(?<valor>${VALOR})(?:\s+\d{1,3},\d{2})?\s*$`,
  total: String.raw`^TOTAL DO SEGMENTO\s*:\s*(?<total>${VALOR})`,
  ignorar: IGNORAR_SERVOPA,
};

export const CHAVES_LAYOUT = {
  CARTEIRA_CSV: 'layout.carteira_csv',
  FECHAMENTO_CV056E: 'layout.cv056e',
  COMISSAO_VENDEDOR_CV069E: 'layout.cv069e',
  BONUS_GC070A: 'layout.gc070a',
} as const;
