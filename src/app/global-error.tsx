'use client';

/** Erro fora das telas internas (ex.: login): mensagem humana, sem detalhe técnico. O detalhe fica no log (digest). */
export default function ErroGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '64px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 18 }}>Não foi possível carregar o ERP</h1>
        <p style={{ fontSize: 13 }}>Nenhum dado foi alterado. Tente novamente; se persistir, informe ao administrador o código abaixo.</p>
        {error.digest ? <p style={{ fontSize: 12, fontFamily: 'monospace' }}>Código: {error.digest}</p> : null}
        <button type="button" onClick={reset} style={{ marginTop: 12, padding: '8px 16px' }}>Tentar novamente</button>
      </body>
    </html>
  );
}
