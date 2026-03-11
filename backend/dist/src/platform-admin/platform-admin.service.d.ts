import { Lab } from '../entities/lab.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { RlsSessionService } from '../database/rls-session.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { SettingsService } from '../settings/settings.service';
import { User } from '../entities/user.entity';
import { Shift } from '../entities/shift.entity';
import { Department } from '../entities/department.entity';
import { AuditService } from '../audit/audit.service';
import { ReportsService } from '../reports/reports.service';
import { type ReportStyleConfig } from '../reports/report-style.config';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AuthService } from '../auth/auth.service';
export interface PlatformActorContext {
    platformUserId: string;
    role: string;
    ipAddress?: string | null;
    userAgent?: string | null;
}
export interface AdminLabListItem {
    id: string;
    code: string;
    subdomain: string | null;
    name: string;
    timezone: string;
    isActive: boolean;
    createdAt: Date;
    usersCount: number;
    orders30dCount: number;
}
export interface AdminLabSettingsSummary {
    id: string;
    code: string;
    name: string;
    reportDesignFingerprint: string;
    dashboardAnnouncementText: string | null;
    labelSequenceBy: 'tube_type' | 'department';
    sequenceResetBy: 'day' | 'shift';
    enableOnlineResults: boolean;
    hasOnlineResultWatermarkImage: boolean;
    onlineResultWatermarkText: string | null;
    printing: {
        mode: 'browser' | 'direct_gateway';
        receiptPrinterName: string | null;
        labelsPrinterName: string | null;
        reportPrinterName: string | null;
    };
    hasReportBanner: boolean;
    hasReportFooter: boolean;
    hasReportLogo: boolean;
    hasReportWatermark: boolean;
    uiTestGroups: {
        id: string;
        name: string;
        testIds: string[];
    }[];
    referringDoctors: string[];
}
export interface AdminLabSettingsUpdateResponse extends AdminLabSettingsSummary {
    reportBranding: {
        bannerDataUrl: string | null;
        footerDataUrl: string | null;
        logoDataUrl: string | null;
        watermarkDataUrl: string | null;
    };
    reportStyle: ReportStyleConfig | null;
    onlineResultWatermarkDataUrl: string | null;
}
export interface AdminLabReportDesign {
    id: string;
    code: string;
    name: string;
    reportDesignFingerprint: string;
    reportBranding: {
        bannerDataUrl: string | null;
        footerDataUrl: string | null;
        logoDataUrl: string | null;
        watermarkDataUrl: string | null;
    };
    reportStyle: ReportStyleConfig | null;
    onlineResultWatermarkDataUrl: string | null;
    onlineResultWatermarkText: string | null;
}
export interface AdminTestsTransferLabRef {
    id: string;
    code: string;
    name: string;
}
export interface AdminTestsTransferDepartmentIssue {
    testCode: string;
    departmentCode: string | null;
}
export interface AdminTestsTransferShiftPriceIssue {
    testCode: string;
    shiftCode: string | null;
}
export interface AdminLabTestsTransferResult {
    dryRun: boolean;
    sourceLab: AdminTestsTransferLabRef;
    targetLab: AdminTestsTransferLabRef;
    totalSourceTests: number;
    createCount: number;
    updateCount: number;
    pricingRowsCopied: number;
    pricingRowsSkipped: number;
    unmatchedDepartments: AdminTestsTransferDepartmentIssue[];
    unmatchedShiftPrices: AdminTestsTransferShiftPriceIssue[];
    warnings: string[];
}
export interface AdminSystemHealth {
    status: 'ok' | 'degraded';
    checkedAt: string;
    uptimeSeconds: number;
    environment: string;
    db: {
        connected: boolean;
        serverTime: string | null;
        error: string | null;
    };
}
export interface AdminPlatformSettingsOverview {
    branding: {
        logoUploadEnabled: boolean;
        themeColor: string;
    };
    securityPolicy: {
        sessionTimeoutMinutes: number;
        accessTokenLifetimeMinutes: number;
        refreshTokenLifetimeDays: number;
        passwordMinLength: number;
        requireStrongPassword: boolean;
    };
    mfa: {
        mode: 'OPTIONAL' | 'REQUIRED';
        enabledAccounts: number;
        totalAccounts: number;
    };
}
export interface AdminGlobalDashboardAnnouncement {
    dashboardAnnouncementText: string | null;
}
export interface AdminOrderListItem {
    id: string;
    labId: string;
    labCode: string | null;
    labName: string | null;
    orderNumber: string | null;
    status: OrderStatus;
    registeredAt: Date;
    patientId: string;
    patientName: string | null;
    patientPhone: string | null;
    paymentStatus: string | null;
    finalAmount: number | null;
    testsCount: number;
    verifiedTestsCount: number;
    barcode: string | null;
}
export interface AdminDashboardTrendPoint {
    date: string;
    ordersCount: number;
}
export interface AdminDashboardTopTest {
    testId: string;
    testCode: string;
    testName: string;
    ordersCount: number;
    verifiedCount: number;
}
export interface AdminDashboardLabActivity {
    labId: string;
    labCode: string;
    labName: string;
    ordersCount: number;
    totalTestsCount: number;
    verifiedTestsCount: number;
    pendingResultsCount: number;
    completionRate: number;
}
export interface AdminDashboardSummary {
    labsCount: number;
    activeLabsCount: number;
    totalPatientsCount: number;
    ordersCount: number;
    ordersTodayCount: number;
    pendingResultsCount: number;
    completedTodayCount: number;
    dateRange: {
        from: string;
        to: string;
    };
    ordersTrend: AdminDashboardTrendPoint[];
    topTests: AdminDashboardTopTest[];
    ordersByLab: AdminDashboardLabActivity[];
    alerts: {
        inactiveLabs: Array<{
            labId: string;
            labCode: string;
            labName: string;
            lastOrderAt: string | null;
            daysSinceLastOrder: number | null;
        }>;
        highPendingLabs: Array<{
            labId: string;
            labCode: string;
            labName: string;
            pendingResultsCount: number;
            totalTestsCount: number;
            pendingRate: number;
        }>;
        failedLoginsLast24h: {
            totalCount: number;
            platformCount: number;
            labCount: number;
            byLab: Array<{
                labId: string;
                labCode: string;
                labName: string;
                failedCount: number;
            }>;
        };
    };
}
export interface AdminAuditLogFilters {
    labId?: string;
    actorType?: string;
    action?: string;
    entityType?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
}
export interface AdminImpersonationStatus {
    active: boolean;
    labId: string | null;
    lab: {
        id: string;
        code: string;
        name: string;
        subdomain: string | null;
        isActive: boolean;
    } | null;
}
export declare class PlatformAdminService {
    private readonly rlsSessionService;
    private readonly settingsService;
    private readonly auditService;
    private readonly reportsService;
    private readonly adminAuthService;
    private readonly authService;
    private readonly logger;
    constructor(rlsSessionService: RlsSessionService, settingsService: SettingsService, auditService: AuditService, reportsService: ReportsService, adminAuthService: AdminAuthService, authService: AuthService);
    listLabs(): Promise<AdminLabListItem[]>;
    listLabsPaged(params: {
        q?: string;
        status?: string;
        page?: number;
        size?: number;
    }): Promise<{
        items: AdminLabListItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getLab(labId: string, actor?: PlatformActorContext): Promise<AdminLabListItem>;
    createLab(dto: CreateLabDto, actor?: PlatformActorContext): Promise<Lab>;
    updateLab(labId: string, dto: {
        code?: string;
        name?: string;
        subdomain?: string;
        timezone?: string;
    }, actor?: PlatformActorContext): Promise<Lab>;
    setLabStatus(labId: string, data: {
        isActive: boolean;
        reason: string;
    }, actor?: PlatformActorContext): Promise<Lab>;
    getSummary(params?: {
        labId?: string;
        dateFrom?: string;
        dateTo?: string;
    }, actor?: PlatformActorContext): Promise<AdminDashboardSummary>;
    listOrdersByLab(params: {
        labId: string;
        page?: number;
        size?: number;
    }): Promise<{
        items: Order[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    listOrders(params: {
        labId?: string;
        status?: string;
        q?: string;
        dateFrom?: string;
        dateTo?: string;
        page?: number;
        size?: number;
    }, actor?: PlatformActorContext): Promise<{
        items: AdminOrderListItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getOrderDetail(orderId: string, actor?: PlatformActorContext): Promise<{
        id: string;
        labId: string;
        orderNumber: string | null;
        status: OrderStatus;
        patientType: string;
        notes: string | null;
        paymentStatus: string;
        paidAmount: number | null;
        totalAmount: number;
        finalAmount: number;
        registeredAt: Date;
        createdAt: Date;
        updatedAt: Date;
        patient: Order['patient'];
        lab: Order['lab'];
        shift: Order['shift'];
        samples: Order['samples'];
        testsCount: number;
        verifiedTestsCount: number;
        completedTestsCount: number;
        pendingTestsCount: number;
        lastVerifiedAt: Date | null;
    }>;
    generateOrderResultsPdf(orderId: string, actor?: PlatformActorContext): Promise<{
        pdfBuffer: Buffer;
        fileName: string;
    }>;
    generateLabReportPreviewPdf(labId: string, payload: {
        orderId: string;
        reportBranding: unknown;
        reportStyle: unknown;
    }): Promise<{
        pdfBuffer: Buffer;
        fileName: string;
    }>;
    listAuditLogs(params: AdminAuditLogFilters & {
        page?: number;
        size?: number;
    }): Promise<{
        items: AuditLog[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    exportAuditLogsCsv(params: AdminAuditLogFilters & {
        reason: string;
        maxRows?: number;
    }, actor?: PlatformActorContext): Promise<{
        csvBuffer: Buffer;
        fileName: string;
    }>;
    getAuditActionOptions(): Promise<string[]>;
    getAuditEntityTypeOptions(params?: {
        labId?: string;
    }): Promise<string[]>;
    private validateAuditLogFilters;
    private buildAuditLogsQuery;
    private toAuditLogsCsv;
    private csvEscape;
    getSystemHealth(): Promise<AdminSystemHealth>;
    getPlatformSettingsOverview(): Promise<AdminPlatformSettingsOverview>;
    getSettingsRoles(): Promise<string[]>;
    getGlobalDashboardAnnouncement(actor?: PlatformActorContext): Promise<AdminGlobalDashboardAnnouncement>;
    updateGlobalDashboardAnnouncement(data: {
        dashboardAnnouncementText?: string | null;
    }): Promise<AdminGlobalDashboardAnnouncement>;
    getLabSettings(labId: string, actor?: PlatformActorContext): Promise<AdminLabSettingsSummary>;
    getLabReportDesign(labId: string, actor?: PlatformActorContext): Promise<AdminLabReportDesign>;
    updateLabSettings(labId: string, data: {
        labelSequenceBy?: string;
        sequenceResetBy?: string;
        enableOnlineResults?: boolean;
        onlineResultWatermarkDataUrl?: string | null;
        onlineResultWatermarkText?: string | null;
        printing?: {
            mode?: 'browser' | 'direct_gateway';
            receiptPrinterName?: string | null;
            labelsPrinterName?: string | null;
            reportPrinterName?: string | null;
        };
        reportBranding?: {
            bannerDataUrl?: string | null;
            footerDataUrl?: string | null;
            logoDataUrl?: string | null;
            watermarkDataUrl?: string | null;
        };
        reportStyle?: ReportStyleConfig | null;
        referringDoctors?: string[] | null;
        dashboardAnnouncementText?: string | null;
    }): Promise<AdminLabSettingsUpdateResponse>;
    getLabUsers(labId: string, actor?: PlatformActorContext): Promise<User[]>;
    getLabUser(userId: string, labId: string, actor?: PlatformActorContext): Promise<{
        user: User;
        labIds: string[];
        shiftIds: string[];
        departmentIds: string[];
    }>;
    createLabUser(labId: string, data: {
        username: string;
        password: string;
        fullName?: string;
        email?: string;
        role: string;
        shiftIds?: string[];
        departmentIds?: string[];
    }): Promise<User>;
    updateLabUser(userId: string, labId: string, data: {
        fullName?: string;
        email?: string;
        role?: string;
        defaultLabId?: string;
        isActive?: boolean;
        shiftIds?: string[];
        departmentIds?: string[];
        password?: string;
    }): Promise<User>;
    deleteLabUser(userId: string, labId: string): Promise<{
        success: true;
    }>;
    resetLabUserPassword(userId: string, labId: string, data: {
        password: string;
        reason: string;
    }, actor?: PlatformActorContext): Promise<{
        success: true;
    }>;
    getImpersonationStatus(user: {
        platformUserId: string;
        role: string;
        impersonatedLabId?: string | null;
    }): Promise<AdminImpersonationStatus>;
    startImpersonation(data: {
        labId: string;
        reason: string;
        refreshToken: string;
    }, actor: {
        platformUserId: string;
        role: string;
        impersonatedLabId?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        impersonation: AdminImpersonationStatus;
    }>;
    stopImpersonation(data: {
        refreshToken: string;
    }, actor: {
        platformUserId: string;
        role: string;
        impersonatedLabId?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        impersonation: AdminImpersonationStatus;
    }>;
    createImpersonatedLabPortalToken(actor: {
        platformUserId: string;
        role: string;
        impersonatedLabId?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<{
        bridgeToken: string;
        expiresAt: string;
        lab: {
            id: string;
            code: string;
            name: string;
            subdomain: string | null;
        };
    }>;
    getLabShifts(labId: string): Promise<Shift[]>;
    getLabDepartments(labId: string): Promise<Department[]>;
    transferLabTests(targetLabId: string, payload: {
        sourceLabId: string;
        dryRun?: boolean;
    }, actor?: PlatformActorContext): Promise<AdminLabTestsTransferResult>;
    private buildAndMaybeApplyTestTransfer;
    private applyTestTransferPlan;
    private buildTransferredTestPayload;
    private buildTestTransferWarnings;
    private assertNoNormalizedTestCodeCollisions;
    private normalizeTransferCode;
    private normalizeTransferCodeKey;
    private toNullableTrimmedText;
    private toNullableRawText;
    private toNullableNumber;
    private toNullableInteger;
    private toIntegerOrZero;
    private toTransferPrice;
    private normalizeTransferResultEntryType;
    private cloneTransferredCultureConfig;
    private cloneTransferredNumericAgeRanges;
    private cloneTransferredResultTextOptions;
    private cloneTransferredParameterDefinitions;
    private normalizeTransferredResultFlag;
    private toAdminLabListItems;
    private toAdminLabSettingsSummary;
    private toAdminLabSettingsUpdateResponse;
    private toAdminLabReportDesign;
    private resolveDashboardDateRange;
    private getTodayRange;
    private buildOrderTrend;
    private normalizeDateKey;
    private toSubdomainFromCode;
    private toAdminOrderListItem;
    private normalizeUuidV4;
    private normalizeReportImageDataUrl;
    private normalizeDashboardAnnouncementText;
    private normalizePreviewReportBranding;
    private normalizePreviewReportStyle;
    private logPlatformSensitiveRead;
    private logLabAudit;
}
