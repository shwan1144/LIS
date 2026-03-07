import { GatewayService } from './gateway.service';
import { CreateGatewayActivationCodeDto } from './dto/create-gateway-activation-code.dto';
export declare class GatewayAdminController {
    private readonly gatewayService;
    constructor(gatewayService: GatewayService);
    createActivationCode(dto: CreateGatewayActivationCodeDto): Promise<{
        activationCode: string;
        expiresAt: string;
        labId: string;
    }>;
}
