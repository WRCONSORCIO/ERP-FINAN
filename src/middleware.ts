import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, lerToken } from '@/lib/sessao-token';

/**
 * Primeira barreira: sem token válido, nenhuma rota interna abre. É só um atalho —
 * cada tela e cada Server Action reconferem a sessão no banco (perfil, escopo, ativo).
 */
const PUBLICAS = ['/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  const token = await lerToken(req.cookies.get(COOKIE_SESSAO)?.value);
  if (!token) {
    if (pathname.startsWith('/exportar')) return new NextResponse('Sessão expirada', { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
