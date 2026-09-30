import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirPagina } from '@/servidor/sessao';
import { painelCartas } from '@/servidor/consultas/cartas-dashboard';
import { Cartao, DataCurta, Dinheiro, EstadoVazio, Etiqueta, Pagina, Secao } from '@/ui/base';
import { GraficoBarras } from '@/ui/grafico-barras';

export const metadata: Metadata = { title: 'Dashboard — Cartas' };
export const dynamic = 'force-dynamic';

export default async function DashboardCartas() {
  const s = await exigirPagina('cartas');
  const p = await painelCartas(s);

  return (
    <Pagina titulo="Dashboard — Cartas contempladas" descricao="Visão geral do módulo: estoque, vendas, intermediação e lucro.">
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-5">
        <Cartao destaque rotulo="Lucro total" valor={<Dinheiro valor={p.lucroTotal} />} tom={p.lucroTotal.isNegative() ? 'vermelho' : 'verde'} />
        <Cartao rotulo="Negociadas" valor={p.totalNegociadas} tom="azul" />
        <Cartao rotulo="Em estoque" valor={p.emEstoqueQtd} tom="ambar" detalhe={<Dinheiro valor={p.valorEmEstoque} />} />
        <Cartao rotulo="Vendidas" valor={p.vendidasQtd} tom="verde" />
        <Cartao rotulo="Intermediação" valor={p.intermediacoesQtd} tom="neutro" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Secao titulo="Lucro por mês" descricao="Últimos 6 meses, pelas cartas vendidas (pela data da venda).">
          {p.serie.every((x) => x.valor.isZero()) ? <EstadoVazio titulo="Sem vendas registradas ainda" icone="cartas" /> : <GraficoBarras serie={p.serie} destaque={p.competenciaAtual} />}
        </Secao>
        <Secao titulo="Últimas cartas cadastradas">
          {p.ultimas.length === 0 ? <EstadoVazio titulo="Nenhuma carta cadastrada ainda" icone="cartas" /> : (
            <ul className="space-y-2">
              {p.ultimas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 border-b border-wr-borda pb-2 text-[13px] last:border-0 last:pb-0">
                  <Link href={`/cartas/${c.id}`} className="min-w-0 text-wr-texto no-underline hover:underline">
                    <p className="truncate font-semibold">{c.codigo} · {c.administradora.nome}</p>
                    <p className="truncate text-[12px] text-wr-texto-2">{c.clienteVendedor.nome} · <DataCurta valor={c.dataCompra} /></p>
                  </Link>
                  {c.status === 'VENDIDA' ? <Etiqueta tom="verde">Vendida</Etiqueta> : c.status === 'TRANSFERIDA' ? <Etiqueta tom="azul">Transferida</Etiqueta> : <Etiqueta tom="ambar">Estoque</Etiqueta>}
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </Pagina>
  );
}
