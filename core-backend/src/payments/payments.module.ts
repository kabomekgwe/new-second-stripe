import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsSqlService } from './payments.sql.service';
import { PaymentMethodsSqlService } from '../payment-methods/payment-methods.sql.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsSqlService,
    PaymentMethodsSqlService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
