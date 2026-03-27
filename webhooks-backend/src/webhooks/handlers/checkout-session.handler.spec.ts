import { PaymentStatus } from '@stripe-app/shared';
import type Stripe from 'stripe';
import { CheckoutSessionHandler } from './checkout-session.handler';

describe('CheckoutSessionHandler', () => {
  const paymentRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const handler = new CheckoutSessionHandler(
    paymentRepository as never,
  );

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
    const payment = { id: 'payment_1' };
    paymentRepository.findOne.mockResolvedValue(payment);

    await handler.handleCompleted(
      buildEvent({ id: 'cs_paid', payment_status: 'paid' }),
    );

    expect(paymentRepository.update).toHaveBeenCalledWith(payment.id, {
      status: PaymentStatus.SUCCEEDED,
      stripePaymentIntentId: 'pi_test',
      amountUserCurrency: 1200,
      userCurrency: 'GBP',
    });
  });

  it('does not mark unpaid checkout sessions as succeeded', async () => {
    const payment = { id: 'payment_2' };
    paymentRepository.findOne.mockResolvedValue(payment);

    await handler.handleCompleted(
      buildEvent({ id: 'cs_unpaid', payment_status: 'unpaid' }),
    );

    expect(paymentRepository.update).not.toHaveBeenCalledWith(
      payment.id,
      expect.objectContaining({
        status: PaymentStatus.SUCCEEDED,
      }),
    );
  });

  it('marks expired checkout sessions as cancelled', async () => {
    const payment = { id: 'payment_3' };
    paymentRepository.findOne.mockResolvedValue(payment);

    await handler.handleExpired({
      id: 'evt_expired',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_expired',
        } as Stripe.Checkout.Session,
      },
    } as Stripe.Event);

    expect(paymentRepository.update).toHaveBeenCalledWith(
      payment.id,
      expect.objectContaining({
        status: PaymentStatus.CANCELLED,
      }),
    );
  });
});
