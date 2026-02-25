import { Response } from 'express';
import { PlatformAdminService } from './platform-admin.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { SetLabStatusDto } from './dto/set-lab-status.dto';
import { ExportAuditLogsDto } from './dto/export-audit-logs.dto';
import { ResetLabUserPasswordDto } from './dto/reset-lab-user-password.dto';
import { StartImpersonationDto } from './dto/start-impersonation.dto';
interface RequestWithPlatformUser {
    user: {
        platformUserId: string;
        role: string;
        impersonatedLabId?: string | null;
        impersonationStartedAt?: string | null;
    };
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
}
export declare class PlatformAdminController {
    private readonly platformAdminService;
    constructor(platformAdminService: PlatformAdminService);
    listLabs(): Promise<import("./platform-admin.service").AdminLabListItem[]>;
    listLabsPaged(q?: string, status?: string, page?: string, size?: string): Promise<{
        items: import("./platform-admin.service").AdminLabListItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getImpersonationStatus(req: RequestWithPlatformUser): Promise<import("./platform-admin.service").AdminImpersonationStatus>;
    startImpersonation(req: RequestWithPlatformUser, dto: StartImpersonationDto): Promise<{
        accessToken: string;
        impersonation: import("./platform-admin.service").AdminImpersonationStatus;
    }>;
    stopImpersonation(req: RequestWithPlatformUser): Promise<{
        accessToken: string;
        impersonation: import("./platform-admin.service").AdminImpersonationStatus;
    }>;
    openImpersonatedLabPortal(req: RequestWithPlatformUser): Promise<{
        bridgeToken: string;
        expiresAt: string;
        lab: {
            id: string;
            code: string;
            name: string;
            subdomain: string | null;
        };
    }>;
    createLab(req: RequestWithPlatformUser, dto: CreateLabDto): Promise<import("../entities/lab.entity").Lab>;
    getLab(req: RequestWithPlatformUser, labId: string): Promise<import("./platform-admin.service").AdminLabListItem>;
    updateLab(req: RequestWithPlatformUser, labId: string, dto: UpdateLabDto): Promise<import("../entities/lab.entity").Lab>;
    setLabStatus(req: RequestWithPlatformUser, labId: string, dto: SetLabStatusDto): Promise<import("../entities/lab.entity").Lab>;
    getSummary(req: RequestWithPlatformUser, labId?: string, dateFrom?: string, dateTo?: string): Promise<import("./platform-admin.service").AdminDashboardSummary>;
    getSettingsRoles(): Promise<string[]>;
    getLabSettings(req: RequestWithPlatformUser, labId: string): Promise<{
        id: string;
        code: string;
        name: string;
        labelSequenceBy: string;
        sequenceResetBy: string;
        enableOnlineResults: boolean;
        onlineResultWatermarkDataUrl: string | null;
        onlineResultWatermarkText: string | null;
        printing: {
            mode: string;
            receiptPrinterName: string | null;
            labelsPrinterName: string | null;
            reportPrinterName: string | null;
        };
        reportBranding: {
            bannerDataUrl: string | null;
            footerDataUrl: string | null;
            logoDataUrl: string | null;
            watermarkDataUrl: string | null;
        };
    }>;
    updateLabSettings(labId: string, body: {
        labelSequenceBy?: string;
        sequenceResetBy?: string;
        enableOnlineResults?: boolean;
        onlineResultWatermarkDataUrl?: string | null;
        onlineResultWatermarkText?: string | null;
        printing?: {
            mode?: 'browser' | 'direct_qz';
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
    }): Promise<{
        id: string;
        code: string;
        name: string;
        labelSequenceBy: string;
        sequenceResetBy: string;
        enableOnlineResults: boolean;
        onlineResultWatermarkDataUrl: string | null;
        onlineResultWatermarkText: string | null;
        printing: {
            mode: string;
            receiptPrinterName: string | null;
            labelsPrinterName: string | null;
            reportPrinterName: string | null;
        };
        reportBranding: {
            bannerDataUrl: string | null;
            footerDataUrl: string | null;
            logoDataUrl: string | null;
            watermarkDataUrl: string | null;
        };
    }>;
    getLabUsers(req: RequestWithPlatformUser, labId: string): Promise<import("../entities/user.entity").User[]>;
    getLabUser(req: RequestWithPlatformUser, labId: string, id: string): Promise<{
        user: import("../entities/user.entity").User;
        labIds: string[];
        shiftIds: string[];
        departmentIds: string[];
    }>;
    createLabUser(labId: string, body: {
        username: string;
        password: string;
        fullName?: string;
        email?: string;
        role: string;
        shiftIds?: string[];
        departmentIds?: string[];
    }): Promise<import("../entities/user.entity").User>;
    updateLabUser(labId: string, id: string, body: {
        fullName?: string;
        email?: string;
        role?: string;
        defaultLabId?: string;
        isActive?: boolean;
        shiftIds?: string[];
        departmentIds?: string[];
        password?: string;
    }): Promise<import("../entities/user.entity").User>;
    deleteLabUser(labId: string, id: string): Promise<{
        success: true;
    }>;
    resetLabUserPassword(req: RequestWithPlatformUser, labId: string, id: string, dto: ResetLabUserPasswordDto): Promise<{
        success: true;
    }>;
    getLabShifts(labId: string): Promise<import("../entities/shift.entity").Shift[]>;
    getLabDepartments(labId: string): Promise<import("../entities/department.entity").Department[]>;
    listOrders(req: RequestWithPlatformUser, labId?: string, status?: string, q?: string, dateFrom?: string, dateTo?: string, page?: string, size?: string): Promise<{
        items: import("./platform-admin.service").AdminOrderListItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getOrderDetail(req: RequestWithPlatformUser, orderId: string): Promise<{
        id: string;
        labId: string;
        orderNumber: string | null;
        status: import("../entities/order.entity").OrderStatus;
        patientType: string;
        notes: string | null;
        paymentStatus: string;
        paidAmount: number | null;
        totalAmount: number;
        finalAmount: number;
        registeredAt: Date;
        createdAt: Date;
        updatedAt: Date;
        patient: import("../entities/order.entity").Order["patient"];
        lab: import("../entities/order.entity").Order["lab"];
        shift: import("../entities/order.entity").Order["shift"];
        samples: import("../entities/order.entity").Order["samples"];
        testsCount: number;
        verifiedTestsCount: number;
        completedTestsCount: number;
        pendingTestsCount: number;
        hasCriticalFlag: boolean;
        lastVerifiedAt: Date | null;
    }>;
    getOrderResultsPdf(req: RequestWithPlatformUser, orderId: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    listAuditLogs(labId?: string, actorType?: string, action?: string, entityType?: string, search?: string, dateFrom?: string, dateTo?: string, page?: string, size?: string): Promise<{
        items: import("../entities/audit-log.entity").AuditLog[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    exportAuditLogs(req: RequestWithPlatformUser, dto: ExportAuditLogsDto, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    getAuditActions(): Promise<string[]>;
    getAuditEntityTypes(labId?: string): Promise<string[]>;
    getSystemHealth(): Promise<import("./platform-admin.service").AdminSystemHealth>;
    getPlatformSettingsOverview(): Promise<import("./platform-admin.service").AdminPlatformSettingsOverview>;
    private getActorContext;
}
export {};
