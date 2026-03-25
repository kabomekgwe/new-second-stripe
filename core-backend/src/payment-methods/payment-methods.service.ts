import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { PaymentMethod, User, PAYMENT_METHOD_LABELS } from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { generateUniqueIdempotencyKey } from '../common/utils/idempotency';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private paymentMethodRepo: Repository<PaymentMethod>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private stripeService: StripeService,
  ) {}

  async getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    return this.paymentMethodRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAvailablePaymentMethodTypes(): Promise<
    { type: string; label: string }[]
  > {
    const configs =
      await this.stripeService.getPaymentMethodConfigurations();

    const enabledTypes: { type: string; label: string }[] = [];

    for (const config of configs.data) {
      for (const [type, settings] of Object.entries(config)) {
        if (
          typeof settings === 'object' &&
          settings !== null &&
          'display_preference' in settings &&
          (settings as any).display_preference?.preference === 'on'
        ) {
          const label = PAYMENT_METHOD_LABELS[type] ?? type;
          if (!enabledTypes.some((t) => t.type === type)) {
            enabledTypes.push({ type, label });
          }
        }
      }
    }

    return enabledTypes;
  }

  async createSetupIntent(
    userId: string,
  ): Promise<{ clientSecret: string }> {
    const user = await this.findUserOrFail(userId);

    if (!user.stripeCustomerId) {
      throw new BadRequestException(
        'User does not have a Stripe customer account',
      );
    }

    const idempotencyKey = generateUniqueIdempotencyKey(
      'setup_intent',
      userId,
    );

    const setupIntent = await this.stripeService.createSetupIntent(
      user.stripeCustomerId,
      idempotencyKey,
    );

    return { clientSecret: setupIntent.client_secret! };
  }

  async setDefault(
    userId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethod> {
    const pm = await this.findPaymentMethodOrFail(paymentMethodId, userId);

    await this.paymentMethodRepo.update(
      { userId, isDefault: true },
      { isDefault: false },
    );

    pm.isDefault = true;
    await this.paymentMethodRepo.save(pm);

    await this.userRepo.update(userId, {
      defaultPaymentMethodId: pm.stripePaymentMethodId,
    });

    return pm;
  }

  async removePaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<void> {
    const pm = await this.findPaymentMethodOrFail(paymentMethodId, userId);

    const idempotencyKey = generateUniqueIdempotencyKey(
      'detach_pm',
      pm.stripePaymentMethodId,
    );

    await this.stripeService.detachPaymentMethod(
      pm.stripePaymentMethodId,
      idempotencyKey,
    );

    if (pm.isDefault) {
      await this.userRepo.update(userId, {
        defaultPaymentMethodId: null,
      });
    }

    await this.paymentMethodRepo.remove(pm);
  }

  async syncPaymentMethodFromStripe(
    stripePaymentMethod: Stripe.PaymentMethod,
    userId: string,
  ): Promise<PaymentMethod> {
    const card = stripePaymentMethod.card;

    let pm = await this.paymentMethodRepo.findOne({
      where: { stripePaymentMethodId: stripePaymentMethod.id },
    });

    const data: Partial<PaymentMethod> = {
      userId,
      stripePaymentMethodId: stripePaymentMethod.id,
      type: stripePaymentMethod.type,
      last4: card?.last4 ?? null,
      brand: card?.brand ?? null,
      expiryMonth: card?.exp_month ?? null,
      expiryYear: card?.exp_year ?? null,
      metadata: stripePaymentMethod.metadata ?? null,
    };

    if (pm) {
      Object.assign(pm, data);
    } else {
      pm = this.paymentMethodRepo.create(data);
    }

    return this.paymentMethodRepo.save(pm);
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async findPaymentMethodOrFail(
    paymentMethodId: string,
    userId: string,
  ): Promise<PaymentMethod> {
    const pm = await this.paymentMethodRepo.findOne({
      where: { id: paymentMethodId, userId },
    });
    if (!pm) {
      throw new NotFoundException('Payment method not found');
    }
    return pm;
  }
}
