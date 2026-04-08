import type Stripe from 'stripe';
import { ChargeStatus, PaymentStatus } from '@stripe-app/shared';
import { PaymentIntentHandler } from './payment-intent.handler';

describe('PaymentIntentHandler', () => {
  const database = {
    query: jest.fn(),
  };

  const handler = new PaymentIntentHandler(database as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildPaymentIntent(
    overrides: Partial<Stripe.PaymentIntent> = {},
  ): Stripe.PaymentIntent {
    return {
      id: 'pi_user_payment',
      metadata: {
        type: 'user_payment',
        userId: 'user_1',
        idempotencyKey: 'payment:user_1:1250:pm_card_1',
      },
      ...overrides,
    } as Stripe.PaymentIntent;
  }

  function buildEvent(
    type: Stripe.Event.Type,
    paymentIntent: Stripe.PaymentIntent,
  ): Stripe.Event {
    return {
      id: 'evt_payment_intent',
      type,
      data: {
        object: paymentIntent,
      },
    } as Stripe.Event;
  }

  it('marks management fee payment intents as paid without sending invoice email', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'charge_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });
    database.query.mockResolvedValueOnce({ rows: [{ id: 'payment_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handleSucceeded(
      buildEvent(
        'payment_intent.succeeded',
        buildPaymentIntent({
          id: 'pi_management_fee',
          metadata: { type: 'management_fee' },
        }),
      ),
    );

    expect(database.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM usage_charges WHERE "stripePaymentIntentId" = :1 FETCH FIRST 1 ROWS ONLY',
      ['pi_management_fee'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE usage_charges SET status = :2, "updatedAt" = SYSTIMESTAMP WHERE id = :1',
      ['charge_1', ChargeStatus.PAID],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      3,
      'SELECT id FROM payments WHERE "stripePaymentIntentId" = :1 FETCH FIRST 1 ROWS ONLY',
      ['pi_management_fee'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE payments'),
      ['payment_1', PaymentStatus.SUCCEEDED, 'pi_management_fee'],
    );
  });

  it('falls back to metadata reconciliation when the direct payment intent lookup misses', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });
    database.query.mockResolvedValueOnce({ rows: [{ id: 'payment_2' }] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handleSucceeded(
      buildEvent('payment_intent.succeeded', buildPaymentIntent()),
    );

    expect(database.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM payments WHERE "stripePaymentIntentId" = :1 FETCH FIRST 1 ROWS ONLY',
      ['pi_user_payment'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM payments'),
      ['user_1', 'payment:user_1:1250:pm_card_1', PaymentStatus.PENDING],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE payments'),
      ['payment_2', PaymentStatus.SUCCEEDED, 'pi_user_payment'],
    );
  });

  it('throws for unresolved user payment intents so Stripe retries the webhook', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      handler.handleSucceeded(
        buildEvent('payment_intent.succeeded', buildPaymentIntent()),
      ),
    ).rejects.toThrow(
      'Unable to reconcile PaymentIntent pi_user_payment to a local payment',
    );
  });
});
