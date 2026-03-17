export declare class FileStorageService {
    private readonly logger;
    private readonly client;
    private readonly bucket;
    constructor();
    uploadFile(key: string, body: Buffer, contentType: string): Promise<string>;
    deleteFile(key: string): Promise<void>;
    getFile(key: string): Promise<Buffer>;
}
