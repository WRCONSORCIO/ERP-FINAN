import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { obterSessao } from '@/servidor/sessao';
import { log } from '@/lib/log';
import { Icone, type NomeIcone } from '@/ui/icones';
import { LogoWR } from '@/ui/logo';
import { FormularioLogin } from './formulario';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

const DESTAQUES: Array<{ icone: NomeIcone; texto: string }> = [
  { icone: 'grafico', texto: 'Produção, comissões e estornos por período' },
  { icone: 'ok', texto: 'Regras com data: o que já foi pago nunca muda' },
  { icone: 'auditoria', texto: 'Cada valor explicado, cada alteração registrada' },
];

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
    <main className="grid min-h-dvh bg-wr-fundo lg:grid-cols-[1.25fr_1fr]">
      {/* Painel da marca */}
      <section className="relative hidden overflow-hidden bg-wr-noite text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-48 size-[640px] rounded-full bg-wr-acao/45 blur-[140px]" />
          <div className="absolute -bottom-56 right-[-10%] size-[560px] rounded-full bg-wr-lima/20 blur-[150px]" />
          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-wr-noite-2/40 to-wr-noite" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse at 30% 40%, black 20%, transparent 70%)' }}
          />
        </div>

        <div className="relative flex flex-1 flex-col justify-center px-[clamp(3rem,7vw,7rem)] py-16">
          <div className="max-w-xl">
            <LogoWR tamanho={64} tom="branco" />
            <h1 className="mt-10 text-[clamp(2.6rem,3.6vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              ERP Financeiro
              <span className="block text-wr-lima">e Comercial</span>
            </h1>
            <p className="mt-6 max-w-md text-[16px] leading-relaxed text-white/75">
              Comissões, estornos, folha e carteira da WR Consórcio em um só lugar — com a conta de cada valor à vista.
            </p>
            <ul className="mt-10 space-y-4">
              {DESTAQUES.map((d) => (
                <li key={d.texto} className="flex items-center gap-3.5 text-[15px] text-white/90">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ring-1 ring-white/10">
                    <Icone nome={d.icone} tamanho={17} className="text-wr-lima" />
                  </span>
                  {d.texto}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="relative px-[clamp(3rem,7vw,7rem)] pb-10 text-[12px] text-white/40">© {new Date().getFullYear()} WR Consórcio · uso interno</p>
      </section>

      {/* Acesso */}
      <section className="relative flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 lg:mb-12">
            <LogoWR tamanho={52} />
            <h2 className="mt-8 text-[30px] font-extrabold tracking-[-0.03em] text-wr-texto">Entrar</h2>
            <p className="mt-1.5 text-[14px] text-wr-texto-2">WR Consórcio · ERP Financeiro e Comercial</p>
          </div>
          <FormularioLogin expirada={expirada === '1'} />
        </div>
      </section>
    </main>
  );
}
