declare class GatewaySourceMetaDto {
    remoteAddress?: string;
    remotePort?: number;
}
export declare class GatewayMessageDto {
    gatewayId: string;
    localMessageId: string;
    instrumentId: string;
    receivedAt: string;
    rawMessage: string;
    protocolHint?: string;
    sourceMeta?: GatewaySourceMetaDto;
}
export {};
