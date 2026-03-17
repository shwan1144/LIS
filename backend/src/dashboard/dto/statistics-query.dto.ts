import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const STATISTICS_SOURCE_TYPES = ['ALL', 'IN_HOUSE', 'SUB_LAB'] as const;
export type StatisticsSourceTypeQuery = (typeof STATISTICS_SOURCE_TYPES)[number];

export class StatisticsQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @IsIn(STATISTICS_SOURCE_TYPES)
  sourceType?: StatisticsSourceTypeQuery;
}
