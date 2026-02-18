import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PatientType, OrderStatus } from '../../entities/order.entity';
import { TubeType } from '../../entities/sample.entity';

export class CreateOrderTestDto {
  @IsUUID()
  @IsNotEmpty()
  testId: string;
}

export class CreateSampleDto {
  @IsOptional()
  @IsString()
  sampleId?: string;

  @IsOptional()
  @IsEnum(TubeType)
  tubeType?: TubeType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderTestDto)
  tests: CreateOrderTestDto[];
}

export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @IsEnum(PatientType)
  patientType?: PatientType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSampleDto)
  samples: CreateSampleDto[];
}
