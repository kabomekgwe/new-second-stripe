import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { User } from '@stripe-app/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { PaymentMethodsService } from './payment-methods.service';

class SyncPaymentMethodDto {
  stripePaymentMethodId!: string;
}

@Controller('payment-methods')
@UseGuards(AuthenticatedGuard)
export class PaymentMethodsController {
  private readonly logger = new Logger(PaymentMethodsController.name);

  constructor(private paymentMethodsService: PaymentMethodsService) {}

  @Get()
  getUserPaymentMethods(@Req() req: Request) {
    return this.paymentMethodsService.getUserPaymentMethods(
      (req.user as User).id,
    );
  }

  @Get('available')
  getAvailablePaymentMethodTypes() {
    return this.paymentMethodsService.getAvailablePaymentMethodTypes();
  }

  @Post('setup-intent')
  createSetupIntent(@Req() req: Request) {
    return this.paymentMethodsService.createSetupIntent(
      (req.user as User).id,
    );
  }

  @Post('sync')
  async syncPaymentMethod(
    @Req() req: Request,
    @Body() body: SyncPaymentMethodDto,
  ) {
    this.logger.log(`Syncing payment method ${body.stripePaymentMethodId} for user ${(req.user as User).id}`);
    try {
      const result = await this.paymentMethodsService.syncAndSavePaymentMethod(
        (req.user as User).id,
        body.stripePaymentMethodId,
      );
      this.logger.log(`Successfully synced payment method ${body.stripePaymentMethodId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to sync payment method ${body.stripePaymentMethodId}: ${error.message}`);
      throw error;
    }
  }

  @Post(':id/default')
  setDefault(@Req() req: Request, @Param('id') id: string) {
    return this.paymentMethodsService.setDefault(
      (req.user as User).id,
      id,
    );
  }

  @Delete(':id')
  removePaymentMethod(@Req() req: Request, @Param('id') id: string) {
    return this.paymentMethodsService.removePaymentMethod(
      (req.user as User).id,
      id,
    );
  }
}
