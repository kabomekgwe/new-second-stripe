import { ConfigService } from '@nestjs/config';
import { doubleCsrf } from 'csrf-csrf';
import { Request, Response } from 'express';

/**
 * CSRF protection configuration using csrf-csrf package.
 * Provides double-submit cookie pattern for CSRF protection.
 */
export function getCsrfConfig(configService: ConfigService) {
  const isProduction = configService.get('NODE_ENV') === 'production';

  const csrfUtilities = doubleCsrf({
    getSecret: () => configService.getOrThrow<string>('SESSION_SECRET'),
    getSessionIdentifier: (req: Request) => {
      // Use session ID if available, otherwise fall back to IP
      return req.sessionID || req.ip || 'anonymous';
    },
    cookieName: '__Host-x-csrf-token',
    cookieOptions: {
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      secure: isProduction,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // Match session duration
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
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