import { QzSigningService } from './qz-signing.service';
type QzSignBody = {
    payload?: string;
};
export declare class PrintingController {
    private readonly qzSigningService;
    constructor(qzSigningService: QzSigningService);
    getCertificate(): {
        certificate: string;
        algorithm: string;
    };
    signPayload(body: QzSignBody): {
        signature: string;
        algorithm: string;
    };
}
export {};
