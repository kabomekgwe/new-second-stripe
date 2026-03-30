import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for server-side route protection.
 * Prevents content flash by redirecting unauthenticated users before the page renders.
 *
 * Note: This checks for session cookie existence only.
 * The protected layout still validates the session via /auth/me endpoint.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for auth routes, API routes, and static files
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
    // No session cookie - redirect to login with return path
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Session cookie exists - allow request to proceed
  // The protected layout will verify the session is valid via /auth/me
  return NextResponse.next();
}

export const config = {
  // Match all routes except static files
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};