import { Lab } from './lab.entity';
import { Instrument } from './instrument.entity';
export declare enum GatewayDeviceStatus {
    ACTIVE = "ACTIVE",
    AUTH_ERROR = "AUTH_ERROR",
    ERROR = "ERROR",
    DISABLED = "DISABLED"
}
export declare class GatewayDevice {
    id: string;
    labId: string;
    name: string;
    fingerprintHash: string;
    status: GatewayDeviceStatus;
    version: string | null;
    lastSeenAt: Date | null;
    lastHeartbeat: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
    lab: Lab;
}
export declare class GatewayActivationCode {
    id: string;
    labId: string;
    codeHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    lab: Lab;
}
export declare class GatewayToken {
    id: string;
    gatewayId: string;
    refreshHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    gateway: GatewayDevice;
}
export declare class GatewayMessageReceipt {
    id: string;
    gatewayId: string;
    localMessageId: string;
    instrumentId: string;
    serverMessageId: string | null;
    receivedAt: Date;
    gateway: GatewayDevice;
    instrument: Instrument;
}
