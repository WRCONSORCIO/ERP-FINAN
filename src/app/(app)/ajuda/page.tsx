import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirPagina } from '@/servidor/sessao';
import { Pagina, Secao } from '@/ui/base';

export const metadata: Metadata = { title: 'Como usar' };
export const dynamic = 'force-dynamic';

const PASSOS: Array<{ titulo: string; href: string; onde: string; texto: string }> = [
  { titulo: 'Confira as regras', href: '/configuracoes', onde: 'Configurações', texto: 'Percentuais de comissão por categoria e parcela, regras e percentuais de estorno, metas de promoção e planos flex. Cada regra tem a data a partir da qual vale (pode ser passada).' },
  { titulo: 'Monte a estrutura', href: '/estrutura', onde: 'Estrutura', texto: 'Crie as gerências e as equipes e informe quem é o gerente e o supervisor de cada uma, desde quando.' },
  { titulo: 'Cadastre os vendedores', href: '/vendedores', onde: 'Vendedores', texto: 'CPF ou CNPJ, categoria (CPF = Iniciante; CNPJ = Veterano ou Expert), equipe e desde quando trabalha com a WR.' },
  { titulo: 'Envie os arquivos da administradora', href: '/importacoes', onde: 'Importações', texto: 'Primeiro a base de clientes (CSV), depois os relatórios em PDF. O sistema grava as vendas e calcula tudo sozinho.' },
  { titulo: 'Resolva o que ficou sem comissão', href: '/importacoes', onde: 'Importações', texto: 'A lista “Vendas que ainda não geraram comissão” diz o motivo e como resolver. Depois de acertar o cadastro, clique em “Processar pendências agora”.' },
  { titulo: 'Pague e cobre', href: '/a-pagar', onde: 'A Pagar e Estornos', texto: 'No fim do mês, feche a folha, exporte e marque como paga. Em Estornos, acompanhe o que precisa ser devolvido.' },
];

const TERMOS: Array<[string, string]> = [
  ['Cota / venda', 'Cada consórcio vendido (grupo/cota). Entra no sistema pela base de clientes.'],
  ['Crédito', 'Valor do bem do consórcio. É o que conta para a produção e para a meta de promoção.'],
  ['Plano flex', 'Reduz o valor sobre o qual a comissão é calculada: Flex 10 = comissão sobre 90% do crédito, Flex 30 = sobre 70%. Venda sem flex = Integral (crédito cheio).'],
  ['Segmento', 'Tipo de bem (Imóveis, Móveis…). Cada segmento tem seus percentuais.'],
  ['Categoria', 'Nível do vendedor (Iniciante, Veterano, Expert). Define quem paga a comissão dele e se gera comissão para supervisor e gerente.'],
  ['Comissão prevista', 'Calculada, mas o cliente ainda não pagou a parcela.'],
  ['Comissão liberada', 'O cliente pagou a parcela: pode entrar na folha.'],
  ['Folha', 'O fechamento do mês com as comissões liberadas. Fechada, não muda mais.'],
  ['Ajuste', 'Correção de uma comissão que já estava em folha fechada. Entra na folha seguinte (pode ser positiva ou negativa).'],
  ['Estorno', 'Parte da comissão que volta quando a venda é cancelada, conforme as regras de Configurações › Estornos.'],
  ['Período de recuperação', 'Período registrado na ficha do vendedor. Vendas feitas nele seguem a regra de estorno de recuperação.'],
  ['“A partir de”', 'Toda regra e todo cadastro valem a partir de uma data. Cada venda usa o que valia na data dela; mudar hoje não altera o que já foi calculado.'],
  ['Vendas sem comissão (pendências)', 'Vendas que não puderam ser calculadas por falta de cadastro ou regra. O dinheiro não some: fica aguardando até ser resolvido.'],
  ['CV056E', 'Relatório de fechamento da administradora (inclui os débitos de cancelamento).'],
  ['CV069E', 'Relatório da comissão que a administradora paga direto ao vendedor.'],
  ['GC070A', 'Relatório do bônus incentivo pago à WR.'],
];

export default async function Ajuda() {
  await exigirPagina('dashboard');
  return (
    <Pagina titulo="Como usar" descricao="O caminho para colocar o sistema para funcionar e o que significa cada termo.">
      <Secao titulo="Passo a passo">
        <ol className="space-y-3">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="flex gap-3">
              <span className="numero flex size-7 shrink-0 items-center justify-center rounded-full bg-wr-verde text-[13px] font-bold text-white">{i + 1}</span>
              <div className="min-w-0 text-[14px]">
                <p className="font-semibold">{p.titulo} <Link href={p.href} className="text-[12px] font-normal">— abrir {p.onde}</Link></p>
                <p className="text-wr-texto-2">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </Secao>
      <Secao titulo="Todo mês">
        <ul className="list-disc space-y-1 pl-5 text-[14px]">
          <li>Envie a base de clientes nova e os relatórios do mês em <Link href="/importacoes">Importações</Link>.</li>
          <li>Confira se sobrou alguma venda sem comissão e resolva.</li>
          <li>Em <Link href="/a-pagar">A Pagar</Link>, veja a prévia, feche a folha do mês, exporte e marque como paga.</li>
          <li>Em <Link href="/estornos">Estornos</Link>, registre a cobrança dos estornos.</li>
        </ul>
      </Secao>
      <Secao titulo="O que significa cada termo" semPadding>
        <dl className="divide-y divide-wr-borda">
          {TERMOS.map(([t, d]) => (
            <div key={t} className="grid gap-1 px-4 py-2.5 text-[14px] sm:grid-cols-[220px_1fr]">
              <dt className="font-semibold">{t}</dt>
              <dd className="text-wr-texto-2">{d}</dd>
            </div>
          ))}
        </dl>
      </Secao>
    </Pagina>
  );
}
