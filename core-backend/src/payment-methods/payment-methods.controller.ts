import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { User } from '@stripe-app/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
@UseGuards(AuthenticatedGuard)
export class PaymentMethodsController {
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
