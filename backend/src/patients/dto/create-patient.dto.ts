import { IsOptional, IsString, MaxLength, IsDateString, IsIn, MinLength } from 'class-validator';

export class CreatePatientDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  fullName: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['M', 'F', 'O'])
  sex?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
