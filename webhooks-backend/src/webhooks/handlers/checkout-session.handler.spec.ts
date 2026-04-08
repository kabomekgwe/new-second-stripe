import { PaymentStatus } from '../../shared';
import type Stripe from 'stripe';
import { CheckoutSessionHandler } from './checkout-session.handler';

describe('CheckoutSessionHandler', () => {
  const database = {
    query: jest.fn(),
  };

  const handler = new CheckoutSessionHandler(database as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildEvent(
    session: Partial<Stripe.Checkout.Session>,
  ): Stripe.Event {
    return {
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          amount_total: 1200,
          currency: 'gbp',
          payment_intent: 'pi_test',
          payment_status: 'paid',
          ...session,
        } as Stripe.Checkout.Session,
      },
    } as Stripe.Event;
  }

  it('marks paid checkout sessions as succeeded and records the payment details', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'payment_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handleCompleted(
      buildEvent({ id: 'cs_paid', payment_status: 'paid' }),
    );

    expect(database.query).toHaveBeenNthCalledWith(
      1,
      'SELECT ID FROM STRIPE_PAYMENTS WHERE STRIPE_CHECKOUT_SESSION_ID = :1 FETCH FIRST 1 ROWS ONLY',
      ['cs_paid'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE STRIPE_PAYMENTS'),
      ['payment_1', PaymentStatus.SUCCEEDED, 'pi_test', 1200, 'GBP'],
    );
  });

  it('does not mark unpaid checkout sessions as succeeded', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'payment_2' }] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handleCompleted(
      buildEvent({ id: 'cs_unpaid', payment_status: 'unpaid' }),
    );

    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE STRIPE_PAYMENTS'),
      ['payment_2', null, 'pi_test', 1200, 'GBP'],
    );
  });
});
