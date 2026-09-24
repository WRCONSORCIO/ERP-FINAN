import Link from 'next/link';

export default function NaoEncontrado() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="numero text-[32px] font-bold text-wr-texto-3">404</p>
      <h1 className="mt-2 text-[18px] font-semibold">Página não encontrada</h1>
      <p className="mt-1 text-[13px] text-wr-texto-2">O endereço não existe, ou o registro está fora do seu recorte de visibilidade.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-[13px] font-semibold">Voltar ao Dashboard</Link>
    </main>
  );
}
