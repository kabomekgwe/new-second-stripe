import { ChargeStatus } from '../../shared';
import type Stripe from 'stripe';
import { InvoiceHandler } from './invoice.handler';

describe('InvoiceHandler', () => {
  const database = {
    query: jest.fn(),
  };
  const emailService = {
    sendInvoiceEmail: jest.fn(),
  };

  const handler = new InvoiceHandler(
    database as never,
    emailService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildInvoice(
    overrides: Partial<Stripe.Invoice> & {
      subscription?: string | Stripe.Subscription;
      payment_intent?: string | Stripe.PaymentIntent;
    } = {},
  ): Stripe.Invoice {
    return {
      id: 'in_123',
      subscription: 'sub_123',
      payment_intent: 'pi_123',
      lines: {
        data: [
          {
            period: { start: 1_772_287_200, end: 1_774_966_400 },
            parent: {
              subscription_item_details: {
                subscription_item: 'si_123',
              },
            },
          },
        ],
      },
      ...overrides,
    } as unknown as Stripe.Invoice;
  }

  function buildEvent(type: string, invoice: Stripe.Invoice): Stripe.Event {
    return {
      id: `evt_${type}`,
      type,
      data: { object: invoice },
    } as Stripe.Event;
  }

  it('marks finalized charges as processing without sending email', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'charge_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handleFinalized(
      buildEvent('invoice.finalized', buildInvoice()),
    );

    expect(database.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT ID'),
      ['sub_123', 'si_123', expect.any(Date), expect.any(Date)],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE STRIPE_USAGE_CHARGES'),
      ['charge_1', 'in_123', 'pi_123', ChargeStatus.PROCESSING],
    );
    expect(emailService.sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it('marks paid charges as paid and sends invoice email through our system', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'charge_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });
    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'charge_1',
          amountGbp: 2500,
          description: 'Management fee',
          billingPeriodStart: new Date('2026-03-01'),
          billingPeriodEnd: new Date('2026-03-31'),
          emailSentAt: null,
          email: 'user@example.com',
          name: 'User One',
        },
      ],
    });
    database.query.mockResolvedValueOnce({ rows: [] });

    await handler.handlePaid(buildEvent('invoice.paid', buildInvoice()));

    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE STRIPE_USAGE_CHARGES'),
      ['charge_1', 'in_123', 'pi_123', ChargeStatus.PAID],
    );
    expect(emailService.sendInvoiceEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      userName: 'User One',
      amountPence: 2500,
      description: 'Management fee',
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-31'),
      chargeId: 'charge_1',
    });
    expect(database.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('EMAIL_SENT_AT'),
      ['charge_1'],
    );
  });

  it('skips sending email if already sent', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'charge_1' }] });
    database.query.mockResolvedValueOnce({ rows: [] });
    database.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'charge_1',
          amountGbp: 2500,
          description: 'Management fee',
          billingPeriodStart: new Date('2026-03-01'),
          billingPeriodEnd: new Date('2026-03-31'),
          emailSentAt: new Date('2026-04-01'),
          email: 'user@example.com',
          name: 'User One',
        },
      ],
    });

    await handler.handlePaid(buildEvent('invoice.paid', buildInvoice()));

    expect(emailService.sendInvoiceEmail).not.toHaveBeenCalled();
  });
});
