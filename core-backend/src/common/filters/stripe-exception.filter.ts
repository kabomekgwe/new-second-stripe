import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import Stripe from 'stripe';

@Catch(Stripe.errors.StripeError)
export class StripeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StripeExceptionFilter.name);

  catch(exception: Stripe.errors.StripeError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error(
      `Stripe error: ${exception.type} - ${exception.message}`,
      exception.stack,
    );

    const status = this.getHttpStatus(exception);
    const message = this.getUserMessage(exception);

    response.status(status).json({
      statusCode: status,
      message,
      error: exception.type,
    });
  }

  private getHttpStatus(error: Stripe.errors.StripeError): number {
    switch (error.type) {
      case 'StripeCardError':
        return HttpStatus.PAYMENT_REQUIRED;
      case 'StripeRateLimitError':
        return HttpStatus.TOO_MANY_REQUESTS;
      case 'StripeInvalidRequestError':
        return HttpStatus.BAD_REQUEST;
      case 'StripeAuthenticationError':
        return HttpStatus.INTERNAL_SERVER_ERROR;
      case 'StripeConnectionError':
        return HttpStatus.SERVICE_UNAVAILABLE;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  private getUserMessage(error: Stripe.errors.StripeError): string {
    switch (error.type) {
      case 'StripeCardError':
        return error.message || 'Your payment was declined';
      case 'StripeRateLimitError':
        return 'Too many requests. Please try again shortly.';
      case 'StripeInvalidRequestError':
        return 'Invalid request. Please check your input.';
      default:
        return 'A payment processing error occurred. Please try again.';
    }
  }
}
