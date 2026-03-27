import { Module } from '@nestjs/common';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsSqlService } from './payment-methods.sql.service';
import { UsersSqlService } from '../users/users.sql.service';

@Module({
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService, PaymentMethodsSqlService, UsersSqlService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
