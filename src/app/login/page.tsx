import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { obterSessao } from '@/servidor/sessao';
import { log } from '@/lib/log';
import { Icone } from '@/ui/icones';
import { FormularioLogin } from './formulario';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

function Logo({ claro }: { claro?: boolean }) {
  return (
    <span className={`inline-flex size-14 items-center justify-center rounded-full border-[3px] text-[18px] font-bold ${claro ? 'border-white text-white' : 'border-wr-verde text-wr-verde'}`} aria-hidden="true">
      WR
    </span>
  );
}

export default async function Login({ searchParams }: { searchParams: Promise<{ expirada?: string }> }) {
  // Se a conferência da sessão falhar (ex.: banco indisponível), a tela de login continua acessível.
  let logado = false;
  try {
    logado = (await obterSessao()) !== null;
  } catch (e) {
    log.erro('login.sessao.erro', { erro: e });
  }
  if (logado) redirect('/dashboard');
  const { expirada } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.3fr_1fr]">
      <section className="relative hidden flex-col justify-center overflow-hidden bg-wr-escuro px-16 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-wr-verde/40 via-transparent to-wr-texto/40" aria-hidden="true" />
        <div className="relative max-w-lg space-y-6">
          <Logo claro />
          <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight">
            ERP Financeiro
            <span className="block text-wr-verde-claro/90">e Comercial</span>
          </h1>
          <p className="text-[15px] leading-relaxed text-white/80">Quanto a WR deve a cada pessoa, e por quê. Comissões, estornos, folha e carteira com memória de cálculo e auditoria em cada valor.</p>
          <ul className="space-y-2.5 text-[14px] text-white/90">
            <li className="flex items-center gap-2.5"><Icone nome="grafico" tamanho={17} className="text-wr-verde-claro" />Produção, comissão e estorno por período</li>
            <li className="flex items-center gap-2.5"><Icone nome="ok" tamanho={17} className="text-wr-verde-claro" />Regras com vigência — o passado nunca é reescrito</li>
            <li className="flex items-center gap-2.5"><Icone nome="auditoria" tamanho={17} className="text-wr-verde-claro" />Cada valor explicado, cada alteração auditada</li>
          </ul>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-3">
            <Logo />
            <div>
              <h2 className="text-[24px] font-bold text-wr-texto">Entrar</h2>
              <p className="text-[13px] text-wr-texto-2">WR Consórcio · ERP Financeiro e Comercial</p>
            </div>
          </div>
          <FormularioLogin expirada={expirada === '1'} />
        </div>
      </section>
    </main>
  );
}
