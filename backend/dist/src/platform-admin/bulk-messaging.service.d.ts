import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { RlsSessionService } from '../database/rls-session.service';
import { Lab } from '../entities/lab.entity';
import { LabMarketingTemplate, LabMessagingChannelConfig, MarketingChannel, MarketingMessageBatch, MarketingMessageBatchStatus, MarketingMessageRecipient, MarketingMessageRecipientStatus } from '../entities/marketing-message.entity';
import { Order } from '../entities/order.entity';
export interface PlatformActorContext {
    platformUserId: string;
    role: string;
    ipAddress?: string | null;
    userAgent?: string | null;
}
export interface BulkMessagingFilterInput {
    labId: string;
    status?: string | null;
    q?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
}
export interface BulkMessagingPreviewInput extends BulkMessagingFilterInput {
    excludedPhones?: string[] | string | null;
}
export interface BulkMessagingSendInput extends BulkMessagingPreviewInput {
    channels: string[];
    templateOverrides?: Record<string, string | null | undefined> | null;
}
export interface BulkMessagingJobListInput {
    labId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    size?: number;
}
export interface BulkMessagingJobDetailInput {
    page?: number;
    size?: number;
    status?: string;
    channel?: string;
}
export declare class BulkMessagingService implements OnModuleInit, OnModuleDestroy {
    private readonly labRepo;
    private readonly orderRepo;
    private readonly channelConfigRepo;
    private readonly templateRepo;
    private readonly batchRepo;
    private readonly recipientRepo;
    private readonly rlsSessionService;
    private readonly auditService;
    private readonly logger;
    private readonly pollIntervalMs;
    private readonly staleRunningMs;
    private readonly maxBatchUniquePhones;
    private pollTimer;
    private polling;
    constructor(labRepo: Repository<Lab>, orderRepo: Repository<Order>, channelConfigRepo: Repository<LabMessagingChannelConfig>, templateRepo: Repository<LabMarketingTemplate>, batchRepo: Repository<MarketingMessageBatch>, recipientRepo: Repository<MarketingMessageRecipient>, rlsSessionService: RlsSessionService, auditService: AuditService);
    onModuleInit(): void;
    onModuleDestroy(): void;
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
    updateLabConfig(labId: string, body: {
        channels?: Record<string, unknown>;
    }, actor?: PlatformActorContext): Promise<{
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
    updateLabTemplates(labId: string, body: {
        templates?: Record<string, string | null | undefined>;
    }, actor?: PlatformActorContext): Promise<{
        labId: string;
        templates: Record<string, {
            templateText: string;
            updatedAt: string | null;
        }>;
    }>;
    preview(input: BulkMessagingPreviewInput): Promise<{
        matchedOrdersCount: number;
        phonesWithValueCount: number;
        phonesWithoutValueCount: number;
        uniquePhonesCount: number;
        excludedCount: number;
        finalSendCount: number;
        maxBatchUniquePhones: number;
    }>;
    send(input: BulkMessagingSendInput, actor?: PlatformActorContext): Promise<{
        batchId: string;
        queuedRecipientsCount: number;
        uniquePhonesCount: number;
        channels: MarketingChannel[];
    }>;
    listJobs(input: BulkMessagingJobListInput): Promise<{
        items: Array<{
            id: string;
            labId: string;
            status: MarketingMessageBatchStatus;
            channels: MarketingChannel[];
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
    getJobDetail(batchId: string, input?: BulkMessagingJobDetailInput): Promise<{
        batch: {
            id: string;
            labId: string;
            status: MarketingMessageBatchStatus;
            channels: MarketingChannel[];
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
                channel: MarketingChannel;
                status: MarketingMessageRecipientStatus;
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
    private triggerImmediatePoll;
    private pollQueue;
    private requeueStaleRunningBatches;
    private claimNextBatch;
    private processBatch;
    private flushRecipientUpdates;
    private finalizeBatchState;
    private sendWithRetry;
    private postToWebhook;
    private resolveScopedRecipients;
    private renderTemplate;
    private normalizeFilters;
    private normalizeConfigPatches;
    private normalizeTemplateUpdates;
    private normalizeTemplateOverrideMap;
    private normalizeExcludedPhones;
    private normalizePhoneDigits;
    private normalizeChannel;
    private normalizeOptionalChannel;
    private normalizeChannelArray;
    private normalizeOptionalDate;
    private normalizeOptionalUuid;
    private normalizeOptionalOrderStatus;
    private normalizeOptionalBatchStatus;
    private normalizeOptionalRecipientStatus;
    private normalizeWebhookUrl;
    private normalizeOptionalText;
    private normalizeInteger;
    private clampInteger;
    private requireUuid;
    private ensureLabExists;
    private toConfigResponse;
    private toTemplatesResponse;
    private toRecord;
    private delay;
}
