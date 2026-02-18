import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsUUID,
  IsArray,
  IsIn,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TestType, TubeType } from '../../entities/test.entity';

export class TestParameterDefinitionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  label: string;

  @IsIn(['select', 'text'])
  type: 'select' | 'text';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  normalOptions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  defaultValue?: string;
}

export class CreateTestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsEnum(TestType)
  @IsOptional()
  type?: TestType;

  @IsEnum(TubeType)
  @IsOptional()
  tubeType?: TubeType;

  @IsString()
  @MaxLength(32)
  @IsOptional()
  unit?: string;

  @IsNumber()
  @IsOptional()
  normalMin?: number;

  @IsNumber()
  @IsOptional()
  normalMax?: number;

  @IsNumber()
  @IsOptional()
  normalMinMale?: number;

  @IsNumber()
  @IsOptional()
  normalMaxMale?: number;

  @IsNumber()
  @IsOptional()
  normalMinFemale?: number;

  @IsNumber()
  @IsOptional()
  normalMaxFemale?: number;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  normalText?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  childTestIds?: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  category?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestParameterDefinitionDto)
  parameterDefinitions?: TestParameterDefinitionDto[];

  @IsUUID()
  @IsOptional()
  departmentId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsNumber()
  @IsOptional()
  expectedCompletionMinutes?: number | null;
}
