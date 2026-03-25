import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { PaymentMethod, User, PAYMENT_METHOD_LABELS } from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { generateUniqueIdempotencyKey } from '../common/utils/idempotency';

@Injectable()
export class PaymentMethodsService {
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
    let user = await this.findUserOrFail(userId);

    // Auto-create Stripe customer if missing
    if (!user.stripeCustomerId) {
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
      user = await this.userRepo.save({
        ...user,
        stripeCustomerId: customer.id,
      });
    }

    const idempotencyKey = generateUniqueIdempotencyKey(
      'setup_intent',
      userId,
      `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    );

    // Get available payment method types to ensure the Setup Intent
    // allows the same payment methods shown as "available"
    const availableTypes = await this.getAvailablePaymentMethodTypes();

    // Filter out payment method types that are NOT compatible with Setup Intents
    // BNPL (Buy Now Pay Later) methods and some region-specific methods only work
    // with Payment Intents, not Setup Intents for saving payment methods
    const setupIntentCompatibleTypes = [
      'card',
      'sepa_debit',
      'us_bank_account',
      'bacs_debit',
      'au_becs_debit',
      'cashapp',
      'link',
    ];

    const paymentMethodTypes = availableTypes
      .map((t) => t.type)
      .filter((type) => setupIntentCompatibleTypes.includes(type));

    const setupIntent = await this.stripeService.createSetupIntent(
      user?.stripeCustomerId!,
      idempotencyKey,
      paymentMethodTypes,
    );

    return { clientSecret: setupIntent.client_secret! };
  }

  async setDefault(
    userId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethod> {
    const pm = await this.findPaymentMethodOrFail(paymentMethodId, userId);

    await this.paymentMethodRepo.update(
      { userId, isDefault: true },
      { isDefault: false },
    );

    pm.isDefault = true;
    await this.paymentMethodRepo.save(pm);

    await this.userRepo.update(userId, {
      defaultPaymentMethodId: pm.stripePaymentMethodId,
    });

    return pm;
  }

  async removePaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<void> {
    const pm = await this.findPaymentMethodOrFail(paymentMethodId, userId);

    const idempotencyKey = generateUniqueIdempotencyKey(
      'detach_pm',
      pm.stripePaymentMethodId,
    );

    await this.stripeService.detachPaymentMethod(
      pm.stripePaymentMethodId,
      idempotencyKey,
    );

    if (pm.isDefault) {
      await this.userRepo.update(userId, {
        defaultPaymentMethodId: null,
      });
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
