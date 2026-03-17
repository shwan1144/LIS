export declare class FileStorageService {
    private readonly logger;
    private readonly client;
    private readonly bucket;
    private readonly configured;
    constructor();
    isConfigured(): boolean;
    private getClientOrThrow;
    uploadFile(key: string, body: Buffer, contentType: string): Promise<string>;
    deleteFile(key: string): Promise<void>;
    getFile(key: string): Promise<Buffer>;
}
