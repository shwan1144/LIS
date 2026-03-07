import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, QueryFailedError } from 'typeorm';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectionType,
  Instrument,
  InstrumentProtocol,
} from '../entities/instrument.entity';
import { Lab } from '../entities/lab.entity';
import {
  GatewayActivationCode,
  GatewayDevice,
  GatewayDeviceStatus,
  GatewayMessageReceipt,
  GatewayToken,
} from '../entities/gateway.entity';
import { hashPassword, verifyPassword } from '../auth/password.util';
import { InstrumentsService } from '../instruments/instruments.service';
import type { ActivateGatewayDto } from './dto/activate-gateway.dto';
import type { RefreshGatewayTokenDto } from './dto/refresh-gateway-token.dto';
import type { GatewayMessageDto } from './dto/gateway-message.dto';
import type { GatewayHeartbeatDto } from './dto/gateway-heartbeat.dto';
import type { CreateGatewayActivationCodeDto } from './dto/create-gateway-activation-code.dto';

interface GatewayAuthContext {
  gatewayId: string;
  labId: string;
}

type GatewayConfigInstrument =
  | {
      instrumentId: string;
      name: string;
      protocol: InstrumentProtocol.HL7_V2;
      connectionType: ConnectionType.TCP_SERVER;
      enabled: boolean;
      port: number;
      hl7StartBlock: string;
      hl7EndBlock: string;
      serialPort?: undefined;
      baudRate?: undefined;
      dataBits?: undefined;
      parity?: undefined;
      stopBits?: undefined;
    }
  | {
      instrumentId: string;
      name: string;
      protocol: InstrumentProtocol.ASTM;
      connectionType: ConnectionType.SERIAL;
      enabled: boolean;
      serialPort: string;
      baudRate: number;
      dataBits: string;
      parity: string;
      stopBits: string;
      port?: undefined;
      hl7StartBlock?: undefined;
      hl7EndBlock?: undefined;
    };

@Injectable()
export class GatewayService {
  constructor(
    @InjectRepository(GatewayDevice)
    private readonly gatewayRepo: Repository<GatewayDevice>,
    @InjectRepository(GatewayActivationCode)
    private readonly activationCodeRepo: Repository<GatewayActivationCode>,
    @InjectRepository(GatewayToken)
    private readonly gatewayTokenRepo: Repository<GatewayToken>,
    @InjectRepository(GatewayMessageReceipt)
    private readonly receiptRepo: Repository<GatewayMessageReceipt>,
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
    private readonly jwtService: JwtService,
    private readonly instrumentsService: InstrumentsService,
  ) {}

  async createActivationCode(dto: CreateGatewayActivationCodeDto): Promise<{
    activationCode: string;
    expiresAt: string;
    labId: string;
  }> {
    const lab = await this.labRepo.findOne({ where: { id: dto.labId } });
    if (!lab || !lab.isActive) {
      throw new NotFoundException('Lab not found or inactive');
    }

    const activationCode = this.generateActivationCode();
    const now = Date.now();
    const ttlMinutes = Number.isFinite(dto.expiresInMinutes)
      ? dto.expiresInMinutes!
      : this.getDefaultActivationCodeTtlMinutes();
    const expiresAt = new Date(now + ttlMinutes * 60 * 1000);

    const code = this.activationCodeRepo.create({
      id: randomUUID(),
      labId: dto.labId,
      codeHash: this.hashActivationCode(activationCode),
      expiresAt,
      usedAt: null,
      revokedAt: null,
    });
    await this.activationCodeRepo.save(code);

    return {
      activationCode,
      expiresAt: expiresAt.toISOString(),
      labId: dto.labId,
    };
  }

