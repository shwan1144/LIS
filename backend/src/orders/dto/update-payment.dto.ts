import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateOrderPaymentDto {
  @IsIn(['unpaid', 'partial', 'paid'])
  paymentStatus: 'unpaid' | 'partial' | 'paid';

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;
}
