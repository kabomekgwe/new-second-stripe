import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsSqlService } from './payments.sql.service';
import { UsersSqlService } from '../users/users.sql.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsSqlService, UsersSqlService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