  async activateGateway(dto: ActivateGatewayDto): Promise<{
    gatewayId: string;
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  }> {
    const activation = await this.activationCodeRepo.findOne({
      where: { codeHash: this.hashActivationCode(dto.activationCode.trim()) },
    });
    if (!activation) {
      throw new UnauthorizedException('Invalid activation code');
    }

    const now = new Date();
    if (activation.revokedAt) {
      throw new UnauthorizedException('Activation code is revoked');
    }
    if (activation.usedAt) {
      throw new UnauthorizedException('Activation code already used');
    }
    if (activation.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('Activation code expired');
    }

    const fingerprintHash = this.hashFingerprint(dto.machineFingerprint);
    let gateway = await this.gatewayRepo.findOne({
      where: { labId: activation.labId, fingerprintHash },
    });

    if (!gateway) {
      gateway = this.gatewayRepo.create({
        id: randomUUID(),
        labId: activation.labId,
        name: dto.deviceName.trim(),
        fingerprintHash,
        status: GatewayDeviceStatus.ACTIVE,
        version: dto.gatewayVersion?.trim() || null,
        lastSeenAt: now,
        lastHeartbeat: null,
      });
    } else {
      gateway.name = dto.deviceName.trim();
      gateway.version = dto.gatewayVersion?.trim() || gateway.version;
      gateway.status = GatewayDeviceStatus.ACTIVE;
      gateway.lastSeenAt = now;
    }

    await this.gatewayRepo.save(gateway);
    activation.usedAt = now;
    await this.activationCodeRepo.save(activation);

    const tokenPair = await this.issueGatewayTokens(gateway.id, gateway.labId);
    return {
      gatewayId: gateway.id,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresInSec: this.getAccessTtlSeconds(),
    };
  }

