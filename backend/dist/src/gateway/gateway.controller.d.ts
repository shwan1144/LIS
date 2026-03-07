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
