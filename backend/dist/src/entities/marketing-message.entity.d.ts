import { Lab } from './lab.entity';
import { PlatformUser } from './platform-user.entity';
import { Order } from './order.entity';
import { Patient } from './patient.entity';
export declare enum MarketingChannel {
    WHATSAPP = "WHATSAPP",
    VIBER = "VIBER",
    SMS = "SMS"
}
export declare enum MarketingMessageBatchStatus {
    QUEUED = "QUEUED",
    RUNNING = "RUNNING",
    COMPLETED = "COMPLETED",
    COMPLETED_WITH_ERRORS = "COMPLETED_WITH_ERRORS",
    FAILED = "FAILED"
}
export declare enum MarketingMessageRecipientStatus {
    PENDING = "PENDING",
    SENT = "SENT",
    FAILED = "FAILED",
    SKIPPED = "SKIPPED"
}
export declare class LabMessagingChannelConfig {
    id: string;
    labId: string;
    channel: MarketingChannel;
    enabled: boolean;
    webhookUrl: string | null;
    authToken: string | null;
    senderLabel: string | null;
    timeoutMs: number;
    maxRetries: number;
    createdAt: Date;
    updatedAt: Date;
    lab: Lab;
}
export declare class LabMarketingTemplate {
    id: string;
    labId: string;
    channel: MarketingChannel;
    templateText: string;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    lab: Lab;
    updatedByUser: PlatformUser | null;
}
export declare class MarketingMessageBatch {
    id: string;
    labId: string;
    createdBy: string | null;
    status: MarketingMessageBatchStatus;
    channels: MarketingChannel[];
    scope: Record<string, unknown>;
    excludedPhones: string[];
    requestedRecipientsCount: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    startedAt: Date | null;
    completedAt: Date | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    lab: Lab;
    createdByUser: PlatformUser | null;
    recipients: MarketingMessageRecipient[];
}
export declare class MarketingMessageRecipient {
    id: string;
    batchId: string;
    labId: string;
    channel: MarketingChannel;
    status: MarketingMessageRecipientStatus;
    orderId: string | null;
    patientId: string | null;
    recipientName: string | null;
    recipientPhoneRaw: string | null;
    recipientPhoneNormalized: string;
    messageText: string;
    attemptCount: number;
    lastAttemptAt: Date | null;
    sentAt: Date | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    batch: MarketingMessageBatch;
    lab: Lab;
    order: Order | null;
    patient: Patient | null;
}
