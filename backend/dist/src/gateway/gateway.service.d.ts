import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Instrument } from '../entities/instrument.entity';
import { Lab } from '../entities/lab.entity';
import { GatewayActivationCode, GatewayDevice, GatewayMessageReceipt, GatewayToken } from '../entities/gateway.entity';
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
export declare class GatewayService {
    private readonly gatewayRepo;
    private readonly activationCodeRepo;
    private readonly gatewayTokenRepo;
    private readonly receiptRepo;
    private readonly instrumentRepo;
    private readonly labRepo;
    private readonly jwtService;
    private readonly instrumentsService;
    constructor(gatewayRepo: Repository<GatewayDevice>, activationCodeRepo: Repository<GatewayActivationCode>, gatewayTokenRepo: Repository<GatewayToken>, receiptRepo: Repository<GatewayMessageReceipt>, instrumentRepo: Repository<Instrument>, labRepo: Repository<Lab>, jwtService: JwtService, instrumentsService: InstrumentsService);
    createActivationCode(dto: CreateGatewayActivationCodeDto): Promise<{
        activationCode: string;
        expiresAt: string;
        labId: string;
    }>;
    activateGateway(dto: ActivateGatewayDto): Promise<{
        gatewayId: string;
        accessToken: string;
        refreshToken: string;
        expiresInSec: number;
    }>;
    refreshGatewayToken(dto: RefreshGatewayTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresInSec: number;
    }>;
    getGatewayConfig(auth: GatewayAuthContext): Promise<{
        gatewayId: string;
        pollIntervalSec: number;
        heartbeatIntervalSec: number;
        instruments: Array<{
            instrumentId: string;
            name: string;
            protocol: string;
            connectionType: string;
            port: number;
            hl7StartBlock: string;
            hl7EndBlock: string;
            enabled: boolean;
        }>;
    }>;
    ingestGatewayMessage(auth: GatewayAuthContext, dto: GatewayMessageDto): Promise<{
        accepted: true;
        serverMessageId?: string;
        duplicate: boolean;
    }>;
    recordHeartbeat(auth: GatewayAuthContext, dto: GatewayHeartbeatDto): Promise<{
        accepted: true;
        serverTime: string;
    }>;
    private assertGatewayContext;
    private assertGateway;
    private issueGatewayTokens;
    private issueRefreshToken;
    private parseRefreshToken;
    private generateActivationCode;
    private hashActivationCode;
    private hashFingerprint;
    private safeParseDate;
    private getAccessTtlSeconds;
    private getRefreshTtlDays;
    private getDefaultActivationCodeTtlMinutes;
    private getConfigPollIntervalSec;
    private getHeartbeatIntervalSec;
}
export {};
