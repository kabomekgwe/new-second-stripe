import { BillingSubscriptionStatus } from '@stripe-app/shared';
import type Stripe from 'stripe';
import { SubscriptionHandler } from './subscription.handler';

describe('SubscriptionHandler', () => {
  const database = {
    query: jest.fn(),
  };

  const handler = new SubscriptionHandler(database as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildSubscription(
    overrides: Record<string, unknown> = {},
  ): Stripe.Subscription {
    return {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      metadata: { userId: 'user_1' },
      cancel_at_period_end: false,
      canceled_at: null,
      current_period_start: 1_772_287_200,
      current_period_end: 1_774_966_400,
      items: {
        data: [
          {
            id: 'si_123',
            price: { id: 'price_123' },
          },
        ],
      },
      ...overrides,
    } as unknown as Stripe.Subscription;
  }

  it('upserts a local subscription on create', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'user_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handleCreated({
      id: 'evt_subscription_created',
      type: 'customer.subscription.created',
      data: { object: buildSubscription() },
    } as Stripe.Event);

    expect(database.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM users WHERE id = :1 FETCH FIRST 1 ROWS ONLY',
      ['user_1'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('MERGE INTO "billing_subscriptions"'),
      [
        'sub_123',
        'user_1',
        'si_123',
        'price_123',
        BillingSubscriptionStatus.ACTIVE,
        expect.any(Date),
        expect.any(Date),
        0,
        null,
        expect.any(String),
      ],
    );
  });

  it('marks subscriptions as canceled on delete', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'local_sub_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handleDeleted({
      id: 'evt_subscription_deleted',
      type: 'customer.subscription.deleted',
      data: {
        object: buildSubscription({ canceled_at: 1_774_966_400 }),
      },
    } as Stripe.Event);

    expect(database.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM billing_subscriptions WHERE "stripeSubscriptionId" = :1 FETCH FIRST 1 ROWS ONLY',
      ['sub_123'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE billing_subscriptions'),
      ['local_sub_1', BillingSubscriptionStatus.CANCELED, 0, expect.any(Date)],
    );
  });
});
