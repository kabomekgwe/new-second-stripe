import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsSqlService } from './payments.sql.service';
import { PaymentMethodsSqlService } from '../payment-methods/payment-methods.sql.service';
import { UsersSqlService } from '../users/users.sql.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsSqlService,
    PaymentMethodsSqlService,
    UsersSqlService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
