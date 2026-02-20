import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuditAction, AuditActorType } from '../../entities/audit-log.entity';

export class ExportAuditLogsDto {
  @IsOptional()
  @IsUUID()
  labId?: string;

  @IsOptional()
  @IsEnum(AuditActorType)
  actorType?: AuditActorType;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  maxRows?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
