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
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { IsString, Matches } from 'class-validator';
import { User } from '../shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { PaymentMethodsService } from './payment-methods.service';

class SyncPaymentMethodDto {
  @IsString()
  @Matches(/^pm_[a-zA-Z0-9]+$/, { message: 'Invalid Stripe payment method ID format' })
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
    const pmId = body.stripePaymentMethodId;
    const userId = (req.user as User).id;
    this.logger.log(`Syncing payment method ${pmId}`);

    if (!pmId) {
      this.logger.error('Received empty stripePaymentMethodId');
      throw new BadRequestException('stripePaymentMethodId is required');
    }

    try {
      const result = await this.paymentMethodsService.syncAndSavePaymentMethod(
        userId,
        pmId,
      );
      this.logger.log(`Successfully synced payment method ${pmId}`);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to sync payment method ${pmId}: ${message}`);
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
