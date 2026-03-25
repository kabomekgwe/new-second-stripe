import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  User,
  PaymentMethod,
  Payment,
  UsageCharge,
} from '@stripe-app/shared';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { SetupIntentHandler } from './handlers/setup-intent.handler';
import { PaymentMethodHandler } from './handlers/payment-method.handler';
import { PaymentIntentHandler } from './handlers/payment-intent.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PaymentMethod, Payment, UsageCharge]),
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    SetupIntentHandler,
    PaymentMethodHandler,
    PaymentIntentHandler,
  ],
})
export class WebhooksModule {}
