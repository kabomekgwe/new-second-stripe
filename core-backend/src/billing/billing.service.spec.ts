import {
  BillingSubscriptionStatus,
  ChargeStatus,
  UsageCharge,
  User,
} from '@stripe-app/shared';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  const billingSubscriptions: Array<Record<string, unknown>> = [];
  const usageCharges: Array<Record<string, unknown>> = [];

  const billingSql = {
    findBillableUsers: jest.fn(),
    findUsageChargeByIdempotencyKey: jest.fn(async (idempotencyKey: string) => {
      return (
        usageCharges.find((charge) => charge.idempotencyKey === idempotencyKey) ??
        null
      );
    }),
    listUsageChargesByUserId: jest.fn(),
    upsertUsageCharge: jest.fn(async (payload: Record<string, unknown>) => {
      const existingIndex = usageCharges.findIndex(
        (charge) => charge.idempotencyKey === payload.idempotencyKey,
      );
      if (existingIndex >= 0) {
        usageCharges[existingIndex] = { ...usageCharges[existingIndex], ...payload };
        return usageCharges[existingIndex];
      }

      const next = { id: `usage_${usageCharges.length + 1}`, ...payload };
      usageCharges.push(next);
      return next;
    }),
    findBillingSubscriptionByUserId: jest.fn(async (userId: string) => {
      return (
        billingSubscriptions.find((subscription) => subscription.userId === userId) ??
        null
      );
    }),
    upsertBillingSubscription: jest.fn(async (payload: Record<string, unknown>) => {
      const existingIndex = billingSubscriptions.findIndex(
        (subscription) =>
          subscription.stripeSubscriptionId === payload.stripeSubscriptionId,
      );
      if (existingIndex >= 0) {
        billingSubscriptions[existingIndex] = {
          ...billingSubscriptions[existingIndex],
          ...payload,
        };
        return billingSubscriptions[existingIndex];
      }

      const next = { id: `sub_${billingSubscriptions.length + 1}`, ...payload };
      billingSubscriptions.push(next);
      return next;
    }),
  };

  const stripeService = {
    listSubscriptions: jest.fn(),
    createBillingSubscription: jest.fn(),
    updateCustomerDefaultPaymentMethod: jest.fn(),
    retrievePrice: jest.fn(),
    retrieveBillingMeter: jest.fn(),
    createMeterEvent: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'STRIPE_BILLING_METERED_PRICE_ID') {
        return 'price_metered_123';
      }

      if (key === 'NODE_ENV') {
        return 'development';
      }

      return defaultValue;
    }),
  } as unknown as ConfigService;

  const service = new BillingService(
    billingSql as never,
    stripeService as never,
    configService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    billingSubscriptions.splice(0);
    usageCharges.splice(0);
    billingSql.findBillableUsers.mockResolvedValue([]);
    billingSql.findUsageChargeByIdempotencyKey.mockImplementation(
      async (idempotencyKey: string) =>
        usageCharges.find((charge) => charge.idempotencyKey === idempotencyKey) ??
        null,
    );
    billingSql.listUsageChargesByUserId.mockResolvedValue([]);
    billingSql.findBillingSubscriptionByUserId.mockImplementation(
      async (userId: string) =>
        billingSubscriptions.find(
          (subscription) => subscription.userId === userId,
        ) ?? null,
    );
    billingSql.upsertUsageCharge.mockImplementation(
      async (payload: Record<string, unknown>) => {
        const existingIndex = usageCharges.findIndex(
          (charge) => charge.idempotencyKey === payload.idempotencyKey,
        );
        if (existingIndex >= 0) {
          usageCharges[existingIndex] = {
            ...usageCharges[existingIndex],
            ...payload,
          };
          return usageCharges[existingIndex];
        }

        const next = { id: `usage_${usageCharges.length + 1}`, ...payload };
        usageCharges.push(next);
        return next;
      },
    );
    billingSql.upsertBillingSubscription.mockImplementation(
      async (payload: Record<string, unknown>) => {
        const existingIndex = billingSubscriptions.findIndex(
          (subscription) =>
            subscription.stripeSubscriptionId === payload.stripeSubscriptionId,
        );
        if (existingIndex >= 0) {
          billingSubscriptions[existingIndex] = {
            ...billingSubscriptions[existingIndex],
            ...payload,
          };
          return billingSubscriptions[existingIndex];
        }

        const next = { id: `sub_${billingSubscriptions.length + 1}`, ...payload };
        billingSubscriptions.push(next);
        return next;
      },
    );
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildUser(overrides: Partial<User> = {}): User {
    return {
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
      stripeCustomerId: 'cus_123',
      defaultPaymentMethodId: 'pm_123',
      monthlyManagementFee: 1250,
      accountValue: 0,
      ...overrides,
    } as User;
  }

  function buildStripeSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      items: {
        data: [
          {
            id: 'si_123',
            price: {
              id: 'price_metered_123',
            },
          },
        ],
      },
      current_period_start: 1_762_896_000,
      current_period_end: 1_765_555_199,
      ...overrides,
    };
  }

  it('creates a Stripe subscription and reports metered usage for a billable user', async () => {
    const user = buildUser();
    billingSql.findBillingSubscriptionByUserId.mockResolvedValue(null);
    billingSql.findUsageChargeByIdempotencyKey.mockResolvedValue(null);
    stripeService.listSubscriptions.mockResolvedValue({ data: [] });
    stripeService.retrievePrice.mockResolvedValue({
      recurring: { meter: 'meter_123' },
    });
    stripeService.retrieveBillingMeter.mockResolvedValue({
      event_name: 'monthly_management_fee',
    });
    stripeService.createBillingSubscription.mockResolvedValue(
      buildStripeSubscription(),
    );
    stripeService.createMeterEvent.mockResolvedValue({
      id: 'me_123',
      object: 'billing.meter_event',
    });

    const result = await service.chargeUser(user, 1250);

    expect(stripeService.updateCustomerDefaultPaymentMethod).toHaveBeenCalledWith(
      'cus_123',
      'pm_123',
    );
    expect(stripeService.createBillingSubscription).toHaveBeenCalledWith({
      customerId: 'cus_123',
      priceId: 'price_metered_123',
      userId: 'user_1',
    });
    expect(stripeService.createMeterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'monthly_management_fee',
        customerId: 'cus_123',
        value: 1250,
        timestamp: expect.any(Number),
        identifier: expect.stringMatching(/^usage_charge_/),
      }),
    );
    expect(result).toMatchObject({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_123',
      stripeSubscriptionItemId: 'si_123',
      amountGbp: 1250,
      status: ChargeStatus.PROCESSING,
    });
    expect(billingSubscriptions).toHaveLength(1);
  });

  it('reuses an existing Stripe subscription when one already exists', async () => {
    const user = buildUser();
    billingSql.findBillingSubscriptionByUserId.mockResolvedValue({
      id: 'billing_sub_1',
      userId: 'user_1',
      stripeSubscriptionId: 'sub_123',
      stripeSubscriptionItemId: 'si_123',
      stripePriceId: 'price_metered_123',
      status: BillingSubscriptionStatus.ACTIVE,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    billingSql.findUsageChargeByIdempotencyKey.mockResolvedValue(null);
    stripeService.retrievePrice.mockResolvedValue({
      recurring: { meter: 'meter_123' },
    });
    stripeService.retrieveBillingMeter.mockResolvedValue({
      event_name: 'monthly_management_fee',
    });
    stripeService.createMeterEvent.mockResolvedValue({
      id: 'me_123',
      object: 'billing.meter_event',
    });

    const result = await service.chargeUser(user, 1250);

    expect(stripeService.createBillingSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      stripeSubscriptionId: 'sub_123',
      stripeSubscriptionItemId: 'si_123',
    });
  });

  it('does not report usage twice for the same billing period', async () => {
    const user = buildUser();
    billingSql.findBillingSubscriptionByUserId.mockResolvedValue(null);
    stripeService.listSubscriptions.mockResolvedValue({ data: [] });
    stripeService.retrievePrice.mockResolvedValue({
      recurring: { meter: 'meter_123' },
    });
    stripeService.retrieveBillingMeter.mockResolvedValue({
      event_name: 'monthly_management_fee',
    });
    stripeService.createBillingSubscription.mockResolvedValue(
      buildStripeSubscription(),
    );
    stripeService.createMeterEvent.mockResolvedValue({
      id: 'me_123',
      object: 'billing.meter_event',
    });

    const firstCharge = await service.chargeUser(user, 1250);
    const secondCharge = await service.chargeUser(user, 1250);

    expect(stripeService.createMeterEvent).toHaveBeenCalledTimes(1);
    expect(billingSql.upsertUsageCharge).toHaveBeenCalledTimes(1);
    expect(secondCharge).toEqual(firstCharge);
  });

  it('skips non-billable users in the monthly run', async () => {
    billingSql.findBillableUsers.mockResolvedValue([]);

    const result = await service.chargeAllUsers();

    expect(billingSql.findBillableUsers).toHaveBeenCalled();
    expect(result).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    });
    expect(stripeService.createMeterEvent).not.toHaveBeenCalled();
  });
});
