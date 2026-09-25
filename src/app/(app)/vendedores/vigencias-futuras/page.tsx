import type { Metadata } from 'next';
import Link from 'next/link';
import { formatarDocumento } from '@/lib/documento';
import { exigirPagina } from '@/servidor/sessao';
import { listarVigenciasFuturas } from '@/servidor/consultas/vendedores';
import { DataCurta, EstadoVazio, Pagina, Secao } from '@/ui/base';

export const metadata: Metadata = { title: 'Datas no futuro' };
export const dynamic = 'force-dynamic';

export default async function VigenciasFuturas() {
  const s = await exigirPagina('vendedores', 'editar');
  const { categorias, alocacoes } = await listarVigenciasFuturas(s);
  return (
    <Pagina titulo="Cadastros com data no futuro" descricao="Uma data no futuro não vale para nenhuma venda de hoje — costuma ser erro de digitação no ano. Corrija a data na ficha do vendedor.">
      <Secao titulo="Categorias" semPadding>
        {categorias.length === 0 ? <EstadoVazio titulo="Nenhuma categoria com início futuro" icone="ok" /> : (
          <div className="tabela-quadro"><table className="tabela">
            <thead><tr><th>Pessoa</th><th>Documento</th><th>Categoria</th><th>Começa em</th></tr></thead>
            <tbody>{categorias.map((c) => (
              <tr key={c.id}><td><Link href={`/vendedores/${c.vendedor.pessoaId}`}>{c.vendedor.pessoa.nome}</Link></td><td className="numero">{formatarDocumento(c.vendedor.documento)}</td><td>{c.categoria.nome}</td><td><DataCurta valor={c.vigenteDe} /></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Secao>
      <Secao titulo="Equipes" semPadding>
        {alocacoes.length === 0 ? <EstadoVazio titulo="Nenhuma equipe com início no futuro" icone="ok" /> : (
          <div className="tabela-quadro"><table className="tabela">
            <thead><tr><th>Pessoa</th><th>Documento</th><th>Equipe</th><th>Começa em</th></tr></thead>
            <tbody>{alocacoes.map((a) => (
              <tr key={a.id}><td><Link href={`/vendedores/${a.vendedor.pessoaId}`}>{a.vendedor.pessoa.nome}</Link></td><td className="numero">{formatarDocumento(a.vendedor.documento)}</td><td>{a.equipe.gerencia.nome} › {a.equipe.nome}</td><td><DataCurta valor={a.vigenteDe} /></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Secao>
    </Pagina>
  );
}
