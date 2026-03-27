import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { StripeModule } from './stripe/stripe.module';
import { AuthModule } from './auth/auth.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { PaymentsModule } from './payments/payments.module';
import { BillingModule } from './billing/billing.module';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    DatabaseModule,
    StripeModule,
    AuthModule,
    PaymentMethodsModule,
    PaymentsModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
