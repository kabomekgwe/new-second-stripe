import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type Stripe from 'stripe';
import type { PaymentMethod, SafeUser } from '../shared';
import { getPaymentMethodTypesForCountry } from '../shared';
import { StripePaymentMethodsService } from '../stripe/stripe-payment-methods.service';
import { StripeCustomersService } from '../stripe/stripe-customers.service';
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
    private readonly stripePaymentMethods: StripePaymentMethodsService,
    private readonly stripeCustomers: StripeCustomersService,
  ) {}

  async cancelActiveSetupIntents(user: SafeUser): Promise<void> {
    if (!user.stripeCustomerId) return;

    const existing = await this.findActiveSetupIntent(user.stripeCustomerId);
    if (existing) {
      await this.stripePaymentMethods.cancelSetupIntent(existing.id);
    }
  }

  async getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    return this.paymentMethodsSql.findByUserId(userId);
  }

  async createSetupIntent(
    user: SafeUser,
  ): Promise<{ clientSecret: string }> {
    const ensured = await this.ensureStripeCustomer(user);

    const existingSetupIntent = await this.findActiveSetupIntent(
      ensured.stripeCustomerId!,
    );
    if (existingSetupIntent?.client_secret) {
      return { clientSecret: existingSetupIntent.client_secret };
    }

    const idempotencyKey = generateUniqueIdempotencyKey(
      'setup_intent',
      user.id,
      Date.now().toString(),
    );

    const paymentMethodTypes = getPaymentMethodTypesForCountry(ensured.country);

    const setupIntent = await this.stripePaymentMethods.createSetupIntent(
      ensured.stripeCustomerId!,
      idempotencyKey,
      paymentMethodTypes,
    );

    return { clientSecret: setupIntent.client_secret! };
  }

  async setDefault(
    user: SafeUser,
    paymentMethodId: string,
  ): Promise<PaymentMethod> {
    const pm = await this.findPaymentMethodOrFail(paymentMethodId, user.id);

    await this.paymentMethodsSql.setDefault(user.id, pm.stripePaymentMethodId);
    await this.syncStripeDefaultPaymentMethod(
      user.stripeCustomerId,
      pm.stripePaymentMethodId,
    );
    await this.usersSql.updateDefaultPaymentMethod(
      user.id,
      pm.stripePaymentMethodId,
    );

    return this.findPaymentMethodOrFail(paymentMethodId, user.id);
  }

  async removePaymentMethod(
    user: SafeUser,
    paymentMethodId: string,
  ): Promise<void> {
    const pm = await this.findPaymentMethodOrFail(paymentMethodId, user.id);

    const idempotencyKey = generateUniqueIdempotencyKey(
      'detach_pm',
      pm.stripePaymentMethodId,
    );

    await this.stripePaymentMethods.detachPaymentMethod(
      pm.stripePaymentMethodId,
      idempotencyKey,
    );

    if (pm.isDefault) {
      await this.paymentMethodsSql.setDefault(user.id, null);
      await this.usersSql.updateDefaultPaymentMethod(user.id, null);
      await this.syncStripeDefaultPaymentMethod(user.stripeCustomerId, null);
    }

    await this.paymentMethodsSql.deleteById(pm.id);
  }

  async syncPaymentMethodFromStripe(
    stripePaymentMethod: Stripe.PaymentMethod,
    user: SafeUser,
  ): Promise<PaymentMethod> {
    const card = stripePaymentMethod.card;

    return this.paymentMethodsSql.upsertFromStripe({
      userId: user.id,
      stripePaymentMethodId: stripePaymentMethod.id,
      type: stripePaymentMethod.type,
      last4: card?.last4 ?? null,
      brand: card?.brand ?? null,
      expiryMonth: card?.exp_month ?? null,
      expiryYear: card?.exp_year ?? null,
      metadata: stripePaymentMethod.metadata ?? null,
      isDefault: user.defaultPaymentMethodId === stripePaymentMethod.id,
    });
  }

  /**
   * Fetches a payment method from Stripe by ID and saves it to the database.
   * Called by frontend after successful setup to ensure immediate availability.
   */
  async syncAndSavePaymentMethod(
    user: SafeUser,
    stripePaymentMethodId: string,
  ): Promise<PaymentMethod> {
    if (!stripePaymentMethodId) {
      throw new BadRequestException('stripePaymentMethodId is required');
    }

    const ensured = await this.ensureStripeCustomer(user);
    const stripePm = await this.stripePaymentMethods.retrievePaymentMethod(
      stripePaymentMethodId,
    );
    const stripeCustomerId =
      typeof stripePm.customer === 'string'
        ? stripePm.customer
        : (stripePm.customer?.id ?? null);

    if (!stripeCustomerId) {
      throw new BadRequestException(
        'Payment method must be attached to your Stripe customer before it can be saved',
      );
    }

    if (stripeCustomerId !== ensured.stripeCustomerId) {
      throw new BadRequestException(
        'Payment method does not belong to the authenticated user',
      );
    }

    const savedPm = await this.paymentMethodsSql.upsertFromStripeTX(
      {
        userId: user.id,
        stripePaymentMethodId: stripePm.id,
        type: stripePm.type,
        last4: stripePm.card?.last4 ?? null,
        brand: stripePm.card?.brand ?? null,
        expiryMonth: stripePm.card?.exp_month ?? null,
        expiryYear: stripePm.card?.exp_year ?? null,
        metadata: stripePm.metadata ?? null,
        isDefault: ensured.defaultPaymentMethodId === stripePm.id,
      },
      ensured.defaultPaymentMethodId,
    );

    if (!ensured.defaultPaymentMethodId) {
      await this.syncStripeDefaultPaymentMethod(
        ensured.stripeCustomerId!,
        stripePm.id,
      );
    }

    return savedPm;
  }

  private async ensureStripeCustomer(user: SafeUser): Promise<SafeUser> {
    if (user.stripeCustomerId) {
      const customerExists = await this.stripeCustomers.customerExists(
        user.stripeCustomerId,
      );
      if (customerExists) {
        return user;
      }
    }

    const idempotencyKey = generateUniqueIdempotencyKey(
      'create_customer',
      user.id,
    );
    const customer = await this.stripeCustomers.createCustomer(
      {
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
        address: { country: user.country },
      },
      idempotencyKey,
    );

    return (await this.usersSql.updateStripeCustomerAndReturn(
      user.id,
      customer.id,
    )) as SafeUser;
  }

  private async findActiveSetupIntent(
    customerId: string,
  ): Promise<Stripe.SetupIntent | null> {
    const setupIntents =
      await this.stripePaymentMethods.listSetupIntents(customerId);

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

    await this.stripeCustomers.updateDefaultPaymentMethod(
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
