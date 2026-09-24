import type { Metadata } from 'next';
import Link from 'next/link';
import { formatarDataHora } from '@/lib/datas';
import { formatarMoeda } from '@/lib/dinheiro';
import { pode } from '@/lib/permissoes';
import { CAMPOS_CARTEIRA } from '@/dominio/importacao/layouts';
import { ROTULO_TIPO_ARQUIVO } from '@/dominio/importacao/deteccao';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { painelImportacoes } from '@/servidor/consultas/importacoes';
import { Campo, EstadoVazio, Etiqueta, Pagina, Secao } from '@/ui/base';
import { Dobra } from '@/ui/dobra';
import { FormularioAcao } from '@/ui/formulario-acao';
import { ProcessoEmLotes } from '@/ui/processo-em-lotes';
import { CONSERTO_PENDENCIA, ROTULO_PENDENCIA } from '@/ui/rotulos';
import {
  aplicarPendentesAcao, apurarFilaAcao, receberArquivoAcao, recongelarTodasAcao, reprocessarErrosAcao, salvarLayoutCarteiraAcao, salvarLayoutPdfAcao,
} from './acoes';

export const metadata: Metadata = { title: 'Importações' };
export const dynamic = 'force-dynamic';

function Operacao({ titulo, numero, rotulo, children, como }: { titulo: string; numero: number; rotulo: string; children: React.ReactNode; como: React.ReactNode }) {
  const zero = numero === 0;
  return (
    <div className={`cartao flex flex-col gap-3 border-l-4 p-4 ${zero ? 'border-l-wr-verde' : 'border-l-wr-ambar'}`}>
      <div>
        <p className="rotulo">{titulo}</p>
        <p className={`numero mt-1 text-[28px] font-bold leading-none ${zero ? 'text-wr-verde' : 'text-wr-ambar'}`}>{numero.toLocaleString('pt-BR')}</p>
        <p className="mt-1 text-[12px] text-wr-texto-2">{rotulo}</p>
      </div>
      <div>{children}</div>
      <details className="text-[12px] text-wr-texto-2">
        <summary className="cursor-pointer font-semibold text-wr-texto">Como funciona</summary>
        <div className="mt-1 space-y-1">{como}</div>
      </details>
    </div>
  );
}

