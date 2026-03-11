import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConnectionType, Instrument, InstrumentProtocol } from '../entities/instrument.entity';
import { Lab } from '../entities/lab.entity';
import { GatewayActivationCode, GatewayDevice, GatewayMessageReceipt, GatewayToken } from '../entities/gateway.entity';
import { AuthService } from '../auth/auth.service';
import { InstrumentsService } from '../instruments/instruments.service';
import type { LoginResponseDto } from '../auth/dto/login-response.dto';
import type { ActivateGatewayDto } from './dto/activate-gateway.dto';
import type { RefreshGatewayTokenDto } from './dto/refresh-gateway-token.dto';
import type { GatewayMessageDto } from './dto/gateway-message.dto';
import type { GatewayHeartbeatDto } from './dto/gateway-heartbeat.dto';
import type { CreateGatewayActivationCodeDto } from './dto/create-gateway-activation-code.dto';
import type { GatewayUiLoginDto } from './dto/gateway-ui-login.dto';
import type { GatewayUiRefreshDto } from './dto/gateway-ui-refresh.dto';
interface GatewayAuthContext {
    gatewayId: string;
    labId: string;
}
type GatewayConfigInstrument = {
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
} | {
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
export declare class GatewayService {
    private readonly gatewayRepo;
    private readonly activationCodeRepo;
    private readonly gatewayTokenRepo;
    private readonly receiptRepo;
    private readonly instrumentRepo;
    private readonly labRepo;
    private readonly jwtService;
    private readonly authService;
    private readonly instrumentsService;
    constructor(gatewayRepo: Repository<GatewayDevice>, activationCodeRepo: Repository<GatewayActivationCode>, gatewayTokenRepo: Repository<GatewayToken>, receiptRepo: Repository<GatewayMessageReceipt>, instrumentRepo: Repository<Instrument>, labRepo: Repository<Lab>, jwtService: JwtService, authService: AuthService, instrumentsService: InstrumentsService);
    gatewayUiLogin(dto: GatewayUiLoginDto, meta?: {
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<LoginResponseDto>;
    gatewayUiRefresh(dto: GatewayUiRefreshDto, meta?: {
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<LoginResponseDto>;
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
        instruments: GatewayConfigInstrument[];
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
