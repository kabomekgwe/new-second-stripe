import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, MoreThan } from 'typeorm';
import { UsageCharge, User } from '@stripe-app/shared';
import { ChargeStatus } from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { generateIdempotencyKey } from '../common/utils/idempotency';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(UsageCharge)
    private usageChargeRepo: Repository<UsageCharge>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private stripeService: StripeService,
  ) {}

  async chargeUser(user: User): Promise<UsageCharge> {
    const now = new Date();
    const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const billingPeriodEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    );

    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const idempotencyKey = `mgmt_fee_${user.id}_${periodKey}`;

    const existing = await this.usageChargeRepo.findOne({
      where: { idempotencyKey },
    });
    if (existing) {
      this.logger.log(
        `Charge already exists for user ${user.id} period ${periodKey}`,
      );
      return existing;
    }

    const stripeIdempotencyKey = generateIdempotencyKey(
      'mgmt_fee',
      user.id,
      periodKey,
    );

    const paymentIntent = await this.stripeService.createPaymentIntent(
      {
        amount: user.monthlyManagementFee!,
        customer: user.stripeCustomerId!,
        payment_method: user.defaultPaymentMethodId!,
        off_session: true,
        confirm: true,
        metadata: {
          userId: user.id,
          type: 'management_fee',
          period: periodKey,
        },
      },
      stripeIdempotencyKey,
    );

    const charge = this.usageChargeRepo.create({
      userId: user.id,
      stripePaymentIntentId: paymentIntent.id,
      amountGbp: user.monthlyManagementFee!,
      billingPeriodStart,
      billingPeriodEnd,
      status: ChargeStatus.PROCESSING,
      idempotencyKey,
    });

    return this.usageChargeRepo.save(charge);
  }

  async chargeAllUsers(): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    const users = await this.userRepo.find({
      where: {
        monthlyManagementFee: MoreThan(0),
        defaultPaymentMethodId: Not(IsNull()),
        stripeCustomerId: Not(IsNull()),
      },
    });

    const results = {
      total: users.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ userId: string; error: string }>,
    };

    for (const user of users) {
      try {
        const charge = await this.chargeUser(user);
        if (charge.status === ChargeStatus.PROCESSING) {
          results.succeeded++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.failed++;
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.errors.push({ userId: user.id, error: message });
        this.logger.error(
          `Failed to charge user ${user.id}: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return results;
  }

  async getUserCharges(userId: string): Promise<UsageCharge[]> {
    return this.usageChargeRepo.find({
      where: { userId },
      order: { billingPeriodStart: 'DESC' },
    });
  }
}
