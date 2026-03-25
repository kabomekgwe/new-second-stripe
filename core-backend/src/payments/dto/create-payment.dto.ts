import { IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @Min(1)
  amountGbp: number; // in pence

  @IsString()
  paymentMethodId: string; // Stripe PM ID (pm_xxx)

  @IsString()
  @IsOptional()
  fxQuoteId?: string;
}
