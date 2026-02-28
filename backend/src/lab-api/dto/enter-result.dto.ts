import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class EnterResultDto {
  @IsUUID()
  orderTestId: string;

  @IsString()
  @MaxLength(255)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  analyteCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  flags?: string;
}
