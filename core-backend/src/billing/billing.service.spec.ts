import {
  BillingSubscriptionStatus,
  ChargeStatus,
  User,
} from '@stripe-app/shared';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  const billingSubscriptions: Array<Record<string, unknown>> = [];
  const usageCharges: Array<Record<string, unknown>> = [];

  const billingSql = {
    findBillableUsers: jest.fn(),
    findUsageChargeByIdempotencyKey: jest.fn(
      async (key: string) =>
        usageCharges.find((c) => c.idempotencyKey === key) ?? null,
    ),
    listUsageChargesByUserId: jest.fn(),
    upsertUsageCharge: jest.fn(async (payload: Record<string, unknown>) => {
      const idx = usageCharges.findIndex(
        (c) => c.idempotencyKey === payload.idempotencyKey,
      );
      if (idx >= 0) {
        usageCharges[idx] = { ...usageCharges[idx], ...payload };
        return usageCharges[idx];
      }
      const next = { id: `usage_${usageCharges.length + 1}`, ...payload };
      usageCharges.push(next);
      return next;
    }),
    findBillingSubscriptionByUserId: jest.fn(
      async (userId: string) =>
        billingSubscriptions.find((s) => s.userId === userId) ?? null,
    ),
    upsertBillingSubscription: jest.fn(
      async (payload: Record<string, unknown>) => {
        const idx = billingSubscriptions.findIndex(
          (s) => s.stripeSubscriptionId === payload.stripeSubscriptionId,
        );
        if (idx >= 0) {
          billingSubscriptions[idx] = {
            ...billingSubscriptions[idx],
            ...payload,
          };
          return billingSubscriptions[idx];
        }
        const next = {
          id: `sub_${billingSubscriptions.length + 1}`,
          ...payload,
        };
        billingSubscriptions.push(next);
        return next;
      },
    ),
  };

  const stripeService = {
    listSubscriptions: jest.fn(),
    createBillingSubscription: jest.fn(),
    updateCustomerDefaultPaymentMethod: jest.fn(),
    getBillingMeterEventName: jest
      .fn()
      .mockResolvedValue('monthly_management_fee'),
    createMeterEvent: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'STRIPE_BILLING_METERED_PRICE_ID') return 'price_metered_123';
      if (key === 'NODE_ENV') return 'development';
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
    // Re-stub after resetAllMocks clears initial implementations
    stripeService.getBillingMeterEventName.mockResolvedValue(
      'monthly_management_fee',
    );
    billingSql.findUsageChargeByIdempotencyKey.mockImplementation(
      async (key: string) =>
        usageCharges.find((c) => c.idempotencyKey === key) ?? null,
    );
    billingSql.upsertUsageCharge.mockImplementation(
      async (payload: Record<string, unknown>) => {
        const idx = usageCharges.findIndex(
          (c) => c.idempotencyKey === payload.idempotencyKey,
        );
        if (idx >= 0) {
          usageCharges[idx] = { ...usageCharges[idx], ...payload };
          return usageCharges[idx];
        }
        const next = { id: `usage_${usageCharges.length + 1}`, ...payload };
        usageCharges.push(next);
        return next;
      },
    );
    billingSql.findBillingSubscriptionByUserId.mockImplementation(
      async (userId: string) =>
        billingSubscriptions.find((s) => s.userId === userId) ?? null,
    );
    billingSql.upsertBillingSubscription.mockImplementation(
      async (payload: Record<string, unknown>) => {
        const idx = billingSubscriptions.findIndex(
          (s) => s.stripeSubscriptionId === payload.stripeSubscriptionId,
        );
        if (idx >= 0) {
          billingSubscriptions[idx] = {
            ...billingSubscriptions[idx],
            ...payload,
          };
          return billingSubscriptions[idx];
        }
        const next = {
          id: `sub_${billingSubscriptions.length + 1}`,
          ...payload,
        };
        billingSubscriptions.push(next);
        return next;
      },
    );
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

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
      items: { data: [{ id: 'si_123', price: { id: 'price_metered_123' } }] },
      current_period_start: 1762896000,
      current_period_end: 1765555199,
      ...overrides,
    };
  }

  it('reports metered usage for a billable user', async () => {
    const user = buildUser();
    billingSql.findBillingSubscriptionByUserId.mockResolvedValue(null);
    billingSql.findUsageChargeByIdempotencyKey.mockResolvedValue(null);
    stripeService.listSubscriptions.mockResolvedValue({ data: [] });
    stripeService.createBillingSubscription.mockResolvedValue(
      buildStripeSubscription(),
    );
    stripeService.createMeterEvent.mockResolvedValue({
      id: 'me_123',
      object: 'billing.meter_event',
    });

    const result = await service.chargeUser(user, 1250);

    expect(
      stripeService.updateCustomerDefaultPaymentMethod,
    ).toHaveBeenCalledWith('cus_123', 'pm_123');
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
      }),
    );
    expect(result).toMatchObject({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_123',
      amountGbp: 1250,
      status: ChargeStatus.PROCESSING,
    });
  });

  it('reuses existing Stripe subscription', async () => {
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

    const result = await service.chargeUser(user, 1250);

    expect(stripeService.createBillingSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      stripeSubscriptionId: 'sub_123',
      stripeSubscriptionItemId: 'si_123',
    });
  });

  it('does not report usage twice for same period', async () => {
    const user = buildUser();
    billingSql.findBillingSubscriptionByUserId.mockResolvedValue(null);
    stripeService.listSubscriptions.mockResolvedValue({ data: [] });
    stripeService.createBillingSubscription.mockResolvedValue(
      buildStripeSubscription(),
    );
    stripeService.createMeterEvent.mockResolvedValue({ id: 'me_123' });

    const first = await service.chargeUser(user, 1250);
    const second = await service.chargeUser(user, 1250);

    expect(stripeService.createMeterEvent).toHaveBeenCalledTimes(1);
    expect(billingSql.upsertUsageCharge).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('skips non-billable users', async () => {
    billingSql.findBillableUsers.mockResolvedValue([]);
    const result = await service.chargeAllUsers();
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
