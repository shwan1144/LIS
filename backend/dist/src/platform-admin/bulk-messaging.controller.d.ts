import { BulkMessagingService } from './bulk-messaging.service';
interface RequestWithPlatformUser {
    user: {
        platformUserId: string;
        role: string;
    };
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
}
export declare class BulkMessagingController {
    private readonly bulkMessagingService;
    constructor(bulkMessagingService: BulkMessagingService);
    getLabConfig(labId: string): Promise<{
        labId: string;
        channels: Record<string, {
            enabled: boolean;
            webhookUrl: string | null;
            hasAuthToken: boolean;
            senderLabel: string | null;
            timeoutMs: number;
            maxRetries: number;
            updatedAt: string | null;
        }>;
    }>;
    updateLabConfig(req: RequestWithPlatformUser, labId: string, body: {
        channels?: Record<string, unknown>;
    }): Promise<{
        labId: string;
        channels: Record<string, {
            enabled: boolean;
            webhookUrl: string | null;
            hasAuthToken: boolean;
            senderLabel: string | null;
            timeoutMs: number;
            maxRetries: number;
            updatedAt: string | null;
        }>;
    }>;
    getLabTemplates(labId: string): Promise<{
        labId: string;
        templates: Record<string, {
            templateText: string;
            updatedAt: string | null;
        }>;
    }>;
    updateLabTemplates(req: RequestWithPlatformUser, labId: string, body: {
        templates?: Record<string, string | null | undefined>;
    }): Promise<{
        labId: string;
        templates: Record<string, {
            templateText: string;
            updatedAt: string | null;
        }>;
    }>;
    preview(body: {
        labId: string;
        status?: string;
        q?: string;
        dateFrom?: string;
        dateTo?: string;
        excludedPhones?: string[] | string;
    }): Promise<{
        matchedOrdersCount: number;
        phonesWithValueCount: number;
        phonesWithoutValueCount: number;
        uniquePhonesCount: number;
        excludedCount: number;
        finalSendCount: number;
        maxBatchUniquePhones: number;
    }>;
    send(req: RequestWithPlatformUser, body: {
        labId: string;
        status?: string;
        q?: string;
        dateFrom?: string;
        dateTo?: string;
        excludedPhones?: string[] | string;
        channels: string[];
        templateOverrides?: Record<string, string | null | undefined>;
    }): Promise<{
        batchId: string;
        queuedRecipientsCount: number;
        uniquePhonesCount: number;
        channels: import("../entities/marketing-message.entity").MarketingChannel[];
    }>;
    listJobs(labId?: string, status?: string, dateFrom?: string, dateTo?: string, page?: string, size?: string): Promise<{
        items: Array<{
            id: string;
            labId: string;
            status: import("../entities/marketing-message.entity").MarketingMessageBatchStatus;
            channels: import("../entities/marketing-message.entity").MarketingChannel[];
            requestedRecipientsCount: number;
            sentCount: number;
            failedCount: number;
            skippedCount: number;
            startedAt: string | null;
            completedAt: string | null;
            createdAt: string;
            errorMessage: string | null;
        }>;
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getJobDetail(batchId: string, status?: string, channel?: string, page?: string, size?: string): Promise<{
        batch: {
            id: string;
            labId: string;
            status: import("../entities/marketing-message.entity").MarketingMessageBatchStatus;
            channels: import("../entities/marketing-message.entity").MarketingChannel[];
            scope: Record<string, unknown>;
            excludedPhones: string[];
            requestedRecipientsCount: number;
            sentCount: number;
            failedCount: number;
            skippedCount: number;
            startedAt: string | null;
            completedAt: string | null;
            createdAt: string;
            errorMessage: string | null;
        };
        recipients: {
            items: Array<{
                id: string;
                channel: import("../entities/marketing-message.entity").MarketingChannel;
                status: import("../entities/marketing-message.entity").MarketingMessageRecipientStatus;
                recipientName: string | null;
                recipientPhoneRaw: string | null;
                recipientPhoneNormalized: string;
                attemptCount: number;
                sentAt: string | null;
                errorMessage: string | null;
                orderId: string | null;
                patientId: string | null;
            }>;
            total: number;
            page: number;
            size: number;
            totalPages: number;
        };
    }>;
    private getActorContext;
}
export {};
