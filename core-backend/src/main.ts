import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { getSessionConfig } from './config/session.config';
import { getCsrfConfig } from './config/csrf.config';
import * as passport from 'passport';
import { StripeExceptionFilter } from './common/filters/stripe-exception.filter';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get('FRONTEND_URL', 'http://localhost:3000'),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new StripeExceptionFilter(), new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new LoggingInterceptor(),
  );

  // Session middleware must come before passport and CSRF
  app.use(getSessionConfig(configService));
  app.use(passport.initialize());
  app.use(passport.session());

  // CSRF protection - applied after session so tokens can be generated per session
  const { doubleCsrfProtection } = getCsrfConfig(configService);
  app.use(doubleCsrfProtection);

  const port = configService.get('PORT', 3001);
  await app.listen(port);
}
bootstrap();
