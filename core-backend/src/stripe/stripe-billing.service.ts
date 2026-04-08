import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe-client.token';

@Injectable()
export class StripeBillingService {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  listSubscriptions(
    customerId: string,
    limit = 10,
  ): Promise<Stripe.ApiList<Stripe.Subscription>> {
    return this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit,
    });
  }

  createBillingSubscription(params: {
    customerId: string;
    productId: string;
    userId: string;
    billingCycleAnchor: number;
    defaultPaymentMethod: string;
  }): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.create({
      customer: params.customerId,
      collection_method: 'charge_automatically',
      default_payment_method: params.defaultPaymentMethod,
      items: [
        {
          price_data: {
            currency: 'gbp',
            product: params.productId,
            unit_amount: 0,
            recurring: { interval: 'month' },
          },
        },
      ],
      billing_cycle_anchor: params.billingCycleAnchor,
      proration_behavior: 'none',
      metadata: { userId: params.userId },
    });
  }

  createInvoiceItem(params: {
    customer: string;
    subscription: string;
    amount: number;
    currency: string;
    description: string;
  }): Promise<Stripe.InvoiceItem> {
    return this.stripe.invoiceItems.create(params);
  }

  retrievePrice(priceId: string): Promise<Stripe.Price> {
    return this.stripe.prices.retrieve(priceId);
  }
}
