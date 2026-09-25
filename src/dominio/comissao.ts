import { aplicarPercentual, formatarMoeda, formatarPercentual, moeda, paraTexto, type Dec } from '@/lib/dinheiro';
import { formatarData, paraISO } from '@/lib/datas';

export type Destino = 'VENDEDOR' | 'SUPERVISAO' | 'GERENCIA';
export const DESTINOS: readonly Destino[] = ['VENDEDOR', 'SUPERVISAO', 'GERENCIA'];
export const ROTULO_DESTINO: Record<Destino, string> = { VENDEDOR: 'Vendedor', SUPERVISAO: 'Supervisor', GERENCIA: 'Gerente' };

export interface CategoriaDaVenda {
  id: string;
  codigo: string;
  nome: string;
  pagaPelaWr: boolean;
  geraSupervisao: boolean;
  geraGerencia: boolean;
}

/** Quem entra no rateio depende do que a categoria congelada decide (6.4). */
export function destinosDaCategoria(c: CategoriaDaVenda): Destino[] {
  const d: Destino[] = ['VENDEDOR'];
  if (c.geraSupervisao) d.push('SUPERVISAO');
  if (c.geraGerencia) d.push('GERENCIA');
  return d;
}

/** Vendedor: a WR paga se a categoria disser. Supervisão e gerência: sempre a WR. */
export function pagaPelaWr(destino: Destino, c: CategoriaDaVenda): boolean {
  return destino === 'VENDEDOR' ? c.pagaPelaWr : true;
}

export interface TitularResolvido {
  pessoaId: string;
  vendedorId: string | null;
  nome: string;
}

export interface TabelaResolvida {
  id: string;
  vigenteDe: Date;
  vigenteAte: Date | null;
  excecao: boolean;
  faixas: ReadonlyArray<{ parcela: number; percentual: Dec }>;
}

export interface EntradaComissao {
  cota: { id: string; credito: Dec; dataVenda: Date; parcelasPagas: number };
  categoria: CategoriaDaVenda;
  segmento: { codigo: string; nome: string };
  flex: { id: string; codigo: string; nome: string; percentual: Dec; vigenteDe: Date; vigenteAte: Date | null };
  destinos: ReadonlyArray<{ destino: Destino; titular: TitularResolvido | null; tabela: TabelaResolvida | null }>;
}

export interface LinhaComissao {
  destino: Destino;
  parcela: number;
  titular: TitularResolvido;
  tabelaId: string;
  base: Dec;
  percentual: Dec;
  valor: Dec;
  pagaPelaWr: boolean;
  liberada: boolean;
  memoria: MemoriaComissao;
}

export interface PendenciaCalculo {
  tipo: 'SEM_TABELA' | 'SEM_RESPONSAVEL';
  destino: Destino;
  descricao: string;
}

export interface MemoriaComissao {
  formula: string;
  credito: string;
  flex: { codigo: string; nome: string; percentual: string; regraId: string; vigenteDe: string; vigenteAte: string | null };
  base: string;
  parcela: number;
  percentual: string;
  valor: string;
  destino: Destino;
  segmento: string;
  categoria: { codigo: string; nome: string };
  regra: { tabelaId: string; excecaoIndividual: boolean; vigenteDe: string; vigenteAte: string | null };
  dataDoFato: { campo: 'dataVenda'; valor: string };
  titular: { pessoaId: string; vendedorId: string | null; nome: string };
  quemPaga: 'WR' | 'ADMINISTRADORA';
  liberacao: { regra: string; parcelasPagasPeloCliente: number; liberada: boolean };
}

function ordinal(n: number): string {
  return `${n}ª parcela`;
}

/** base = crédito × percentual flex (arredondada a centavos). */
export function calcularBase(credito: Dec, percentualFlex: Dec): Dec {
  return aplicarPercentual(credito, percentualFlex);
}

