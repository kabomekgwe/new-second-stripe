import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const configService = app.get(ConfigService);
  const isProduction = configService.get('NODE_ENV') === 'production';

  // Security: Helmet HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable CSP for webhook endpoint
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = configService.get('PORT', 3002);
  await app.listen(port);
}
bootstrap();
