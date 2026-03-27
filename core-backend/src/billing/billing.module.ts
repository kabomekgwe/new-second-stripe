import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingService } from './billing.service';
import { BillingScheduler } from './billing.scheduler';
import { BillingController } from './billing.controller';
import { BillingSqlService } from './billing.sql.service';
import { UsersSqlService } from '../users/users.sql.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [BillingController],
  providers: [BillingService, BillingScheduler, BillingSqlService, UsersSqlService],
  exports: [BillingService],
})
export class BillingModule {}
