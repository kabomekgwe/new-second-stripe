import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User, PaymentMethod } from '@stripe-app/shared';

@Injectable()
export class PaymentMethodHandler {
  private readonly logger = new Logger(PaymentMethodHandler.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PaymentMethod)
    private paymentMethodRepository: Repository<PaymentMethod>,
  ) {}

  async handleAttached(event: Stripe.Event): Promise<void> {
    const stripePm = event.data.object as Stripe.PaymentMethod;
    const customerId = stripePm.customer as string;

    if (!customerId) {
      this.logger.warn(`Payment method ${stripePm.id} has no customer`);
      return;
    }

    const user = await this.userRepository.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`No user found for Stripe customer ${customerId}`);
      return;
    }

    const pmData: Pick<
      PaymentMethod,
      | 'userId'
      | 'stripePaymentMethodId'
      | 'type'
      | 'last4'
      | 'brand'
      | 'expiryMonth'
      | 'expiryYear'
    > = {
      userId: user.id,
      stripePaymentMethodId: stripePm.id,
      type: stripePm.type,
      last4: stripePm.card?.last4 ?? null,
      brand: stripePm.card?.brand ?? null,
      expiryMonth: stripePm.card?.exp_month ?? null,
      expiryYear: stripePm.card?.exp_year ?? null,
    };

    const existing = await this.paymentMethodRepository.findOne({
      where: { stripePaymentMethodId: stripePm.id },
    });

    await this.upsertPaymentMethod(stripePm.id, pmData);

    // Set as default if user has no default payment method
    if (!user.defaultPaymentMethodId) {
      await this.setDefaultPaymentMethod(user.id, stripePm.id);
    }

    this.logger.log(
      `Synced attached payment method ${stripePm.id} for user ${user.id}`,
    );
  }

  async handleDetached(event: Stripe.Event): Promise<void> {
    const stripePm = event.data.object as Stripe.PaymentMethod;

    const existing = await this.paymentMethodRepository.findOne({
      where: { stripePaymentMethodId: stripePm.id },
    });

    if (!existing) {
      this.logger.debug(
        `Payment method ${stripePm.id} not found in DB, skipping detach`,
      );
      return;
    }

    const userId = existing.userId;
    await this.paymentMethodRepository.remove(existing);

    // Clear default if this was the user's default payment method
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (user?.defaultPaymentMethodId === stripePm.id) {
      await this.userRepository.update(userId, {
        defaultPaymentMethodId: null,
      });
    }

    this.logger.log(
      `Removed detached payment method ${stripePm.id} for user ${userId}`,
    );
  }

  private async upsertPaymentMethod(
    stripePaymentMethodId: string,
    pmData: Pick<
      PaymentMethod,
      | 'userId'
      | 'stripePaymentMethodId'
      | 'type'
      | 'last4'
      | 'brand'
      | 'expiryMonth'
      | 'expiryYear'
    >,
  ): Promise<void> {
    const existing = await this.paymentMethodRepository.findOne({
      where: { stripePaymentMethodId },
    });

    if (existing) {
      await this.paymentMethodRepository.update(existing.id, pmData);
      return;
    }

    await this.paymentMethodRepository.save(
      this.paymentMethodRepository.create(pmData),
    );
  }

  private async setDefaultPaymentMethod(
    userId: string,
    stripePaymentMethodId: string,
  ): Promise<void> {
    await this.paymentMethodRepository.update({ userId }, { isDefault: false });
    await this.paymentMethodRepository.update(
      { userId, stripePaymentMethodId },
      { isDefault: true },
    );
    await this.userRepository.update(userId, {
      defaultPaymentMethodId: stripePaymentMethodId,
    });
  }
}
