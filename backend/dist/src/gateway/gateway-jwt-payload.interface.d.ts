export interface GatewayJwtPayload {
    sub: string;
    labId: string;
    tokenType: 'gateway_access';
    scope?: string[];
}
