export declare class QzSigningService {
    getCertificate(): string;
    getSignatureAlgorithm(): string;
    signPayload(payload: string): string;
    private loadConfig;
    private readPemValue;
    private normalizeOptionalValue;
}
