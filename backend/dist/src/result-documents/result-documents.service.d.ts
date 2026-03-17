type StoredResultDocument = {
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
};
export declare class ResultDocumentsService {
    private readonly storageDir;
    private readonly maxBytes;
    getMaxBytes(): number;
    savePdf(params: {
        labId: string;
        orderTestId: string;
        buffer: Buffer;
        originalName: string;
        mimeType?: string | null;
        previousStorageKey?: string | null;
    }): Promise<StoredResultDocument>;
    deleteDocument(storageKey: string | null | undefined): Promise<void>;
    readDocument(storageKey: string | null | undefined): Promise<Buffer>;
    private resolveStorageDir;
    private resolveMaxBytes;
    private assertPdfUpload;
    private normalizeFileName;
    private resolvePath;
}
export {};
