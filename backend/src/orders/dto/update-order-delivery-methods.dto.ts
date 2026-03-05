import { IsArray, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { DeliveryMethod } from '../../entities/order.entity';

export class UpdateOrderDeliveryMethodsDto {
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : item))
      : value,
  )
  @IsArray()
  @IsEnum(DeliveryMethod, { each: true })
  deliveryMethods?: DeliveryMethod[];
}
