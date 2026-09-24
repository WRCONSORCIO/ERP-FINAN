import type { ReactNode } from 'react';

const ROTULOS: Record<string, string> = {
  formula: 'Fórmula', credito: 'Crédito', base: 'Base', parcela: 'Parcela', percentual: 'Percentual aplicado', valor: 'Valor', destino: 'Destino',
  segmento: 'Segmento', categoria: 'Categoria da venda (congelada)', regra: 'Regra usada', flex: 'Modalidade flex', dataDoFato: 'Data do fato',
  titular: 'Quem recebe', quemPaga: 'Quem paga', liberacao: 'Liberação', ajuste: 'Ajuste de folha fechada', tipo: 'Tipo', motivoDoTipo: 'Por que este tipo',
  parcelasPagas: 'Parcelas pagas', escopoBase: 'Escopo da base', comissoesUsadas: 'Comissões usadas na base', comissaoBase: 'Comissão base',
  configuracao: 'Configuração de estorno', tabelaId: 'Tabela', excecaoIndividual: 'Exceção individual', vigenteDe: 'Vigente de', vigenteAte: 'Vigente até',
  codigo: 'Código', nome: 'Nome', regraId: 'Regra', parcelasPagasPeloCliente: 'Parcelas pagas pelo cliente', liberada: 'Liberada', campo: 'Campo',
  participantes: 'Participantes', dataCancelamento: 'Data do cancelamento', origemDaData: 'Origem da data', pessoaId: 'Pessoa', vendedorId: 'Documento',
  motivo: 'Motivo', linhaOriginalId: 'Linha original', devido: 'Devido', jaFechado: 'Já fechado em folha', id: 'Id',
};

function valor(v: unknown): ReactNode {
  if (v === null || v === undefined) return <span className="text-wr-texto-3">—</span>;
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-wr-texto-3">—</span>;
    if (typeof v[0] === 'object') return <div className="space-y-1">{v.map((x, i) => <Bloco key={i} dados={x as Record<string, unknown>} />)}</div>;
    return v.join(', ');
  }
  if (typeof v === 'object') return <Bloco dados={v as Record<string, unknown>} />;
  return <span className="numero whitespace-normal">{String(v)}</span>;
}

function Bloco({ dados }: { dados: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-3 gap-y-0.5 rounded border border-wr-borda bg-wr-superficie p-2 text-[12px]">
      {Object.entries(dados).filter(([k]) => k !== 'formula').map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-wr-texto-3">{ROTULOS[k] ?? k}</dt>
          <dd className="min-w-0 break-words">{valor(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Memória de cálculo: responde "de onde saiu esse valor?" sem ninguém abrir código. */
export function MemoriaDeCalculo({ memoria, rotulo = 'De onde saiu' }: { memoria: unknown; rotulo?: string }) {
  if (!memoria || typeof memoria !== 'object') return <span className="text-wr-texto-3">—</span>;
  const m = memoria as Record<string, unknown>;
  return (
    <details className="group">
      <summary className="cursor-pointer text-[12px] font-semibold text-wr-verde">{rotulo}</summary>
      <div className="mt-2 space-y-2 min-w-[320px]">
        {typeof m.formula === 'string' ? <p className="numero whitespace-normal rounded bg-wr-verde-claro px-2 py-1.5 text-[12px] font-semibold text-wr-escuro">{m.formula}</p> : null}
        <Bloco dados={m} />
      </div>
    </details>
  );
}
