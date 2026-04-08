import {
  STRIPE_WEBHOOK_EVENTS,
  WebhookEventStatus,
} from '../shared';
import type Stripe from 'stripe';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const webhookEventStore = new Map<
    string,
    { eventId: string; status: WebhookEventStatus }
  >();

  const database = {
    query: jest.fn(async (text: string, params: unknown[]) => {
      if (text.includes('SELECT EVENT_ID, STATUS FROM STRIPE_WEBHOOK_EVENTS')) {
        const event = webhookEventStore.get(params[0] as string);
        return { rows: event ? [event] : [] };
      }

      if (text.includes('MERGE INTO STRIPE_WEBHOOK_EVENTS')) {
        webhookEventStore.set(params[0] as string, {
          eventId: params[0] as string,
          status: params[2] as WebhookEventStatus,
        });
        return { rows: [] };
      }

      if (text.includes('SET STATUS = :2')) {
        const current = webhookEventStore.get(params[0] as string);
        if (current) {
          webhookEventStore.set(params[0] as string, {
            ...current,
            status: params[1] as WebhookEventStatus,
          });
        }
        return { rows: [] };
      }

      return { rows: [] };
    }),
  };

  const stripeService = {
    constructWebhookEvent: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('whsec_test'),
    get: jest.fn().mockReturnValue('development'),
  };

  const setupIntentHandler = { handleSucceeded: jest.fn() };
  const paymentMethodHandler = {
    handleAttached: jest.fn(),
    handleDetached: jest.fn(),
  };
  const paymentIntentHandler = {
    handleSucceeded: jest.fn(),
    handleFailed: jest.fn(),
  };
  const checkoutSessionHandler = {
    handleCompleted: jest.fn(),
    handleExpired: jest.fn(),
    handleAsyncSucceeded: jest.fn(),
    handleAsyncFailed: jest.fn(),
  };
  const invoiceHandler = {
    handleFinalized: jest.fn(),
    handlePaid: jest.fn(),
    handlePaymentFailed: jest.fn(),
  };
  const subscriptionHandler = {
    handleCreated: jest.fn(),
    handleUpdated: jest.fn(),
    handleDeleted: jest.fn(),
  };

  const service = new WebhooksService(
    database as never,
    stripeService as never,
    configService as never,
    setupIntentHandler as never,
    paymentMethodHandler as never,
    paymentIntentHandler as never,
    checkoutSessionHandler as never,
    invoiceHandler as never,
    subscriptionHandler as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    webhookEventStore.clear();
  });

  function buildEvent(
    type: string,
    id: string,
    object: Record<string, unknown>,
  ): Stripe.Event {
    return {
      id,
      type,
      data: { object },
    } as unknown as Stripe.Event;
  }

  it('routes async checkout session success events to the checkout handler', async () => {
    const event = buildEvent(
      STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_ASYNC_PAYMENT_SUCCEEDED,
      'evt_async_success',
      { id: 'cs_async_success' },
    );
    stripeService.constructWebhookEvent.mockReturnValue(event);

    await service.handleEvent(Buffer.from('raw'), 'sig');

    expect(checkoutSessionHandler.handleAsyncSucceeded).toHaveBeenCalledWith(
      event,
    );
  });

  it('routes invoice paid events to the invoice handler', async () => {
    const event = buildEvent(
      STRIPE_WEBHOOK_EVENTS.INVOICE_PAID,
      'evt_invoice_paid',
      { id: 'in_paid' },
    );
    stripeService.constructWebhookEvent.mockReturnValue(event);

    await service.handleEvent(Buffer.from('raw'), 'sig');

    expect(invoiceHandler.handlePaid).toHaveBeenCalledWith(event);
  });

  it('skips duplicate webhook deliveries for the same event id', async () => {
    const event = buildEvent(
      STRIPE_WEBHOOK_EVENTS.PAYMENT_INTENT_SUCCEEDED,
      'evt_duplicate',
      { id: 'pi_duplicate' },
    );
    stripeService.constructWebhookEvent.mockReturnValue(event);

    await service.handleEvent(Buffer.from('raw'), 'sig');
    await service.handleEvent(Buffer.from('raw'), 'sig');

    expect(paymentIntentHandler.handleSucceeded).toHaveBeenCalledTimes(1);
  });
});
