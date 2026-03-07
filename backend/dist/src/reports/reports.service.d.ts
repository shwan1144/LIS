import { type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { User } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';
import type { ReportStyleConfig } from './report-style.config';
export interface PublicResultTestItem {
    orderTestId: string;
    testCode: string;
    testName: string;
    departmentName: string;
    status: string;
    isVerified: boolean;
    hasResult: boolean;
    resultValue: string | null;
    unit: string | null;
    verifiedAt: string | null;
}
export interface PublicResultStatus {
    orderId: string;
    orderNumber: string;
    patientName: string;
    labName: string;
    onlineResultWatermarkDataUrl: string | null;
    onlineResultWatermarkText: string | null;
    registeredAt: string;
    paymentStatus: string;
    reportableCount: number;
    verifiedCount: number;
    progressPercent: number;
    ready: boolean;
    verifiedAt: string | null;
    tests: PublicResultTestItem[];
}
export type ReportActionKind = 'PDF' | 'PRINT' | 'WHATSAPP' | 'VIBER';
export type ReportActionFlags = {
    pdf: boolean;
    print: boolean;
    whatsapp: boolean;
    viber: boolean;
    timestamps: {
        pdf: string | null;
        print: string | null;
        whatsapp: string | null;
        viber: string | null;
    };
};
export type ReportBrandingOverride = {
    bannerDataUrl?: string | null;
    footerDataUrl?: string | null;
    logoDataUrl?: string | null;
    watermarkDataUrl?: string | null;
};
export declare class ReportsService implements OnModuleInit, OnModuleDestroy {
    private readonly orderRepo;
    private readonly orderTestRepo;
    private readonly patientRepo;
    private readonly labRepo;
    private readonly userRepo;
    private readonly auditLogRepo;
    private readonly logger;
    private browserPromise;
    private readonly pdfCache;
    private readonly pdfInFlight;
    private readonly pdfCacheTtlMs;
    private readonly pdfCacheMaxEntries;
    private readonly pdfPerfLogThresholdMs;
    private static cachedFont;
    constructor(orderRepo: Repository<Order>, orderTestRepo: Repository<OrderTest>, patientRepo: Repository<Patient>, labRepo: Repository<Lab>, userRepo: Repository<User>, auditLogRepo: Repository<AuditLog>);
    private parseEnvInt;
    onModuleInit(): void;
    private getBrowser;
    private renderPdfFromHtml;
    onModuleDestroy(): Promise<void>;
    private buildReportPdfCacheKey;
    private normalizeAbsoluteUrlBase;
    private resolvePublicResultsBaseUrl;
    private resolveOrderQrValue;
    private generateOrderQrDataUrl;
    private getCachedPdf;
    private setCachedPdf;
    private logResultsPdfPerformance;
    ensureOrderBelongsToLab(orderId: string, labId: string): Promise<void>;
    getOrderActionFlags(labId: string, orderIds: string[]): Promise<Record<string, ReportActionFlags>>;
    private resolveReportActionKindFromAudit;
    private decodeImageDataUrl;
    private applyReportDesignOverride;
    private applyFallbackPageBranding;
    private getReportableOrderTests;
    private classifyOrderTestsForReport;
    private isOrderTestResultEntered;
    private assertAllResultsEnteredForReport;
    private loadOrderResultsSnapshot;
    getPublicResultStatus(orderId: string): Promise<PublicResultStatus>;
    generatePublicTestResultsPDF(orderId: string): Promise<Buffer>;
    generateDraftTestResultsPreviewPDF(input: {
        orderId: string;
        labId: string;
        reportBranding: ReportBrandingOverride;
        reportStyle: ReportStyleConfig;
    }): Promise<Buffer>;
    generateOrderReceiptPDF(orderId: string, labId: string): Promise<Buffer>;
    generateTestResultsPDF(orderId: string, labId: string, options?: {
        bypassPaymentCheck?: boolean;
        bypassResultCompletionCheck?: boolean;
        disableCache?: boolean;
        reportDesignOverride?: {
            reportBranding?: ReportBrandingOverride;
            reportStyle?: ReportStyleConfig | null;
        };
    }): Promise<Buffer>;
    private renderTestResultsFallbackPDF;
}
