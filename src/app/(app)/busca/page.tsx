import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatarDocumento } from '@/lib/documento';
import { obterSessao } from '@/servidor/sessao';
import { param, type Params } from '@/servidor/consultas/comum';
import { buscaGlobal } from '@/servidor/consultas/busca';
import { EstadoVazio, Etiqueta, Pagina, Secao } from '@/ui/base';

export const metadata: Metadata = { title: 'Busca' };
export const dynamic = 'force-dynamic';

export default async function Busca({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await obterSessao();
  if (!s) redirect('/login');
  const q = param(await searchParams, 'q');
  const r = await buscaGlobal(s, q);
  const vazio = r.cotas.length === 0 && r.vendedores.length === 0;
  return (
    <Pagina titulo="Busca" descricao={q ? <>Resultados para <strong>“{q}”</strong> dentro do seu recorte de visibilidade.</> : 'Digite no campo de busca do cabeçalho: cliente, vendedor, grupo/cota, contrato, CPF ou CNPJ.'}>
      {q.length > 0 && q.length < 2 ? <EstadoVazio titulo="Digite pelo menos 2 caracteres" /> : null}
      {q.length >= 2 && vazio ? <div className="cartao"><EstadoVazio titulo="Nada encontrado">Nenhum cliente, cota ou vendedor com este termo no seu recorte.</EstadoVazio></div> : null}
      {r.cotas.length > 0 ? (
        <Secao titulo={`Cotas (${r.cotas.length})`} semPadding>
          <ul className="divide-y divide-wr-borda">
            {r.cotas.map((c) => <li key={c.id} className="px-4 py-2 text-[13px]"><Link href={`/clientes/${c.id}`} className="font-semibold">{c.clienteNome}</Link> · <span className="numero">{c.grupo}/{c.cota}</span> · contrato <span className="numero">{c.contrato}</span> {c.cancelada ? <Etiqueta tom="vermelho">{c.situacao}</Etiqueta> : <Etiqueta>{c.situacao}</Etiqueta>}</li>)}
          </ul>
        </Secao>
      ) : null}
      {r.vendedores.length > 0 ? (
        <Secao titulo={`Vendedores (${r.vendedores.length})`} semPadding>
          <ul className="divide-y divide-wr-borda">
            {r.vendedores.map((v) => <li key={v.id} className="px-4 py-2 text-[13px]"><Link href={`/vendedores/${v.pessoaId}`} className="font-semibold">{v.nome}</Link> · <span className="numero">{v.tipoDocumento} {formatarDocumento(v.documento)}</span> {v.status === 'DESLIGADO' ? <Etiqueta tom="vermelho">desligado</Etiqueta> : null}</li>)}
          </ul>
        </Secao>
      ) : null}
    </Pagina>
  );
}