  async refreshGatewayToken(dto: RefreshGatewayTokenDto): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  }> {
    const gateway = await this.gatewayRepo.findOne({ where: { id: dto.gatewayId } });
    if (!gateway || gateway.status === GatewayDeviceStatus.DISABLED) {
      throw new UnauthorizedException('Gateway not found or disabled');
    }

    const { tokenId, tokenSecret } = this.parseRefreshToken(dto.refreshToken);
    const existingToken = await this.gatewayTokenRepo.findOne({
      where: { id: tokenId, gatewayId: gateway.id },
    });
    if (!existingToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (existingToken.revokedAt) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    if (existingToken.expiresAt.getTime() <= Date.now()) {
      existingToken.revokedAt = new Date();
      await this.gatewayTokenRepo.save(existingToken);
      throw new UnauthorizedException('Refresh token expired');
    }

    const valid = await verifyPassword(tokenSecret, existingToken.refreshHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    existingToken.revokedAt = new Date();
    await this.gatewayTokenRepo.save(existingToken);

    const tokenPair = await this.issueGatewayTokens(gateway.id, gateway.labId);
    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresInSec: this.getAccessTtlSeconds(),
    };
  }

  async getGatewayConfig(auth: GatewayAuthContext): Promise<{
    gatewayId: string;
    pollIntervalSec: number;
    heartbeatIntervalSec: number;
    instruments: GatewayConfigInstrument[];
  }> {
    await this.assertGateway(auth);

    const instruments = await this.instrumentRepo.find({
      where: {
        labId: auth.labId,
        isActive: true,
      },
      order: { code: 'ASC' },
    });

    const mappedInstruments: GatewayConfigInstrument[] = [];
    for (const item of instruments) {
      const isHl7Tcp =
        item.protocol === InstrumentProtocol.HL7_V2 &&
        item.connectionType === ConnectionType.TCP_SERVER &&
        Number.isFinite(item.port) &&
        item.port != null;
      if (isHl7Tcp) {
        mappedInstruments.push({
          instrumentId: item.id,
          name: item.name,
          protocol: InstrumentProtocol.HL7_V2,
          connectionType: ConnectionType.TCP_SERVER,
          enabled: item.isActive !== false,
          port: item.port as number,
          hl7StartBlock: item.hl7StartBlock || '\u000b',
          hl7EndBlock: item.hl7EndBlock || '\u001c\r',
        });
        continue;
      }

      const isAstmSerial =
        item.protocol === InstrumentProtocol.ASTM &&
        item.connectionType === ConnectionType.SERIAL &&
        Boolean(item.serialPort?.trim()) &&
        Number.isFinite(item.baudRate) &&
        item.baudRate != null &&
        Boolean(item.dataBits?.trim()) &&
        Boolean(item.parity?.trim()) &&
        Boolean(item.stopBits?.trim());
      if (isAstmSerial) {
        mappedInstruments.push({
          instrumentId: item.id,
          name: item.name,
          protocol: InstrumentProtocol.ASTM,
          connectionType: ConnectionType.SERIAL,
          enabled: item.isActive !== false,
          serialPort: item.serialPort as string,
          baudRate: item.baudRate as number,
          dataBits: item.dataBits as string,
          parity: item.parity as string,
          stopBits: item.stopBits as string,
        });
      }
    }

    return {
      gatewayId: auth.gatewayId,
      pollIntervalSec: this.getConfigPollIntervalSec(),
      heartbeatIntervalSec: this.getHeartbeatIntervalSec(),
      instruments: mappedInstruments,
    };
  }

  async ingestGatewayMessage(
    auth: GatewayAuthContext,
    dto: GatewayMessageDto,
  ): Promise<{ accepted: true; serverMessageId?: string; duplicate: boolean }> {
    this.assertGatewayContext(auth, dto.gatewayId);

    const instrument = await this.instrumentRepo.findOne({
      where: { id: dto.instrumentId, labId: auth.labId },
    });
    if (!instrument) {
      throw new NotFoundException('Instrument not found for this gateway lab');
    }

    const existing = await this.receiptRepo.findOne({
      where: { gatewayId: auth.gatewayId, localMessageId: dto.localMessageId.trim() },
    });
    if (existing) {
      return {
        accepted: true,
        serverMessageId: existing.serverMessageId ?? undefined,
        duplicate: true,
      };
    }

    const result = await this.instrumentsService.simulateMessage(instrument.id, auth.labId, {
      rawMessage: dto.rawMessage,
      localMessageId: dto.localMessageId.trim(),
      gatewayId: auth.gatewayId,
    });

    const receipt = this.receiptRepo.create({
      id: randomUUID(),
      gatewayId: auth.gatewayId,
      localMessageId: dto.localMessageId.trim().slice(0, 128),
      instrumentId: instrument.id,
      serverMessageId: result.messageId ?? null,
      receivedAt: this.safeParseDate(dto.receivedAt) ?? new Date(),
    });

    try {
      await this.receiptRepo.save(receipt);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        typeof (error as QueryFailedError & { driverError?: { code?: string } }).driverError
          ?.code === 'string' &&
        (error as QueryFailedError & { driverError: { code: string } }).driverError.code ===
          '23505'
      ) {
        return {
          accepted: true,
          serverMessageId: result.messageId,
          duplicate: true,
        };
      }
      throw error;
    }

    return {
      accepted: true,
      serverMessageId: result.messageId,
      duplicate: Boolean(result.duplicate),
    };
  }

  async recordHeartbeat(
    auth: GatewayAuthContext,
    dto: GatewayHeartbeatDto,
  ): Promise<{ accepted: true; serverTime: string }> {
    this.assertGatewayContext(auth, dto.gatewayId);
    const gateway = await this.assertGateway(auth);
    gateway.lastSeenAt = new Date();
    gateway.version = dto.version;
    gateway.status = GatewayDeviceStatus.ACTIVE;
    gateway.lastHeartbeat = {
      queueDepth: dto.queueDepth,
      listeners: dto.listeners,
      receivedAt: new Date().toISOString(),
    };
    await this.gatewayRepo.save(gateway);

    return {
      accepted: true,
      serverTime: new Date().toISOString(),
    };
  }

  private assertGatewayContext(auth: GatewayAuthContext, requestedGatewayId: string): void {
    if (auth.gatewayId !== requestedGatewayId) {
      throw new ForbiddenException('Gateway token does not match gatewayId');
    }
  }

  private async assertGateway(auth: GatewayAuthContext): Promise<GatewayDevice> {
    const gateway = await this.gatewayRepo.findOne({
      where: {
        id: auth.gatewayId,
        labId: auth.labId,
      },
    });
    if (!gateway || gateway.status === GatewayDeviceStatus.DISABLED) {
      throw new UnauthorizedException('Gateway not authorized');
    }
    return gateway;
  }

  private async issueGatewayTokens(
    gatewayId: string,
    labId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwtService.sign(
      {
        sub: gatewayId,
        labId,
        tokenType: 'gateway_access',
        scope: ['gateway:config:read', 'gateway:message:write', 'gateway:heartbeat:write'],
      },
      {
        expiresIn: this.getAccessTtlSeconds(),
      },
    );

    const refreshToken = await this.issueRefreshToken(gatewayId);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async issueRefreshToken(gatewayId: string): Promise<string> {
    const tokenId = randomUUID();
    const secret = randomBytes(48).toString('base64url');
    const token = `${tokenId}.${secret}`;
    const refreshHash = await hashPassword(secret);
    const expiresAt = new Date(Date.now() + this.getRefreshTtlDays() * 24 * 60 * 60 * 1000);

    const tokenRecord = this.gatewayTokenRepo.create({
      id: tokenId,
      gatewayId,
      refreshHash,
      expiresAt,
      revokedAt: null,
    });

    await this.gatewayTokenRepo.save(tokenRecord);
    return token;
  }

  private parseRefreshToken(rawToken: string): { tokenId: string; tokenSecret: string } {
    const [tokenId, tokenSecret] = (rawToken || '').trim().split('.');
    if (!tokenId || !tokenSecret) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return { tokenId, tokenSecret };
  }

  private generateActivationCode(): string {
    const left = randomBytes(3).toString('hex').toUpperCase();
    const right = randomBytes(3).toString('hex').toUpperCase();
    return `GW-${left}-${right}`;
  }

  private hashActivationCode(value: string): string {
    const pepper = (process.env.GATEWAY_ACTIVATION_PEPPER || '').trim();
    return createHash('sha256')
      .update(`${pepper}:${value.trim().toUpperCase()}`)
      .digest('hex');
  }

  private hashFingerprint(value: string): string {
    return createHash('sha256').update(value.trim()).digest('hex');
  }

  private safeParseDate(input: string): Date | null {
    const ts = Date.parse(input);
    if (!Number.isFinite(ts)) return null;
    return new Date(ts);
  }

  private getAccessTtlSeconds(): number {
    const value = parseInt(process.env.GATEWAY_ACCESS_TTL_SEC || '3600', 10);
    return Number.isFinite(value) && value > 60 ? value : 3600;
  }

  private getRefreshTtlDays(): number {
    const value = parseInt(process.env.GATEWAY_REFRESH_TTL_DAYS || '30', 10);
    return Number.isFinite(value) && value > 0 ? value : 30;
  }

  private getDefaultActivationCodeTtlMinutes(): number {
    const value = parseInt(process.env.GATEWAY_ACTIVATION_TTL_MIN || '1440', 10);
    return Number.isFinite(value) && value > 0 ? value : 1440;
  }

  private getConfigPollIntervalSec(): number {
    const value = parseInt(process.env.GATEWAY_CONFIG_POLL_SEC || '60', 10);
    return Number.isFinite(value) && value >= 15 ? value : 60;
  }

  private getHeartbeatIntervalSec(): number {
    const value = parseInt(process.env.GATEWAY_HEARTBEAT_SEC || '30', 10);
    return Number.isFinite(value) && value >= 10 ? value : 30;
  }
}
