'use client';

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatarDocumento } from '@/lib/documento';
import type { ItemLote, PreviaLote, ResultadoItemLote } from '@/servidor/servicos/cadastro-lote';
import { classeBotao } from '@/ui/base';
import { executarCadastroLoteAcao, previaCadastroLoteAcao } from './acoes';

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

/** Planilha → prévia (nada gravado) → confirmar → cadastra de poucos em poucos, mostrando o andamento. */
export function CadastroLote() {
  const router = useRouter();
  const [lendo, startLer] = useTransition();
  const [previa, setPrevia] = useState<PreviaLote | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [separar, setSeparar] = useState<Set<string>>(new Set());
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<Map<string, ResultadoItemLote>>(new Map());

  function ler(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null); setPrevia(null); setResultados(new Map());
    startLer(async () => {
      const r = await previaCadastroLoteAcao(fd);
      if (!r.ok || !r.dados) { setErro(r.mensagem); return; }
      setPrevia(r.dados);
      setMarcados(new Set(r.dados.cadastrar.map((i) => i.documento)));
      setSeparar(new Set());
    });
  }

  async function cadastrar() {
    if (!previa) return;
    setRodando(true);
    const itens = previa.cadastrar.filter((i) => marcados.has(i.documento) && !resultados.get(i.documento)?.ok);
    const mapa = new Map(resultados);
    try {
      for (let k = 0; k < itens.length; k += 2) {
        const pedaco = itens.slice(k, k + 2).map((i) => ({
          linha: i.linha, documento: i.documento, tipo: i.tipo, nome: i.nome, inicio: i.inicio, categoriaId: i.categoriaId,
          gerencia: i.gerencia, equipe: i.equipe,
          juntarCom: separar.has(i.documento) ? [] : i.juntarCom.filter((j) => !separar.has(j.documento)).map((j) => j.documento),
          pessoaExistenteId: separar.has(i.documento) ? null : i.pessoaExistente?.id ?? null,
        }));
        const r = await executarCadastroLoteAcao(pedaco);
        if (!r.ok || !r.dados) { setErro(r.mensagem); break; }
        for (const x of r.dados) mapa.set(x.documento, x);
        setResultados(new Map(mapa));
      }
    } catch {
      setErro('A conexão caiu no meio. O que já foi cadastrado está gravado; clique de novo para continuar os que faltam.');
    } finally {
      setRodando(false);
      router.refresh();
    }
  }

  const alternar = (conj: Set<string>, set: (s: Set<string>) => void, doc: string) => {
    const n = new Set(conj);
    if (n.has(doc)) n.delete(doc); else n.add(doc);
    set(n);
  };
  const feitos = [...resultados.values()].filter((r) => r.ok).length;
  const falhas = [...resultados.values()].filter((r) => !r.ok).length;
  const aCadastrar = previa ? previa.cadastrar.filter((i) => marcados.has(i.documento) && !resultados.get(i.documento)?.ok).length : 0;

  return (
    <div className="space-y-3 p-4">
      <p className="text-[13px] text-wr-texto-2">
        Colunas da planilha (.xlsx ou .csv): <strong>CPF/CNPJ</strong>, <strong>Nome do vendedor</strong>, <strong>Primeira venda</strong> (vira a data de início da categoria e da equipe), <strong>Gerência</strong>, <strong>Equipe</strong> e <strong>Categoria</strong>.
        Opcional: <strong>Mesma pessoa</strong> (o CPF/CNPJ com quem juntar). CPF e CNPJ da mesma pessoa são juntados pelo nome; nada é gravado antes de você conferir.
      </p>
      <form onSubmit={ler} className="flex flex-wrap items-end gap-2">
        <input name="arquivo" type="file" accept=".xlsx,.csv,.txt" className="campo max-w-sm py-1" required />
        <button type="submit" disabled={lendo || rodando} className={classeBotao('secundario')}>{lendo ? 'Lendo…' : 'Ler a planilha'}</button>
      </form>
      {erro ? <p role="alert" className="text-[13px] font-semibold text-wr-vermelho">{erro}</p> : null}

      {previa ? (
        <div className="space-y-3">
          <p className="text-[13px]">
            <strong>{previa.cadastrar.length}</strong> para cadastrar · <strong>{previa.jaCadastrados.length}</strong> já cadastrado(s) · <strong>{previa.erros.length}</strong> com problema.
            {previa.cadastrar.some((i) => i.criarGerencia || i.criarEquipe) ? ' Gerências/equipes marcadas como “nova” serão criadas (sem supervisor: defina depois em Estrutura).' : ''}
          </p>

          {previa.erros.length > 0 ? (
            <div className="rounded-lg border-l-4 border-l-wr-vermelho bg-wr-fundo px-3 py-2 text-[12px]">
              <p className="font-semibold">Não serão cadastrados (corrija na planilha e leia de novo):</p>
              {previa.erros.map((e) => <p key={`${e.linha}-${e.documento}`}>Linha {e.linha}: {e.nome || '—'} {e.documento ? `(${formatarDocumento(e.documento)})` : ''} — {e.erro}</p>)}
            </div>
          ) : null}
          {previa.jaCadastrados.length > 0 ? (
            <div className="rounded-lg border-l-4 border-l-wr-ambar bg-wr-fundo px-3 py-2 text-[12px]">
              <p className="font-semibold">Já cadastrados (não mexo):</p>
              {previa.jaCadastrados.map((e) => (
                <p key={e.documento}>Linha {e.linha}: <Link href={`/vendedores/${e.pessoaId}`}>{e.nome}</Link> ({formatarDocumento(e.documento)}){e.aviso ? <span className="text-wr-ambar"> — {e.aviso}</span> : null}</p>
              ))}
            </div>
          ) : null}

          {previa.cadastrar.length > 0 ? (
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Cadastrar</th><th>Linha</th><th>CPF/CNPJ</th><th>Nome</th><th>Categoria</th><th>Gerência › Equipe</th><th>Desde</th><th>Mesma pessoa que</th><th>Resultado</th></tr></thead>
                <tbody>
                  {previa.cadastrar.map((i: ItemLote) => {
                    const res = resultados.get(i.documento);
                    const junto = [...i.juntarCom.filter((j) => !separar.has(j.documento)).map((j) => `${j.nome} (${formatarDocumento(j.documento)})`), ...(i.pessoaExistente ? [`${i.pessoaExistente.nome} (já cadastrada)`] : [])];
                    return (
                      <tr key={i.documento}>
                        <td><input type="checkbox" aria-label={`Cadastrar ${i.nome}`} checked={marcados.has(i.documento)} disabled={rodando || res?.ok} onChange={() => alternar(marcados, setMarcados, i.documento)} /></td>
                        <td className="numero">{i.linha}</td>
                        <td className="numero whitespace-nowrap">{formatarDocumento(i.documento)}</td>
                        <td>{i.nome}</td>
                        <td>{i.categoriaNome}</td>
                        <td className="text-[12px]">{i.gerencia}{i.criarGerencia ? ' (nova)' : ''} › {i.equipe}{i.criarEquipe ? ' (nova)' : ''}</td>
                        <td className="numero">{dataBr(i.inicio)}</td>
                        <td className="text-[12px]">
                          {junto.length === 0 || separar.has(i.documento) ? <span className="text-wr-texto-3">pessoa nova</span> : (
                            <>
                              {junto.join(' · ')}
                              {i.conferir ? <span className="block font-semibold text-wr-ambar">nome parecido: confira</span> : null}
                            </>
                          )}
                          {junto.length > 0 ? (
                            <label className="mt-1 flex items-center gap-1 text-wr-texto-3">
                              <input type="checkbox" checked={separar.has(i.documento)} disabled={rodando || res?.ok} onChange={() => alternar(separar, setSeparar, i.documento)} /> não é a mesma pessoa
                            </label>
                          ) : null}
                        </td>
                        <td className={`text-[12px] ${res ? (res.ok ? 'text-wr-verde' : 'text-wr-vermelho') : 'text-wr-texto-3'}`}>{res ? res.mensagem : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {previa.cadastrar.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={rodando || aCadastrar === 0} onClick={() => void cadastrar()} className={classeBotao('primario')}>
                {rodando ? `Cadastrando… ${feitos + falhas} de ${feitos + falhas + aCadastrar}` : `Cadastrar ${aCadastrar} documento(s)`}
              </button>
              {resultados.size > 0 && !rodando ? (
                <p role="status" className="text-[13px]">
                  <strong className="text-wr-verde">{feitos} cadastrado(s)</strong>{falhas > 0 ? <> · <strong className="text-wr-vermelho">{falhas} com erro</strong> (veja a coluna Resultado)</> : null}.
                  {' '}Agora vá em <Link href="/importacoes">Importações</Link> e clique em “Processar pendências agora” para calcular as vendas deles.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
