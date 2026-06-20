import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/auth';
import { verifyPlatformSession, PLATFORM_COOKIE } from '@/lib/platform-auth';

/**
 * Gate the app surfaces. Runs on the edge; jose verifies JWTs without Node crypto.
 *  - /admin (control plane) requires a PlatformAdmin session — never a staff token.
 *  - /pos /kds /dashboard (tenant) require a staff session.
 */
const PROTECTED = ['/pos', '/kds', '/dashboard'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Control plane — separate principal, separate cookie. /admin/login is public.
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return NextResponse.next();
    const ptoken = req.cookies.get(PLATFORM_COOKIE)?.value;
    const padmin = ptoken ? await verifyPlatformSession(ptoken) : null;
    if (!padmin) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/pos/:path*', '/kds/:path*', '/dashboard/:path*', '/admin/:path*'],
};
