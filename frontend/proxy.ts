import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Proxy for server-side route protection.
 * Prevents content flash by redirecting unauthenticated users before the page renders.
 *
 * Note: This checks for session cookie existence only.
 * The protected layout still validates the session via /auth/me endpoint.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth routes, API routes, and static files
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('favicon.ico') ||
    pathname.includes('.ico') ||
    pathname.includes('.png') ||
    pathname.includes('.jpg') ||
    pathname.includes('.svg')
  ) {
    return NextResponse.next();
  }

  // Check for session cookie (custom name from session.config.ts)
  const sessionCookie = request.cookies.get('stripe-app.session');

  if (!sessionCookie) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static files
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
