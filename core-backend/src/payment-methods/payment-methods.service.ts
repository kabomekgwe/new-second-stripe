import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { PaymentMethod, User, PAYMENT_METHOD_LABELS } from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { generateUniqueIdempotencyKey } from '../common/utils/idempotency';

@Injectable()
export class PaymentMethodsService {
  private static readonly ACTIVE_SETUP_INTENT_STATUSES = new Set<
    Stripe.SetupIntent.Status
  >([
    'requires_action',
    'requires_confirmation',
    'requires_payment_method',
    'processing',
  ]);

  constructor(
    @InjectRepository(PaymentMethod)
    private paymentMethodRepo: Repository<PaymentMethod>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private stripeService: StripeService,
  ) { }

  async getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    return this.paymentMethodRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAvailablePaymentMethodTypes(): Promise<
    { type: string; label: string }[]
  > {
    const configs =
      await this.stripeService.getPaymentMethodConfigurations();
    const enabledTypes: { type: string; label: string }[] = [];

    // Known payment method types in Stripe
    const paymentMethodTypes = [
      'acss_debit', 'affirm', 'afterpay_clearpay', 'alipay', 'alma',
      'amazon_pay', 'apple_pay', 'au_becs_debit', 'bacs_debit',
      'bancontact', 'billie', 'blik', 'boleto', 'card', 'cartes_bancaires',
      'cashapp', 'crypto', 'customer_balance', 'eps', 'fpx', 'giropay',
      'google_pay', 'grabpay', 'ideal', 'jcb', 'kakao_pay', 'klarna',
      'konbini', 'kr_card', 'link', 'mb_way', 'mobilepay', 'multibanco',
      'naver_pay', 'nz_bank_account', 'oxxo', 'p24', 'pay_by_bank',
      'payco', 'paynow', 'paypal', 'payto', 'pix', 'promptpay',
      'revolut_pay', 'samsung_pay', 'satispay', 'sepa_debit', 'sofort',
      'swish', 'twint', 'us_bank_account', 'wechat_pay', 'zip'
    ];

    for (const config of configs.data) {
      for (const type of paymentMethodTypes) {
        const settings = (config as any)[type];
        if (
          settings &&
          typeof settings === 'object' &&
          settings.available === true
        ) {
          const label = PAYMENT_METHOD_LABELS[type] ?? type;
          if (!enabledTypes.some((t) => t.type === type)) {
            enabledTypes.push({ type, label });
          }
        }
      }
    }

    return enabledTypes;
  }

  async createSetupIntent(
    userId: string,
  ): Promise<{ clientSecret: string }> {
    const user = await this.ensureStripeCustomer(userId);

    const existingSetupIntent = await this.findActiveSetupIntent(
      user.stripeCustomerId!,
    );
    if (existingSetupIntent?.client_secret) {
      return { clientSecret: existingSetupIntent.client_secret };
    }

    const setupIntentWindow = String(
      Math.floor(Date.now() / (15 * 60 * 1000)),
    );
    const idempotencyKey = generateUniqueIdempotencyKey(
      'setup_intent',
      userId,
      setupIntentWindow,
    );

    const setupIntent = await this.stripeService.createSetupIntent(
      user?.stripeCustomerId!,
      idempotencyKey,
    );

    return { clientSecret: setupIntent.client_secret! };
  }

  async setDefault(
    userId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethod> {
    const pm = await this.findPaymentMethodOrFail(paymentMethodId, userId);
    const user = await this.findUserOrFail(userId);

    await this.updateLocalDefaultPaymentMethod(userId, pm.stripePaymentMethodId);
    await this.syncStripeDefaultPaymentMethod(
      user.stripeCustomerId,
      pm.stripePaymentMethodId,
    );

    return this.findPaymentMethodOrFail(paymentMethodId, userId);
  }

  async removePaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<void> {
    const pm = await this.findPaymentMethodOrFail(paymentMethodId, userId);
    const user = await this.findUserOrFail(userId);

    const idempotencyKey = generateUniqueIdempotencyKey(
      'detach_pm',
      pm.stripePaymentMethodId,
    );

    await this.stripeService.detachPaymentMethod(
      pm.stripePaymentMethodId,
      idempotencyKey,
    );

    if (pm.isDefault) {
      await this.updateLocalDefaultPaymentMethod(userId, null);
      await this.syncStripeDefaultPaymentMethod(user.stripeCustomerId, null);
    }

    await this.paymentMethodRepo.remove(pm);
  }

  async syncPaymentMethodFromStripe(
    stripePaymentMethod: Stripe.PaymentMethod,
    userId: string,
  ): Promise<PaymentMethod> {
    const card = stripePaymentMethod.card;

    let pm = await this.paymentMethodRepo.findOne({
      where: { stripePaymentMethodId: stripePaymentMethod.id },
    });

    const data: Partial<PaymentMethod> = {
      userId,
      stripePaymentMethodId: stripePaymentMethod.id,
      type: stripePaymentMethod.type,
      last4: card?.last4 ?? null,
      brand: card?.brand ?? null,
      expiryMonth: card?.exp_month ?? null,
      expiryYear: card?.exp_year ?? null,
      metadata: stripePaymentMethod.metadata ?? null,
    };

    if (pm) {
      Object.assign(pm, data);
    } else {
      pm = this.paymentMethodRepo.create(data);
    }

    return this.paymentMethodRepo.save(pm);
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async ensureStripeCustomer(userId: string): Promise<User> {
    const user = await this.findUserOrFail(userId);
    if (user.stripeCustomerId) {
      return user;
    }

    const idempotencyKey = generateUniqueIdempotencyKey(
      'create_customer',
      userId,
    );
    const customer = await this.stripeService.createCustomer(
      {
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId },
      },
      idempotencyKey,
    );

    return this.userRepo.save({
      ...user,
      stripeCustomerId: customer.id,
    });
  }

  private async findActiveSetupIntent(
    customerId: string,
  ): Promise<Stripe.SetupIntent | null> {
    const setupIntents = await this.stripeService.listSetupIntents(customerId);

    return (
      setupIntents.data.find((setupIntent) =>
        PaymentMethodsService.ACTIVE_SETUP_INTENT_STATUSES.has(
          setupIntent.status,
        ),
      ) ?? null
    );
  }

  private async updateLocalDefaultPaymentMethod(
    userId: string,
    stripePaymentMethodId: string | null,
  ): Promise<void> {
    await this.paymentMethodRepo.update({ userId }, { isDefault: false });

    if (stripePaymentMethodId) {
      await this.paymentMethodRepo.update(
        { userId, stripePaymentMethodId },
        { isDefault: true },
      );
    }

    await this.userRepo.update(userId, {
      defaultPaymentMethodId: stripePaymentMethodId,
    });
  }

  private async syncStripeDefaultPaymentMethod(
    stripeCustomerId: string | null,
    stripePaymentMethodId: string | null,
  ): Promise<void> {
    if (!stripeCustomerId) {
      if (stripePaymentMethodId) {
        throw new BadRequestException(
          'User does not have a Stripe customer account',
        );
      }
      return;
    }

    await this.stripeService.updateCustomerDefaultPaymentMethod(
      stripeCustomerId,
      stripePaymentMethodId,
    );
  }

  private async findPaymentMethodOrFail(
    paymentMethodId: string,
    userId: string,
  ): Promise<PaymentMethod> {
    const pm = await this.paymentMethodRepo.findOne({
      where: { id: paymentMethodId, userId },
    });
    if (!pm) {
      throw new NotFoundException('Payment method not found');
    }
    return pm;
  }
}
