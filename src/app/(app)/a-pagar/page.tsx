import type { Metadata } from 'next';
import Link from 'next/link';
import { formatarDataHora, rotuloMesLongo, deslocarCompetencia } from '@/lib/datas';
import { formatarDocumento } from '@/lib/documento';
import { formatarMoeda } from '@/lib/dinheiro';
import { pode } from '@/lib/permissoes';
import { ROTULO_DESTINO, type Destino } from '@/dominio/comissao';
import { exigirPagina } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { aPagar, competenciaPadrao, detalheBeneficiario, folhas, previaFechamento } from '@/servidor/consultas/a-pagar';
import { Aviso, Campo, Cartao, Dinheiro, EstadoVazio, Etiqueta, LinkBotao, Monograma, Pagina, Secao, classeBotao } from '@/ui/base';
import { FormularioAcao } from '@/ui/formulario-acao';
import { MemoriaDeCalculo } from '@/ui/memoria';
import { ROTULO_COMISSAO, TOM_COMISSAO } from '@/ui/rotulos';
import { fecharFolhaAcao, pagarFolhaAcao } from './acoes';

export const metadata: Metadata = { title: 'A Pagar' };
export const dynamic = 'force-dynamic';

export default async function APagar({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirPagina('comissoes');
  const sp = await searchParams;
  const pessoaSel = param(sp, 'pessoa');
  const competencia = /^\d{4}-\d{2}$/.test(param(sp, 'competencia')) ? param(sp, 'competencia') : competenciaPadrao();
  const podeEditar = pode(s.perfil, 'comissoes', 'editar');
  const [d, lista, detalhe, previa] = await Promise.all([
    aPagar(s), folhas(s), pessoaSel ? detalheBeneficiario(s, pessoaSel) : Promise.resolve(null), podeEditar ? previaFechamento(s, competencia) : Promise.resolve(null),
  ]);
  const nomeSel = d.linhas.find((l) => l.pessoaId === pessoaSel)?.nome;

  return (
    <Pagina
      titulo="A Pagar"
      descricao="Quanto a WR deve a cada pessoa, e por quê. Agrupado por beneficiário — a pessoa, unificando CPF e CNPJ. A WR paga pelo que o CLIENTE já pagou: só o liberado entra na folha."
      acoes={<LinkBotao href="/exportar/a-pagar" icone="download" download>Exportar</LinkBotao>}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao destaque rotulo="Liberado a pagar" valor={<Dinheiro valor={d.totais.liberado} />} detalhe="Parcela paga pelo cliente, fora de folha" />
        <Cartao rotulo="Previsto total" valor={<Dinheiro valor={d.totais.previsto} />} tom="azul" detalhe="Liberado + parcelas que o cliente ainda vai pagar" />
        <Cartao rotulo="Já em folha" valor={<Dinheiro valor={d.totais.emFolha} />} tom="neutro" detalhe="Folhas fechadas ainda não pagas" />
        <Cartao rotulo="Estorno a cobrar" valor={<Dinheiro valor={d.totais.estornoACobrar} />} tom="ambar" detalhe="Informação: não é descontado automaticamente da folha" href="/estornos" />
      </div>
      {!d.estornoSemTitular.isZero() ? <Aviso tom="vermelho" titulo="Estorno sem titular">{formatarMoeda(d.estornoSemTitular)} em estornos não têm de quem ser cobrados. Veja em <Link href="/estornos">Estornos</Link>.</Aviso> : null}

      <Secao titulo="Beneficiários" descricao="Clique no nome para ver o detalhe por cota e parcela, com a memória de cálculo de cada valor." semPadding>
        {d.linhas.length === 0 ? <EstadoVazio titulo="Nada a pagar">Sem comissões apuradas pagas pela WR no seu recorte.</EstadoVazio> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Beneficiário</th><th className="direita">Previsto</th><th className="direita">Liberado</th><th className="direita">Em folha</th><th className="direita">Estorno a cobrar</th></tr></thead>
              <tbody>
                {d.linhas.map((l) => (
                  <tr key={l.pessoaId} className={l.pessoaId === pessoaSel ? 'bg-wr-verde-claro/50' : ''}>
                    <td><Link href={`/a-pagar?pessoa=${l.pessoaId}#detalhe`} className="flex items-center gap-2 font-semibold text-wr-texto"><Monograma nome={l.nome} tamanho={24} />{l.nome}</Link></td>
                    <td className="direita"><Dinheiro valor={l.previsto} /></td>
                    <td className="direita"><Dinheiro valor={l.liberado} tom="verde" forte /></td>
                    <td className="direita"><Dinheiro valor={l.emFolha} /></td>
                    <td className="direita">{l.estornoACobrar.isZero() ? <Dinheiro valor={l.estornoACobrar} /> : <Dinheiro valor={l.estornoACobrar} tom="ambar" />}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total</td><td className="direita"><Dinheiro valor={d.totais.previsto} /></td><td className="direita"><Dinheiro valor={d.totais.liberado} /></td><td className="direita"><Dinheiro valor={d.totais.emFolha} /></td><td className="direita"><Dinheiro valor={d.totais.estornoACobrar} /></td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </Secao>

      {detalhe ? (
        <Secao id="detalhe" titulo={`Detalhe · ${nomeSel ?? ''}`} descricao="Prevista = cliente ainda não pagou a parcela. Liberada = pode entrar na próxima folha." acoes={<LinkBotao href="/a-pagar" variante="fantasma" pequeno>Fechar detalhe</LinkBotao>} semPadding>
          {detalhe.length === 0 ? <EstadoVazio titulo="Nada em aberto para esta pessoa" /> : (
            <div className="tabela-quadro">
              <table className="tabela">
                <thead><tr><th>Cliente</th><th>Grupo/Cota</th><th>Papel</th><th>Documento</th><th className="direita">Parcela</th><th className="direita">Valor</th><th>Situação</th><th>De onde saiu</th></tr></thead>
                <tbody>
                  {detalhe.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/clientes/${c.cota.id}`}>{c.cota.clienteNome}</Link></td>
                      <td className="numero">{c.cota.grupo}/{c.cota.cota}</td>
                      <td>{ROTULO_DESTINO[c.destino as Destino]}{c.ajusteDeId ? <> <Etiqueta tom="azul">ajuste</Etiqueta></> : null}</td>
                      <td className="numero text-[12px]">{c.titularVendedor ? `${c.titularVendedor.tipoDocumento} ${formatarDocumento(c.titularVendedor.documento)}` : '—'}</td>
                      <td className="direita numero">{c.parcela}ª</td>
                      <td className="direita"><Dinheiro valor={c.valor} forte /></td>
                      <td><Etiqueta tom={TOM_COMISSAO[c.status] ?? 'neutro'}>{ROTULO_COMISSAO[c.status]}</Etiqueta>{c.folha ? <span className="block text-[11px] text-wr-texto-3">folha {c.folha.competencia}</span> : null}</td>
                      <td><MemoriaDeCalculo memoria={c.memoria} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      ) : null}

      {podeEditar ? (
        <Secao titulo="Fechar folha" descricao="Só o liberado entra. Fechar congela: as comissões incluídas não são mais afetadas por reapuração — correção vira ajuste na folha seguinte. Estorno não é descontado.">
          <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
            <Campo rotulo="Competência" nome="competencia-previa">
              <input id="competencia-previa" type="month" name="competencia" defaultValue={competencia} className="campo w-44" />
            </Campo>
            <button type="submit" className={classeBotao('secundario')}>Ver prévia</button>
          </form>
          {previa ? (
            <p className="mb-3 text-[13px]">Entrariam na folha de <strong>{rotuloMesLongo(previa.competencia)}</strong>: <span className="numero font-semibold">{previa.quantidade}</span> comissão(ões) liberada(s) até o fim do mês, total <Dinheiro valor={previa.total} forte />.</p>
          ) : null}
          <FormularioAcao acao={fecharFolhaAcao} rotulo={`Fechar folha de ${rotuloMesLongo(competencia)}`} perigo confirmacao="Fechar a folha é irreversível: as comissões incluídas ficam congeladas nesta folha. Correções futuras entram como ajuste na próxima folha.">
            <input type="hidden" name="competencia" value={competencia} />
          </FormularioAcao>
          <p className="mt-2 text-[12px] text-wr-texto-3">Competência anterior: <Link href={`/a-pagar?competencia=${deslocarCompetencia(competencia, -1)}`}>{rotuloMesLongo(deslocarCompetencia(competencia, -1))}</Link></p>
        </Secao>
      ) : null}

      <Secao titulo="Folhas" descricao="Folha fechada é imutável. Marcar como paga registra data real, valor efetivamente pago e referência — divergência fica registrada." semPadding>
        {lista.length === 0 ? <EstadoVazio titulo="Nenhuma folha fechada ainda" /> : (
          <div className="tabela-quadro">
            <table className="tabela">
              <thead><tr><th>Competência</th><th>Fechada em</th><th className="direita">Comissões</th><th className="direita">Total</th><th>Situação</th><th>Exportar</th>{podeEditar ? <th>Pagamento</th> : null}</tr></thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td className="font-semibold">{rotuloMesLongo(f.competencia)}</td>
                    <td className="numero">{formatarDataHora(f.fechadaEm)}</td>
                    <td className="direita numero">{f.quantidade}</td>
                    <td className="direita"><Dinheiro valor={f.total} forte /></td>
                    <td>
                      {f.status === 'PAGA' ? <Etiqueta tom="verde">paga em {formatarDataHora(f.pagaEm)}</Etiqueta> : <Etiqueta tom="azul">fechada</Etiqueta>}
                      {f.valorPagoInformado ? <span className="block text-[11px] text-wr-texto-3">pago: {formatarMoeda(f.valorPagoInformado)}{f.referenciaPagamento ? ` · ${f.referenciaPagamento}` : ''}</span> : null}
                      {f.observacao ? <span className="block text-[11px] text-wr-ambar">{f.observacao}</span> : null}
                    </td>
                    <td className="whitespace-nowrap"><a href={`/exportar/folha?id=${f.id}&formato=xlsx`} download>XLSX</a> · <a href={`/exportar/folha?id=${f.id}&formato=csv`} download>CSV</a></td>
                    {podeEditar ? (
                      <td>
                        {f.status === 'FECHADA' ? (
                          <FormularioAcao acao={pagarFolhaAcao} rotulo="Marcar paga" emLinha confirmacao="Registra o pagamento desta folha. Folha paga não muda mais.">
                            <input type="hidden" name="folhaId" value={f.id} />
                            <input type="date" name="dataPagamento" aria-label="Data do pagamento" className="campo w-36" required />
                            <input name="valorPago" aria-label="Valor pago" placeholder="Valor pago" defaultValue={formatarMoeda(f.total, { semSimbolo: true })} className="campo numero w-32" required />
                            <input name="referencia" aria-label="Referência" placeholder="Referência/comprovante" className="campo w-44" />
                          </FormularioAcao>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </Pagina>
  );
}
