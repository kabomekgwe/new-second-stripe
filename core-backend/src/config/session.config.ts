import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisStore } from 'connect-redis';
import * as session from 'express-session';

export function getSessionConfig(configService: ConfigService) {
  const redisUrl = configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
  const redisClient = new Redis(redisUrl);

  const store = new RedisStore({ client: redisClient });

  return session({
    store,
    secret: configService.get('NODE_ENV') === 'production'
      ? configService.getOrThrow<string>('SESSION_SECRET')
      : configService.get<string>('SESSION_SECRET') ?? 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: configService.get('NODE_ENV') === 'production' ? 'strict' : 'lax',
      secure: configService.get('NODE_ENV') === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });
}
