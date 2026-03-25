import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { UsageCharge, User } from '@stripe-app/shared';
import { BillingService } from './billing.service';
import { BillingScheduler } from './billing.scheduler';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageCharge, User]),
    ScheduleModule.forRoot(),
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingScheduler],
  exports: [BillingService],
})
export class BillingModule {}
