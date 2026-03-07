import { GatewayService } from './gateway.service';
import { ActivateGatewayDto } from './dto/activate-gateway.dto';
import { RefreshGatewayTokenDto } from './dto/refresh-gateway-token.dto';
import { GatewayMessageDto } from './dto/gateway-message.dto';
import { GatewayHeartbeatDto } from './dto/gateway-heartbeat.dto';
interface RequestWithGatewayAuth {
    user: {
        gatewayId: string;
        labId: string;
        scope: string[];
    };
}
export declare class GatewayController {
    private readonly gatewayService;
    constructor(gatewayService: GatewayService);
    activate(dto: ActivateGatewayDto): Promise<{
        gatewayId: string;
        accessToken: string;
        refreshToken: string;
        expiresInSec: number;
    }>;
    refreshToken(dto: RefreshGatewayTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresInSec: number;
    }>;
    getConfig(req: RequestWithGatewayAuth): Promise<{
        gatewayId: string;
        pollIntervalSec: number;
        heartbeatIntervalSec: number;
        instruments: ({
            instrumentId: string;
            name: string;
            protocol: import("../entities/instrument.entity").InstrumentProtocol.HL7_V2;
            connectionType: import("../entities/instrument.entity").ConnectionType.TCP_SERVER;
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
            protocol: import("../entities/instrument.entity").InstrumentProtocol.ASTM;
            connectionType: import("../entities/instrument.entity").ConnectionType.SERIAL;
            enabled: boolean;
            serialPort: string;
            baudRate: number;
            dataBits: string;
            parity: string;
            stopBits: string;
            port?: undefined;
            hl7StartBlock?: undefined;
            hl7EndBlock?: undefined;
        })[];
    }>;
    ingestMessage(req: RequestWithGatewayAuth, dto: GatewayMessageDto): Promise<{
        accepted: true;
        serverMessageId?: string;
        duplicate: boolean;
    }>;
    heartbeat(req: RequestWithGatewayAuth, dto: GatewayHeartbeatDto): Promise<{
        accepted: true;
        serverTime: string;
    }>;
}
export {};
