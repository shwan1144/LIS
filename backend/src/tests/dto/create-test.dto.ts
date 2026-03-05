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
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TestType, TubeType } from '../../entities/test.entity';

export const TEST_RESULT_ENTRY_TYPES = ['NUMERIC', 'QUALITATIVE', 'TEXT'] as const;
export const TEST_RESULT_FLAGS = ['N', 'H', 'L', 'HH', 'LL', 'POS', 'NEG', 'ABN'] as const;

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

export class TestNumericAgeRangeDto {
  @IsIn(['ANY', 'M', 'F'])
  sex: 'ANY' | 'M' | 'F';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAgeYears?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAgeYears?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  normalMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  normalMax?: number | null;
}

export class TestResultTextOptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  value: string;

  @IsOptional()
  @IsIn(TEST_RESULT_FLAGS)
  flag?: (typeof TEST_RESULT_FLAGS)[number] | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class TestPanelComponentDto {
  @IsUUID()
  childTestId: string;

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  reportSection?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  reportGroup?: string | null;
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

  @IsString()
  @MaxLength(32)
  @IsOptional()
  abbreviation?: string;

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
  @Type(() => Number)
  normalMin?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  normalMax?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  normalMinMale?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  normalMaxMale?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  normalMinFemale?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  normalMaxFemale?: number;

  @IsString()
  @IsOptional()
  normalText?: string;

  @IsOptional()
  @IsIn(TEST_RESULT_ENTRY_TYPES)
  resultEntryType?: (typeof TEST_RESULT_ENTRY_TYPES)[number];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestResultTextOptionDto)
  resultTextOptions?: TestResultTextOptionDto[] | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestPanelComponentDto)
  panelComponents?: TestPanelComponentDto[] | null;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  panelComponentTestIds?: string[] | null;

  @IsBoolean()
  @IsOptional()
  allowCustomResultText?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestNumericAgeRangeDto)
  numericAgeRanges?: TestNumericAgeRangeDto[];

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
  @Type(() => Number)
  sortOrder?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  expectedCompletionMinutes?: number | null;
}
