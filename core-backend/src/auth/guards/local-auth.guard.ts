import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest<Request>();

    // Store user data before session regeneration
    const user = request.user;

    // Regenerate session to prevent session fixation attacks
    // This creates a new session ID while preserving the session data
    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    // Re-login with the new session to persist user data
    await super.logIn(request);

    // Ensure user is set in the new session
    request.user = user;

    return result;
  }
}
