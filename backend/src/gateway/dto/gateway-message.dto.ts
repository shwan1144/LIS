import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class GatewaySourceMetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  remoteAddress?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  remotePort?: number;
}

export class GatewayMessageDto {
  @IsUUID()
  gatewayId: string;

  @IsString()
  @Length(1, 128)
  localMessageId: string;

  @IsUUID()
  instrumentId: string;

  @IsISO8601()
  receivedAt: string;

  @IsString()
  @Length(1, 2000000)
  rawMessage: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  protocolHint?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GatewaySourceMetaDto)
  sourceMeta?: GatewaySourceMetaDto;
}
