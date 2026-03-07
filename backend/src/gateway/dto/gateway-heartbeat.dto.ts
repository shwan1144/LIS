import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class HeartbeatListenerDto {
  @IsUUID()
  instrumentId: string;

  @IsString()
  @MaxLength(32)
  state: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  lastError?: string | null;
}

export class GatewayHeartbeatDto {
  @IsUUID()
  gatewayId: string;

  @IsString()
  @MaxLength(32)
  version: string;

  @IsInt()
  @Min(0)
  queueDepth: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeartbeatListenerDto)
  listeners: HeartbeatListenerDto[];
}
