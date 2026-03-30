import { ConfigService } from '@nestjs/config';
import { doubleCsrf } from 'csrf-csrf';
import { Request, Response } from 'express';

/**
 * CSRF protection configuration using csrf-csrf package.
 * Provides double-submit cookie pattern for CSRF protection.
 */
export function getCsrfConfig(configService: ConfigService) {
  const isProduction = configService.get('NODE_ENV') === 'production';

  // Use __Host- prefix only in production (requires HTTPS + Secure)
  // In development, use a regular cookie name
  const cookieName = isProduction ? '__Host-x-csrf-token' : 'x-csrf-token';

  const csrfUtilities = doubleCsrf({
    getSecret: () => configService.getOrThrow<string>('SESSION_SECRET'),
    getSessionIdentifier: (req: Request) => {
      // In development, use a stable identifier to avoid session issues
      // In production, use session ID for proper per-session tokens
      if (!isProduction) {
        return 'development-session';
      }
      // Use session ID if available, otherwise fall back to IP
      return req.sessionID || req.ip || 'anonymous';
    },
    cookieName,
    cookieOptions: {
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      secure: isProduction,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // Match session duration
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    // Skip CSRF protection for the token endpoint itself
    skipCsrfProtection: (req: Request) => {
      return req.path === '/csrf/token';
    },
    getCsrfTokenFromRequest: (req: Request) => {
      // Check header first, then body, then query
      return (
        req.headers['x-csrf-token'] as string ||
        (req.body && req.body._csrf) ||
        req.query._csrf as string
      );
    },
  });

  return csrfUtilities;
}

/**
 * Type for request with CSRF token generation capability.
 */
declare module 'express' {
  interface Request {
    csrfToken?: () => string;
  }
}