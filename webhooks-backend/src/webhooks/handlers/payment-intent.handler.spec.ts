import type Stripe from 'stripe';
import { ChargeStatus, PaymentStatus } from '@stripe-app/shared';
import { PaymentIntentHandler } from './payment-intent.handler';

describe('PaymentIntentHandler', () => {
  const paymentRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const usageChargeRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const emailService = {
    sendInvoiceEmail: jest.fn(),
  };

  const handler = new PaymentIntentHandler(
    paymentRepository as never,
    usageChargeRepository as never,
    emailService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildSucceededEvent(
    id: string,
  ): Stripe.Event {
    return {
      id,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_management_fee',
          metadata: {
            type: 'management_fee',
          },
        } as unknown as Stripe.PaymentIntent,
      },
    } as Stripe.Event;
  }

  it('marks management fee payment intents as paid and sends the invoice once', async () => {
    const charge = {
      id: 'charge_1',
      amountGbp: 2500,
      description: 'Management fee',
      billingPeriodStart: new Date('2026-01-01'),
      billingPeriodEnd: new Date('2026-01-31'),
      user: {
        email: 'user@example.com',
        name: 'User One',
      },
    };
    const payment = { id: 'payment_1' };

    usageChargeRepository.findOne.mockResolvedValue(charge);
    paymentRepository.findOne.mockResolvedValue(payment);

    await handler.handleSucceeded(buildSucceededEvent('evt_invoice_once'));

    expect(usageChargeRepository.update).toHaveBeenCalledWith(charge.id, {
      status: ChargeStatus.PAID,
    });
    expect(paymentRepository.update).toHaveBeenCalledWith(payment.id, {
      status: PaymentStatus.SUCCEEDED,
    });
    expect(emailService.sendInvoiceEmail).toHaveBeenCalledTimes(1);
  });

  it('sends an invoice email for each successful handler invocation', async () => {
    const charge = {
      id: 'charge_2',
      amountGbp: 2500,
      description: 'Management fee',
      billingPeriodStart: new Date('2026-01-01'),
      billingPeriodEnd: new Date('2026-01-31'),
      user: {
        email: 'user@example.com',
        name: 'User One',
      },
    };
    const payment = { id: 'payment_2' };

    usageChargeRepository.findOne.mockResolvedValue(charge);
    paymentRepository.findOne.mockResolvedValue(payment);

    const event = buildSucceededEvent('evt_invoice_duplicate');

    await handler.handleSucceeded(event);
    await handler.handleSucceeded(event);

    expect(emailService.sendInvoiceEmail).toHaveBeenCalledTimes(2);
  });
});
