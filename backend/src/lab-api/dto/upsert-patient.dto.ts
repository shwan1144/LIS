import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertPatientDto {
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
  @MaxLength(256)
  fullName: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1)
  sex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;
}
