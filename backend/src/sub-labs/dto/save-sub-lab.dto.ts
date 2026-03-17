import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveSubLabPriceDto {
  @IsUUID()
  @IsNotEmpty()
  testId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
}

export class SaveSubLabDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveSubLabPriceDto)
  prices?: SaveSubLabPriceDto[];
}
