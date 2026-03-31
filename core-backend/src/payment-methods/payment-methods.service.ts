import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentMethod, User, PAYMENT_METHOD_LABELS } from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { generateUniqueIdempotencyKey } from '../common/utils/idempotency';
import { UsersSqlService } from '../users/users.sql.service';
import { PaymentMethodsSqlService } from './payment-methods.sql.service';

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
    private readonly paymentMethodsSql: PaymentMethodsSqlService,
    private readonly usersSql: UsersSqlService,
    private readonly stripeService: StripeService,
  ) {}

  async getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    return this.paymentMethodsSql.findByUserId(userId);
  }

  async getAvailablePaymentMethodTypes(): Promise<
    { type: string; label: string }[]
  > {
    const configs = await this.stripeService.getPaymentMethodConfigurations();
    const enabledTypes: { type: string; label: string }[] = [];

    const paymentMethodTypes = [
      'acss_debit',
      'affirm',
      'afterpay_clearpay',
      'alipay',
      'alma',
      'amazon_pay',
      'apple_pay',
      'au_becs_debit',
      'bacs_debit',
      'bancontact',
      'billie',
      'blik',
      'boleto',
      'card',
      'cartes_bancaires',
      'cashapp',
      'crypto',
      'customer_balance',
      'eps',
      'fpx',
      'giropay',
      'google_pay',
      'grabpay',
      'ideal',
      'jcb',
      'kakao_pay',
      'klarna',
      'konbini',
      'kr_card',
      'link',
      'mb_way',
      'mobilepay',
      'multibanco',
      'naver_pay',
      'nz_bank_account',
      'oxxo',
      'p24',
      'pay_by_bank',
      'payco',
      'paynow',
      'paypal',
      'payto',
      'pix',
      'promptpay',
      'revolut_pay',
      'samsung_pay',
      'satispay',
      'sepa_debit',
      'sofort',
      'swish',
      'twint',
      'us_bank_account',
      'wechat_pay',
      'zip',
    ];

    for (const config of configs.data) {
      for (const type of paymentMethodTypes) {
        const settings = (config as unknown as Record<string, unknown>)[type];
        if (
          settings &&
          typeof settings === 'object' &&
          'available' in settings &&
          (settings as { available?: boolean }).available === true
        ) {
          const label = PAYMENT_METHOD_LABELS[type] ?? type;
          if (!enabledTypes.some((entry) => entry.type === type)) {
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

    const idempotencyKey = generateUniqueIdempotencyKey(
      'setup_intent',
      userId,
      Date.now().toString(),
    );

    const setupIntent = await this.stripeService.createSetupIntent(
      user.stripeCustomerId!,
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

    await this.paymentMethodsSql.setDefault(userId, pm.stripePaymentMethodId);
    await this.syncStripeDefaultPaymentMethod(
      user.stripeCustomerId,
      pm.stripePaymentMethodId,
    );
    await this.usersSql.updateDefaultPaymentMethod(
      userId,
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
      await this.paymentMethodsSql.setDefault(userId, null);
      await this.usersSql.updateDefaultPaymentMethod(userId, null);
      await this.syncStripeDefaultPaymentMethod(user.stripeCustomerId, null);
    }

    await this.paymentMethodsSql.deleteById(pm.id);
  }

  async syncPaymentMethodFromStripe(
    stripePaymentMethod: Stripe.PaymentMethod,
    userId: string,
  ): Promise<PaymentMethod> {
    const card = stripePaymentMethod.card;
    const user = await this.findUserOrFail(userId);

    return this.paymentMethodsSql.upsertFromStripe({
      userId,
      stripePaymentMethodId: stripePaymentMethod.id,
      type: stripePaymentMethod.type,
      last4: card?.last4 ?? null,
      brand: card?.brand ?? null,
      expiryMonth: card?.exp_month ?? null,
      expiryYear: card?.exp_year ?? null,
      metadata: stripePaymentMethod.metadata ?? null,
      isDefault:
        user.defaultPaymentMethodId === stripePaymentMethod.id ? true : false,
    });
  }

  /**
   * Fetches a payment method from Stripe by ID and saves it to the database.
   * Called by frontend after successful setup to ensure immediate availability.
   */
  async syncAndSavePaymentMethod(
    userId: string,
    stripePaymentMethodId: string,
  ): Promise<PaymentMethod> {
    if (!stripePaymentMethodId) {
      throw new BadRequestException('stripePaymentMethodId is required');
    }

    const user = await this.ensureStripeCustomer(userId);
    const stripePm = await this.stripeService.retrievePaymentMethod(
      stripePaymentMethodId,
    );

    const savedPm = await this.paymentMethodsSql.upsertFromStripeTX(
      {
        userId,
        stripePaymentMethodId: stripePm.id,
        type: stripePm.type,
        last4: stripePm.card?.last4 ?? null,
        brand: stripePm.card?.brand ?? null,
        expiryMonth: stripePm.card?.exp_month ?? null,
        expiryYear: stripePm.card?.exp_year ?? null,
        metadata: stripePm.metadata ?? null,
        isDefault: user.defaultPaymentMethodId === stripePm.id,
      },
      user.defaultPaymentMethodId,
    );

    if (!user.defaultPaymentMethodId) {
      await this.syncStripeDefaultPaymentMethod(
        user.stripeCustomerId!,
        stripePm.id,
      );
    }

    return savedPm;
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.usersSql.findById(userId);
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

    return (await this.usersSql.updateStripeCustomerAndReturn(
      userId,
      customer.id,
    )) as User;
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
    const pm = await this.paymentMethodsSql.findById(paymentMethodId, userId);
    if (!pm) {
      throw new NotFoundException('Payment method not found');
    }
    return pm;
  }
}
