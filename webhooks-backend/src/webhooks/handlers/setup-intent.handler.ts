import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User, PaymentMethod } from '@stripe-app/shared';
import { StripeService } from '../../stripe/stripe.service';

@Injectable()
export class SetupIntentHandler {
  private readonly logger = new Logger(SetupIntentHandler.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PaymentMethod)
    private paymentMethodRepository: Repository<PaymentMethod>,
    private stripeService: StripeService,
  ) {}

  async handleSucceeded(event: Stripe.Event): Promise<void> {
    const setupIntent = event.data.object as Stripe.SetupIntent;
    const customerId = setupIntent.customer as string;
    const paymentMethodId = setupIntent.payment_method as string;

    if (!customerId || !paymentMethodId) {
      this.logger.warn(
        `Setup intent ${setupIntent.id} missing customer or payment_method`,
      );
      return;
    }

    const user = await this.userRepository.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`No user found for Stripe customer ${customerId}`);
      return;
    }

    const stripePm = await this.stripeService
      .getClient()
      .paymentMethods.retrieve(paymentMethodId);

    await this.upsertPaymentMethod(user, stripePm);
    this.logger.log(
      `Synced payment method ${paymentMethodId} for user ${user.id}`,
    );
  }

  private async upsertPaymentMethod(
    user: User,
    stripePm: Stripe.PaymentMethod,
  ): Promise<void> {
    const existing = await this.paymentMethodRepository.findOne({
      where: { stripePaymentMethodId: stripePm.id },
    });

    const pmData = {
      userId: user.id,
      stripePaymentMethodId: stripePm.id,
      type: stripePm.type,
      last4: stripePm.card?.last4 ?? null,
      brand: stripePm.card?.brand ?? null,
      expiryMonth: stripePm.card?.exp_month ?? null,
      expiryYear: stripePm.card?.exp_year ?? null,
    };

    if (existing) {
      await this.paymentMethodRepository.update(existing.id, pmData);
    } else {
      await this.paymentMethodRepository.save(
        this.paymentMethodRepository.create(pmData),
      );
    }

    // Set as default if user has no default payment method
    if (!user.defaultPaymentMethodId) {
      await this.paymentMethodRepository.update({ userId: user.id }, { isDefault: false });
      await this.paymentMethodRepository.update(
        { userId: user.id, stripePaymentMethodId: stripePm.id },
        { isDefault: true },
      );
      await this.userRepository.update(user.id, {
        defaultPaymentMethodId: stripePm.id,
      });
    }
  }
}
