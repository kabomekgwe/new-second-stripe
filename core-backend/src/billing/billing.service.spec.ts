import {
  BillingSubscriptionStatus,
  ChargeStatus,
  User,
} from '@stripe-app/shared';
import { ConfigService } from '@nestjs/config';
import { BillingService, getNextBillingAnchor } from './billing.service';

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

  const stripeBilling = {
    listSubscriptions: jest.fn(),
    createBillingSubscription: jest.fn(),
    createInvoiceItem: jest.fn(),
  };
  const stripeCustomers = {
    updateDefaultPaymentMethod: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'STRIPE_BILLING_PRODUCT_ID') return 'prod_123';
      if (key === 'NODE_ENV') return 'development';
      return defaultValue;
    }),
  } as unknown as ConfigService;

  const service = new BillingService(
    billingSql as never,
    stripeBilling as never,
    stripeCustomers as never,
    configService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    billingSubscriptions.splice(0);
    usageCharges.splice(0);
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
      metadata: { userId: 'user_1' },
      items: { data: [{ id: 'si_123', price: { id: 'price_inline_123' } }] },
      current_period_start: 1762896000,
      current_period_end: 1765555199,
      ...overrides,
    };
  }

  it('creates invoice item for a billable user', async () => {
    const user = buildUser();
    billingSql.findBillingSubscriptionByUserId.mockResolvedValue(null);
    billingSql.findUsageChargeByIdempotencyKey.mockResolvedValue(null);
    stripeBilling.listSubscriptions.mockResolvedValue({ data: [] });
    stripeBilling.createBillingSubscription.mockResolvedValue(
      buildStripeSubscription(),
    );
    stripeBilling.createInvoiceItem.mockResolvedValue({ id: 'ii_123' });

    const result = await service.chargeUser(user, 1250);

    expect(
      stripeCustomers.updateDefaultPaymentMethod,
    ).toHaveBeenCalledWith('cus_123', 'pm_123');
    expect(stripeBilling.createBillingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_123',
        productId: 'prod_123',
        userId: 'user_1',
        defaultPaymentMethod: 'pm_123',
      }),
    );
    expect(stripeBilling.createInvoiceItem).toHaveBeenCalledWith({
      customer: 'cus_123',
      subscription: 'sub_123',
      amount: 1250,
      currency: 'gbp',
      description: expect.stringContaining('Management fee'),
    });
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
      stripePriceId: 'price_inline_123',
      status: BillingSubscriptionStatus.ACTIVE,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    billingSql.findUsageChargeByIdempotencyKey.mockResolvedValue(null);
    stripeBilling.createInvoiceItem.mockResolvedValue({ id: 'ii_123' });

    const result = await service.chargeUser(user, 1250);

    expect(stripeBilling.createBillingSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      stripeSubscriptionId: 'sub_123',
      stripeSubscriptionItemId: 'si_123',
    });
  });

  it('does not charge twice for same period', async () => {
    const user = buildUser();
    billingSql.findBillingSubscriptionByUserId.mockResolvedValue(null);
    stripeBilling.listSubscriptions.mockResolvedValue({ data: [] });
    stripeBilling.createBillingSubscription.mockResolvedValue(
      buildStripeSubscription(),
    );
    stripeBilling.createInvoiceItem.mockResolvedValue({ id: 'ii_123' });

    const first = await service.chargeUser(user, 1250);
    const second = await service.chargeUser(user, 1250);

    expect(stripeBilling.createInvoiceItem).toHaveBeenCalledTimes(1);
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
    expect(stripeBilling.createInvoiceItem).not.toHaveBeenCalled();
  });

  describe('getCurrentBillingPeriod', () => {
    it('returns correct period when date >= 25th', () => {
      jest.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));
      const period = service.getCurrentBillingPeriod();
      expect(period.key).toBe('2026-03-25');
      expect(period.start).toEqual(new Date('2026-03-25T00:00:00.000Z'));
      expect(period.end).toEqual(new Date('2026-04-24T00:00:00.000Z'));
    });

    it('returns correct period when date < 25th', () => {
      jest.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
      const period = service.getCurrentBillingPeriod();
      expect(period.key).toBe('2026-02-25');
      expect(period.start).toEqual(new Date('2026-02-25T00:00:00.000Z'));
      expect(period.end).toEqual(new Date('2026-03-24T00:00:00.000Z'));
    });
  });

  describe('getNextBillingAnchor', () => {
    it('returns this month 25th when before the 25th', () => {
      const anchor = getNextBillingAnchor(
        new Date('2026-03-10T12:00:00.000Z'),
      );
      expect(new Date(anchor * 1000)).toEqual(
        new Date('2026-03-25T09:00:00.000Z'),
      );
    });

    it('returns next month 25th when past the 25th', () => {
      const anchor = getNextBillingAnchor(
        new Date('2026-03-26T12:00:00.000Z'),
      );
      expect(new Date(anchor * 1000)).toEqual(
        new Date('2026-04-25T09:00:00.000Z'),
      );
    });

    it('returns next month when on the 25th after 9am', () => {
      const anchor = getNextBillingAnchor(
        new Date('2026-03-25T10:00:00.000Z'),
      );
      expect(new Date(anchor * 1000)).toEqual(
        new Date('2026-04-25T09:00:00.000Z'),
      );
    });

    it('returns same day when on the 25th before 9am', () => {
      const anchor = getNextBillingAnchor(
        new Date('2026-03-25T08:00:00.000Z'),
      );
      expect(new Date(anchor * 1000)).toEqual(
        new Date('2026-03-25T09:00:00.000Z'),
      );
    });
  });
});
