import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE = 'sena_session';
const PUBLICAS = ['/login'];

async function tokenValido(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const secreto = new TextEncoder().encode(
      process.env.AUTH_SECRET || 'dev-secret-sena-almacen-cambiar-en-produccion'
    );
    await jwtVerify(token, secreto);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const valido = await tokenValido(req.cookies.get(COOKIE)?.value);

  if (pathname === '/login' && valido) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (!PUBLICAS.includes(pathname) && !valido) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/qr).*)'],
};
