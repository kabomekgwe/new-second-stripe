import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BillingSubscription,
  User,
  PaymentMethod,
  Payment,
  UsageCharge,
  WebhookEvent,
} from '@stripe-app/shared';

export const getDatabaseConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get('DB_HOST', 'localhost'),
  port: configService.get<number>('DB_PORT', 5432),
  username: configService.get('DB_USER', 'postgres'),
  password: configService.get('DB_PASSWORD', 'postgres'),
  database: configService.get('DB_NAME', 'stripe_app'),
  entities: [
    BillingSubscription,
    User,
    PaymentMethod,
    Payment,
    UsageCharge,
    WebhookEvent,
  ],
  synchronize: true, // dev only
});
