import { IsNumber, Min, Max } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsNumber()
  @Min(1)
  @Max(99999999) // £999,999.99 in pence
  amountGbp: number; // in pence
}
