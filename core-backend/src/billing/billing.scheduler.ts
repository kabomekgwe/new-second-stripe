import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingService } from './billing.service';

@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);

  constructor(private billingService: BillingService) {}

  @Cron('0 9 1 * *') // 9 AM on the 1st of every month
  async handleMonthlyBilling() {
    this.logger.log('Starting monthly billing run');
    const results = await this.billingService.chargeAllUsers();
    this.logger.log(`Monthly billing complete: ${JSON.stringify(results)}`);
  }
}
