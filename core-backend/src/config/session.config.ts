import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import RedisStore from 'connect-redis';
import * as session from 'express-session';
import { Logger } from '@nestjs/common';

const logger = new Logger('SessionConfig');

export function getSessionConfig(configService: ConfigService) {
  const redisUrl = configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
  const isProduction = configService.get('NODE_ENV') === 'production';

  // Create Redis client with error handling
  const redisClient = new Redis(redisUrl, {
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  // Handle Redis connection events
  redisClient.on('connect', () => {
    logger.log('Redis connected successfully');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis connection error:', err.message);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.log('Redis reconnecting...');
  });

  const store = new RedisStore({ client: redisClient });

  return session({
    store,
    name: 'stripe-app.session', // Custom cookie name to avoid fingerprinting
    secret: isProduction
      ? configService.getOrThrow<string>('SESSION_SECRET')
      : configService.get<string>('SESSION_SECRET') ?? 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session on each request - prevents unexpected logouts
    cookie: {
      httpOnly: true,
      sameSite: isProduction ? 'lax' : 'lax', // Use 'lax' to allow external links
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });
}
