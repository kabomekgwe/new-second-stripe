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

  function buildSucceededEvent(): Stripe.Event {
    return {
      id: 'evt_management_fee',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_management_fee',
          metadata: { type: 'management_fee' },
        } as unknown as Stripe.PaymentIntent,
      },
    } as Stripe.Event;
  }

  it('marks management fee payment intents as paid without sending invoice email', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'charge_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });
    database.query.mockResolvedValueOnce({ rows: [{ id: 'payment_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handleSucceeded(buildSucceededEvent());

    expect(database.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM usage_charges WHERE "stripePaymentIntentId" = $1 LIMIT 1',
      ['pi_management_fee'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE usage_charges SET status = $2, "updatedAt" = now() WHERE id = $1',
      ['charge_1', ChargeStatus.PAID],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      3,
      'SELECT id FROM payments WHERE "stripePaymentIntentId" = $1 LIMIT 1',
      ['pi_management_fee'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      4,
      'UPDATE payments SET status = $2, "updatedAt" = now() WHERE id = $1',
      ['payment_1', PaymentStatus.SUCCEEDED],
    );
  });
});
