declare class HeartbeatListenerDto {
    instrumentId: string;
    state: string;
    lastError?: string | null;
}
export declare class GatewayHeartbeatDto {
    gatewayId: string;
    version: string;
    queueDepth: number;
    listeners: HeartbeatListenerDto[];
}
export {};
