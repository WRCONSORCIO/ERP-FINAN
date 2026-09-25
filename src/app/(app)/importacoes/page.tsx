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
import { EnviarEProcessar, ProcessarTudo } from '@/ui/processar-tudo';
import { CONSERTO_PENDENCIA, ROTULO_PENDENCIA } from '@/ui/rotulos';
import {
  processarEtapaAcao, receberArquivoAcao, reprocessarErrosAcao, salvarLayoutCarteiraAcao, salvarLayoutPdfAcao,
} from './acoes';

export const metadata: Metadata = { title: 'Importações' };
export const dynamic = 'force-dynamic';

export default async function Importacoes({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('importacoes');
  const sp = await searchParams;
  const d = await painelImportacoes(s, param(sp, 'importacao') || null);
  const editar = pode(s.perfil, 'importacoes', 'editar');
  const faltaLinhas = d.faltaAplicar.reduce((t, i) => t + i._count.linhas, 0);

  return (
    <Pagina titulo="Importações" descricao="Envie aqui os arquivos da administradora. O sistema reconhece o tipo sozinho, grava as vendas e calcula comissões e estornos. Enviar o mesmo arquivo de novo não duplica nada.">
      {editar ? (
        <Secao titulo="Enviar arquivo" descricao="Base de clientes (planilha CSV) ou relatórios CV056E, CV069E e GC070A (PDF). O total do arquivo é conferido com o rodapé.">
          <EnviarEProcessar enviar={receberArquivoAcao} acao={processarEtapaAcao}>
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <Campo rotulo="Administradora" nome="administradoraId">
                <select id="administradoraId" name="administradoraId" className="campo">{d.administradoras.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
              </Campo>
              <Campo rotulo="Arquivo (até 20 MB)" nome="arquivo">
                <input id="arquivo" name="arquivo" type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" className="campo py-1" required />
              </Campo>
            </div>
          </EnviarEProcessar>
        </Secao>
      ) : null}

      <Secao titulo="Situação" descricao="Depois de cadastrar vendedores, equipes ou regras, clique em “Processar pendências agora” para as vendas paradas usarem o cadastro novo.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { n: faltaLinhas, t: 'linha(s) de arquivo ainda não gravada(s)' },
            { n: d.filaPendente, t: 'venda(s) aguardando cálculo' },
            { n: d.semEstrutura, t: 'venda(s) com cadastro incompleto (vendedor, equipe, categoria…)' },
          ].map((x) => (
            <div key={x.t} className={`rounded-lg border-l-4 bg-wr-fundo px-3 py-2 ${x.n === 0 ? 'border-l-wr-verde' : 'border-l-wr-ambar'}`}>
              <p className={`numero text-[22px] font-bold leading-none ${x.n === 0 ? 'text-wr-verde' : 'text-wr-ambar'}`}>{x.n.toLocaleString('pt-BR')}</p>
              <p className="mt-1 text-[12px] text-wr-texto-2">{x.t}</p>
            </div>
          ))}
        </div>
        {editar ? <div className="mt-3"><ProcessarTudo acao={processarEtapaAcao} /></div> : null}
        {d.filaErro.length > 0 ? (
          <div className="mt-3 space-y-1 text-[12px]">
            <p className="font-semibold">{d.filaErro.length} venda(s) deram erro no cálculo:</p>
            {d.filaErro.slice(0, 5).map((e) => <p key={e.id} className="text-wr-vermelho">{e.cota ? <Link href={`/clientes/${e.cotaId}`}>{e.cota.grupo}/{e.cota.cota}</Link> : '—'}: {e.ultimoErro?.slice(0, 140)}</p>)}
            {editar ? <FormularioAcao acao={reprocessarErrosAcao} rotulo="Tentar de novo" /> : null}
          </div>
        ) : null}
      </Secao>

      <Secao id="diagnostico" titulo="Vendas que ainda não geraram comissão" descricao="Cada motivo, quantas vendas, exemplos e como resolver. Resolvido o cadastro, clique em “Processar pendências agora”." semPadding>
        {d.diagnostico.length === 0 ? <EstadoVazio titulo="Nenhuma pendência" icone="ok">Todo dinheiro que deveria ter sido apurado foi apurado.</EstadoVazio> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Motivo</th><th className="direita">Vendas</th><th>Exemplos</th><th>Como resolver</th></tr></thead>
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
        <Secao titulo="Vendedor trocado pela administradora" descricao="O arquivo trouxe outro vendedor para estas vendas. Abra cada uma e escolha: aceitar a troca ou manter o vendedor atual." semPadding>
          <div className="tabela-quadro"><table className="tabela">
            <thead><tr><th>Cota</th><th>Cliente</th><th>Antes</th><th>Agora</th><th>Detectado</th></tr></thead>
            <tbody>{d.divergencias.map((v) => (
              <tr key={v.id}><td className="numero"><Link href={`/clientes/${v.cota.id}`}>{v.cota.grupo}/{v.cota.cota}</Link></td><td>{v.cota.clienteNome}</td><td>{v.nomeAnterior ?? v.docAnterior ?? '—'}</td><td className="font-semibold">{v.nomeNovo ?? v.docNovo ?? '—'}</td><td className="numero">{formatarDataHora(v.criadoEm)}</td></tr>
            ))}</tbody>
          </table></div>
        </Secao>
      ) : null}

      <Secao titulo="Arquivos enviados" descricao="“Confere” = o total do rodapé bate com o que foi lido. Se aparecer diferença, alguma linha não foi lida: veja antes de pagar a folha." semPadding>
        {d.historico.length === 0 ? <EstadoVazio titulo="Nenhum arquivo enviado ainda" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Arquivo</th><th>Tipo</th><th>Enviado</th><th className="direita">Linhas</th><th className="direita">Novos</th><th className="direita">Atualizados</th><th className="direita">Sem mudança</th><th className="direita">Não lidas</th><th className="direita">Vendedor trocado</th><th>Total</th><th>Situação</th></tr></thead>
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
                      <td>{i.status === 'APLICADA' ? <Etiqueta tom="verde">processado</Etiqueta> : i.status === 'FALHOU' ? <Etiqueta tom="vermelho">falhou</Etiqueta> : <Etiqueta tom="ambar">{i.status === 'APLICANDO' ? 'processando' : 'falta processar'}</Etiqueta>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao id="erros" titulo={`Linhas não reconhecidas${d.selecionada ? ` · ${d.selecionada.nomeArquivo}` : ''}`} descricao="Linhas do arquivo que o sistema não conseguiu ler, com o motivo e o conteúdo original." semPadding>
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
        <Dobra chave="layout-arquivos" titulo="Avançado: como o sistema lê cada arquivo" resumo="só mexa se um arquivo real não for lido corretamente">
          <div className="space-y-6 p-4">
            <div>
              <p className="mb-2 text-[13px] font-semibold">Base de clientes (CSV)</p>
              <p className="mb-2 text-[12px] text-wr-texto-2">Para cada informação, os nomes de coluna aceitos no arquivo (separados por vírgula; comparados sem acento e sem caixa). “Situações canceladas” = trechos da situação que indicam venda cancelada.</p>
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