/**
 * Motor de comissão (6.4). Função pura: recebe regras já resolvidas NA DATA DA VENDA e devolve
 * uma linha por (destino, parcela com faixa) + pendências. Parcela sem faixa simplesmente não paga.
 */
export function calcularComissoes(e: EntradaComissao): { linhas: LinhaComissao[]; pendencias: PendenciaCalculo[] } {
  const linhas: LinhaComissao[] = [];
  const pendencias: PendenciaCalculo[] = [];
  const base = calcularBase(e.cota.credito, e.flex.percentual);
  const rotuloRegra = e.categoria.codigo;

  for (const d of e.destinos) {
    if (!d.titular) {
      pendencias.push({
        tipo: 'SEM_RESPONSAVEL',
        destino: d.destino,
        descricao: d.destino === 'SUPERVISAO'
          ? 'Equipe sem supervisor vigente na data da venda'
          : d.destino === 'GERENCIA' ? 'Gerência sem gerente vigente na data da venda' : 'Venda sem vendedor',
      });
      continue;
    }
    if (!d.tabela) {
      pendencias.push({
        tipo: 'SEM_TABELA',
        destino: d.destino,
        descricao: `Sem tabela de comissão vigente em ${formatarData(e.cota.dataVenda)} para ${d.destino === 'VENDEDOR' ? e.categoria.nome : d.destino.toLowerCase()} · ${e.segmento.nome}`,
      });
      continue;
    }
    const paga = pagaPelaWr(d.destino, e.categoria);
    const faixas = [...d.tabela.faixas].sort((a, b) => a.parcela - b.parcela);
    for (const f of faixas) {
      const valor = aplicarPercentual(base, f.percentual);
      const liberada = f.parcela <= e.cota.parcelasPagas;
      const rotulo = d.destino === 'VENDEDOR' ? rotuloRegra : d.destino;
      const formula =
        `${formatarMoeda(e.cota.credito)} × ${formatarPercentual(e.flex.percentual)} (flex) = ${formatarMoeda(base)} (base) × ` +
        `${formatarPercentual(f.percentual)} (${rotulo}, ${ordinal(f.parcela)}) = ${formatarMoeda(valor)}`;
      linhas.push({
        destino: d.destino,
        parcela: f.parcela,
        titular: d.titular,
        tabelaId: d.tabela.id,
        base,
        percentual: f.percentual,
        valor,
        pagaPelaWr: paga,
        liberada,
        memoria: {
          formula,
          credito: paraTexto(moeda(e.cota.credito)),
          flex: {
            codigo: e.flex.codigo, nome: e.flex.nome, percentual: paraTexto(e.flex.percentual), regraId: e.flex.id,
            vigenteDe: paraISO(e.flex.vigenteDe), vigenteAte: e.flex.vigenteAte ? paraISO(e.flex.vigenteAte) : null,
          },
          base: paraTexto(base),
          parcela: f.parcela,
          percentual: paraTexto(f.percentual),
          valor: paraTexto(valor),
          destino: d.destino,
          segmento: e.segmento.codigo,
          categoria: { codigo: e.categoria.codigo, nome: e.categoria.nome },
          regra: {
            tabelaId: d.tabela.id, excecaoIndividual: d.tabela.excecao,
            vigenteDe: paraISO(d.tabela.vigenteDe), vigenteAte: d.tabela.vigenteAte ? paraISO(d.tabela.vigenteAte) : null,
          },
          dataDoFato: { campo: 'dataVenda', valor: paraISO(e.cota.dataVenda) },
          titular: { pessoaId: d.titular.pessoaId, vendedorId: d.titular.vendedorId, nome: d.titular.nome },
          quemPaga: paga ? 'WR' : 'ADMINISTRADORA',
          liberacao: {
            regra: 'Liberada quando a base de clientes registra a parcela como paga pelo cliente',
            parcelasPagasPeloCliente: e.cota.parcelasPagas,
            liberada,
          },
        },
      });
    }
  }
  return { linhas, pendencias };
}