export default async function Importacoes({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('importacoes');
  const sp = await searchParams;
  const d = await painelImportacoes(s, param(sp, 'importacao') || null);
  const editar = pode(s.perfil, 'importacoes', 'editar');
  const faltaLinhas = d.faltaAplicar.reduce((t, i) => t + i._count.linhas, 0);

  return (
    <Pagina titulo="Importações" descricao="Os quatro arquivos que a administradora libera. O tipo é reconhecido pelo conteúdo, não pelo nome. Reimportar é inofensivo; nada some em silêncio.">
      <div className="grid gap-3 lg:grid-cols-3">
        <Operacao titulo="Falta aplicar" numero={faltaLinhas} rotulo={`linha(s) em ${d.faltaAplicar.length} importação(ões) interrompida(s) ou recém-enviada(s)`}
          como={<><p>O arquivo é lido e guardado de uma vez; a aplicação é feita em lotes curtos (cada lote cabe no tempo de uma requisição), retomando de onde parou.</p><p>Pode interromper e retomar: nenhuma linha é aplicada duas vezes.</p></>}>
          {d.faltaAplicar.length > 0 ? (
            <ul className="mb-2 space-y-1">
              {d.faltaAplicar.map((i) => (
                <li key={i.id} className="text-[12px]"><strong>{i.nomeArquivo}</strong> · {ROTULO_TIPO_ARQUIVO[i.tipo]} · <span className="numero">{i._count.linhas}</span> pendente(s)</li>
              ))}
            </ul>
          ) : null}
          {editar ? <ProcessoEmLotes acao={aplicarPendentesAcao} rotulo="Aplicar pendentes" /> : null}
        </Operacao>
        <Operacao titulo="Fila de recálculo" numero={d.filaPendente} rotulo={`venda(s) aguardando apuração${d.filaErro.length > 0 ? ` · ${d.filaErro.length} com erro` : ''}`}
          como={<><p>Todo pedido de apuração é gravado junto com a venda, na mesma transação: nenhuma venda entra sem que a apuração seja pedida.</p><p>Uma falha não interrompe o restante do lote; a venda que falhou é tentada de novo depois de uma espera (1, 2, 4, 8 min) e vira erro após 5 tentativas.</p></>}>
          {editar ? <ProcessoEmLotes acao={apurarFilaAcao} rotulo="Apurar tudo" /> : null}
          {d.filaErro.length > 0 ? (
            <div className="mt-2 space-y-1 text-[12px]">
              {d.filaErro.slice(0, 5).map((e) => <p key={e.id} className="text-wr-vermelho">{e.cota ? <Link href={`/clientes/${e.cotaId}`}>{e.cota.grupo}/{e.cota.cota}</Link> : '—'}: {e.ultimoErro?.slice(0, 140)}</p>)}
              {editar ? <FormularioAcao acao={reprocessarErrosAcao} rotulo="Recolocar erros na fila" /> : null}
            </div>
          ) : null}
        </Operacao>
        <Operacao titulo="Sem categoria ou sem estrutura" numero={d.semEstrutura} rotulo="venda(s) com snapshot incompleto — não geram (toda) a comissão"
          como={<><p>Recongelar resolve o snapshot pelo cadastro de HOJE, mas na data ORIGINAL da venda. Só as vendas com pendência de cadastro ou estrutura são tocadas.</p><p>Antes, conserte o cadastro (veja o diagnóstico abaixo).</p></>}>
          {editar ? <ProcessoEmLotes acao={recongelarTodasAcao} rotulo="Recongelar todas" confirmacao="Recongela o snapshot das vendas pendentes pelo cadastro atual, na data da venda. As que mudarem vão para a fila de apuração." /> : null}
        </Operacao>
      </div>

      {editar ? (
        <Secao titulo="Enviar arquivo" descricao="Base de clientes (CSV Latin-1, separado por ;) ou relatórios CV056E, CV069E e GC070A (PDF). Cada arquivo é conferido contra o total impresso no próprio rodapé.">
          <FormularioAcao acao={receberArquivoAcao} rotulo="Enviar e ler">
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <Campo rotulo="Administradora" nome="administradoraId">
                <select id="administradoraId" name="administradoraId" className="campo">{d.administradoras.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
              </Campo>
              <Campo rotulo="Arquivo (até 20 MB)" nome="arquivo">
                <input id="arquivo" name="arquivo" type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" className="campo py-1" required />
              </Campo>
            </div>
          </FormularioAcao>
        </Secao>
      ) : null}

      <Secao id="diagnostico" titulo="Por que essas vendas continuam pendentes" descricao="Dinheiro não apurado vira fila de trabalho: cada motivo com a quantidade, exemplos e o conserto." semPadding>
        {d.diagnostico.length === 0 ? <EstadoVazio titulo="Nenhuma pendência" icone="ok">Todo dinheiro que deveria ter sido apurado foi apurado.</EstadoVazio> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Motivo</th><th className="direita">Quantidade</th><th>Exemplos</th><th>Conserto</th></tr></thead>
              <tbody>
                {d.diagnostico.map((p) => (
                  <tr key={p.tipo}>
                    <td className="font-semibold">{ROTULO_PENDENCIA[p.tipo] ?? p.tipo}</td>
                    <td className="direita numero"><Etiqueta tom={p.tipo === 'AJUSTE_FOLHA_FECHADA' ? 'azul' : 'ambar'}>{p.quantidade}</Etiqueta></td>
                    <td className="text-[12px]">{p.exemplos.map((e) => e.cota ? <Link key={e.id} href={`/clientes/${e.cota.id}`} className="mr-2 numero">{e.cota.grupo}/{e.cota.cota}</Link> : null)}<span className="block text-wr-texto-3">{p.exemplos[0]?.descricao}</span></td>
                    <td className="max-w-md text-[12px] text-wr-texto-2">{CONSERTO_PENDENCIA[p.tipo] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {d.divergencias.length > 0 ? (
        <Secao titulo="Vendedor corrigido pela administradora" descricao="Nunca aceito em silêncio: decida na ficha de cada cota (aceitar = transferência registrada; manter = registrado)." semPadding>
          <div className="tabela-quadro"><table className="tabela">
            <thead><tr><th>Cota</th><th>Cliente</th><th>Antes</th><th>Agora</th><th>Detectado</th></tr></thead>
            <tbody>{d.divergencias.map((v) => (
              <tr key={v.id}><td className="numero"><Link href={`/clientes/${v.cota.id}`}>{v.cota.grupo}/{v.cota.cota}</Link></td><td>{v.cota.clienteNome}</td><td>{v.nomeAnterior ?? v.docAnterior ?? '—'}</td><td className="font-semibold">{v.nomeNovo ?? v.docNovo ?? '—'}</td><td className="numero">{formatarDataHora(v.criadoEm)}</td></tr>
            ))}</tbody>
          </table></div>
        </Secao>
      ) : null}

      <Secao titulo="Histórico" descricao="Conferência = total impresso no rodapé × total reconhecido. Diferente de zero significa linha não reconhecida — descubra antes de pagar a folha." semPadding>
        {d.historico.length === 0 ? <EstadoVazio titulo="Nenhum arquivo enviado ainda" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Arquivo</th><th>Tipo</th><th>Enviado</th><th className="direita">Linhas</th><th className="direita">Novos</th><th className="direita">Atualiz.</th><th className="direita">Repetidos</th><th className="direita">Erros</th><th className="direita">Diverg.</th><th>Conferência</th><th>Situação</th></tr></thead>
              <tbody>
                {d.historico.map((i) => {
                  const dif = i.diferencaConferencia;
                  return (
                    <tr key={i.id} className={d.selecionada?.id === i.id ? 'bg-wr-verde-claro/50' : ''}>
                      <td className="max-w-[240px] truncate"><Link href={`/importacoes?importacao=${i.id}#erros`} title={`sha256 ${i.hashArquivo}`}>{i.nomeArquivo}</Link>{i.mensagem ? <span className="block text-[11px] text-wr-texto-3">{i.mensagem}</span> : null}</td>
                      <td>{ROTULO_TIPO_ARQUIVO[i.tipo]}</td>
                      <td className="numero">{formatarDataHora(i.enviadoEm)}</td>
                      <td className="direita numero">{i.totalLinhas}</td>
                      <td className="direita numero">{i.novos}</td>
                      <td className="direita numero">{i.atualizados}</td>
                      <td className="direita numero">{i.repetidos}</td>
                      <td className="direita numero">{i.erros > 0 ? <Etiqueta tom="vermelho">{i.erros}</Etiqueta> : 0}</td>
                      <td className="direita numero">{i.divergencias > 0 ? <Etiqueta tom="ambar">{i.divergencias}</Etiqueta> : 0}</td>
                      <td>{dif === null ? <span className="text-[12px] text-wr-texto-3">sem total no arquivo</span> : dif.isZero() ? <Etiqueta tom="verde">confere</Etiqueta> : <Etiqueta tom="vermelho" titulo={`arquivo ${formatarMoeda(i.totalArquivo)} × reconhecido ${formatarMoeda(i.totalReconhecido)}`}>diferença {formatarMoeda(dif)}</Etiqueta>}</td>
                      <td>{i.status === 'APLICADA' ? <Etiqueta tom="verde">aplicada</Etiqueta> : i.status === 'FALHOU' ? <Etiqueta tom="vermelho">falhou</Etiqueta> : <Etiqueta tom="ambar">{i.status === 'APLICANDO' ? 'aplicando' : 'falta aplicar'}</Etiqueta>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao id="erros" titulo={`Linhas não reconhecidas${d.selecionada ? ` · ${d.selecionada.nomeArquivo}` : ''}`} descricao="O conteúdo original de cada linha, com o motivo. Nada some em silêncio." semPadding>
        {d.erros.length === 0 ? <EstadoVazio titulo="Nenhuma linha com erro neste arquivo" icone="ok" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th className="direita">Linha</th><th>Motivo</th><th>Conteúdo original</th></tr></thead>
              <tbody>{d.erros.map((e) => <tr key={e.id}><td className="direita numero">{e.linha}</td><td className="text-wr-vermelho">{e.motivo}</td><td><code className="numero block max-w-[720px] overflow-x-auto whitespace-pre text-[11px]">{e.conteudo}</code></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Secao>

      {editar ? (
        <Dobra chave="layout-arquivos" titulo="Layout dos arquivos" resumo="configuração de leitura, sem alterar código">
          <div className="space-y-6 p-4">
            <div>
              <p className="mb-2 text-[13px] font-semibold">Base de clientes (CSV)</p>
              <p className="mb-2 text-[12px] text-wr-texto-2">Para cada campo, os nomes de cabeçalho aceitos (separados por vírgula; comparados sem acento e sem caixa). “Situações canceladas” = trechos da situação que indicam venda cancelada.</p>
              <FormularioAcao acao={salvarLayoutCarteiraAcao} rotulo="Salvar layout da base" confirmacao="Vale para as próximas importações. Arquivos já importados não mudam.">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Campo rotulo="Separador" nome="separador"><input id="separador" name="separador" defaultValue={d.layouts.carteira.separador} maxLength={1} className="campo w-16" /></Campo>
                  <Campo rotulo="Situações canceladas" nome="situacoesCanceladas"><input id="situacoesCanceladas" name="situacoesCanceladas" defaultValue={d.layouts.carteira.situacoesCanceladas.join(', ')} className="campo" /></Campo>
                  {CAMPOS_CARTEIRA.map((c) => (
                    <Campo key={c} rotulo={c} nome={`col_${c}`}><input id={`col_${c}`} name={`col_${c}`} defaultValue={d.layouts.carteira.colunas[c].join(', ')} className="campo" /></Campo>
                  ))}
                </div>
              </FormularioAcao>
            </div>
            {(Object.entries(d.layouts.pdf) as Array<[keyof typeof d.layouts.pdf, (typeof d.layouts.pdf)[keyof typeof d.layouts.pdf]]>).map(([tipo, l]) => (
              <div key={tipo}>
                <p className="mb-2 text-[13px] font-semibold">{ROTULO_TIPO_ARQUIVO[tipo]}</p>
                <FormularioAcao acao={salvarLayoutPdfAcao} rotulo="Salvar layout" confirmacao="Vale para as próximas importações.">
                  <input type="hidden" name="tipo" value={tipo} />
                  <div className="grid gap-2">
                    <Campo rotulo="Marcador no conteúdo" nome={`m-${tipo}`}><input id={`m-${tipo}`} name="marcador" defaultValue={l.marcador} className="campo w-40" /></Campo>
                    <Campo rotulo="Expressão da linha (grupos nomeados: grupo, cota, valor, contrato, consorciado, parcela, tipo, data, vendedor, valorEvento, percentual)" nome={`l-${tipo}`}><textarea id={`l-${tipo}`} name="linha" defaultValue={l.linha} rows={3} className="campo numero text-[11px]" /></Campo>
                    <Campo rotulo="Expressão do total do rodapé (grupo: total)" nome={`t-${tipo}`}><input id={`t-${tipo}`} name="total" defaultValue={l.total} className="campo numero text-[11px]" /></Campo>
                    {tipo === 'FECHAMENTO_CV056E' ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Campo rotulo="Texto que indica cancelamento" nome="cancelamento"><input id="cancelamento" name="cancelamento" defaultValue={l.classificacao?.CANCELAMENTO.join(', ') ?? ''} className="campo" /></Campo>
                        <Campo rotulo="Texto que indica comissão de parcela" nome="comissao"><input id="comissao" name="comissao" defaultValue={l.classificacao?.COMISSAO_PARCELA.join(', ') ?? ''} className="campo" /></Campo>
                      </div>
                    ) : null}
                  </div>
                </FormularioAcao>
              </div>
            ))}
          </div>
        </Dobra>
      ) : null}
    </Pagina>
  );
}
