import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { UserShiftAssignment } from '../entities/user-shift-assignment.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { ReportTheme } from '../entities/report-theme.entity';
import { type ReportStyleConfig } from '../reports/report-style.config';
import { ReportsService } from '../reports/reports.service';
type ReportBrandingUpdate = {
    bannerDataUrl?: string | null;
    footerDataUrl?: string | null;
    logoDataUrl?: string | null;
    watermarkDataUrl?: string | null;
};
type LabPrintingUpdate = {
    mode?: 'browser' | 'direct_gateway' | string;
    receiptPrinterName?: string | null;
    labelsPrinterName?: string | null;
    reportPrinterName?: string | null;
};
type UiTestGroup = {
    id: string;
    name: string;
    testIds: string[];
};
export declare class SettingsService {
    private readonly userRepo;
    private readonly labAssignmentRepo;
    private readonly shiftAssignmentRepo;
    private readonly userDeptRepo;
    private readonly departmentRepo;
    private readonly labRepo;
    private readonly shiftRepo;
    private readonly reportThemeRepo;
    private readonly reportsService;
    constructor(userRepo: Repository<User>, labAssignmentRepo: Repository<UserLabAssignment>, shiftAssignmentRepo: Repository<UserShiftAssignment>, userDeptRepo: Repository<UserDepartmentAssignment>, departmentRepo: Repository<Department>, labRepo: Repository<Lab>, shiftRepo: Repository<Shift>, reportThemeRepo: Repository<ReportTheme>, reportsService: ReportsService);
    getRoles(): string[];
    getLabSettings(labId: string): Promise<{
        id: string;
        code: string;
        name: string;
        labelSequenceBy: string;
        sequenceResetBy: string;
        enableOnlineResults: boolean;
        onlineResultWatermarkDataUrl: string | null;
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
        reportStyle: ReportStyleConfig | null;
        reportDesignFingerprint: string;
        uiTestGroups: {
            id: string;
            name: string;
            testIds: string[];
        }[];
        referringDoctors: string[];
        dashboardAnnouncementText: string | null;
    }>;
    updateLabSettings(labId: string, data: {
        labelSequenceBy?: string;
        sequenceResetBy?: string;
        enableOnlineResults?: boolean;
        onlineResultWatermarkDataUrl?: string | null;
        printing?: LabPrintingUpdate;
        reportBranding?: ReportBrandingUpdate;
        reportStyle?: ReportStyleConfig | null;
        uiTestGroups?: UiTestGroup[] | null;
        referringDoctors?: string[] | null;
        dashboardAnnouncementText?: string | null;
    }): Promise<{
        id: string;
        code: string;
        name: string;
        labelSequenceBy: string;
        sequenceResetBy: string;
        enableOnlineResults: boolean;
        onlineResultWatermarkDataUrl: string | null;
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
        reportStyle: ReportStyleConfig | null;
        reportDesignFingerprint: string;
        uiTestGroups: {
            id: string;
            name: string;
            testIds: string[];
        }[];
        referringDoctors: string[];
        dashboardAnnouncementText: string | null;
    }>;
    getReportThemes(labId: string): Promise<{
        id: string;
        labId: string;
        name: string;
        reportStyle: any;
        reportBranding: any;
        onlineResultWatermarkDataUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    saveReportTheme(labId: string, data: {
        name: string;
        reportStyle: ReportStyleConfig;
        reportBranding: ReportBrandingUpdate;
        onlineResultWatermarkDataUrl: string | null;
    }): Promise<{
        id: string;
        labId: string;
        name: string;
        reportStyle: any;
        reportBranding: any;
        onlineResultWatermarkDataUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    applyReportTheme(labId: string, themeId: string): Promise<{
        id: string;
        code: string;
        name: string;
        labelSequenceBy: string;
        sequenceResetBy: string;
        enableOnlineResults: boolean;
        onlineResultWatermarkDataUrl: string | null;
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
        reportStyle: ReportStyleConfig | null;
        reportDesignFingerprint: string;
        uiTestGroups: {
            id: string;
            name: string;
            testIds: string[];
        }[];
        referringDoctors: string[];
        dashboardAnnouncementText: string | null;
    }>;
    deleteReportTheme(labId: string, themeId: string): Promise<void>;
    generateLabReportPreviewPdf(labId: string, payload: {
        orderId: unknown;
        previewMode?: unknown;
        reportBranding: unknown;
        reportStyle: unknown;
    }): Promise<Buffer>;
    private normalizeReportImageDataUrl;
    private toReportThemeDto;
    private normalizePrintMethod;
    private normalizePrinterName;
    private normalizeReferringDoctors;
    private normalizeReferringDoctorsForRead;
    private normalizeDashboardAnnouncementText;
    private normalizeUuidV4;
    private normalizePreviewReportBranding;
    private normalizePreviewReportStyle;
    private normalizePreviewMode;
    getUsersForLab(labId: string): Promise<User[]>;
    getShiftsForLab(labId: string): Promise<Shift[]>;
    getDepartmentsForLab(labId: string): Promise<Department[]>;
    getUserWithDetails(id: string, labId: string): Promise<{
        user: User;
        labIds: string[];
        shiftIds: string[];
        departmentIds: string[];
    }>;
    createUser(labId: string, data: {
        username: string;
        password: string;
        fullName?: string;
        email?: string;
        role: string;
        shiftIds?: string[];
        departmentIds?: string[];
    }): Promise<User>;
    updateUser(id: string, labId: string, data: {
        fullName?: string;
        email?: string;
        role?: string;
        defaultLabId?: string;
        isActive?: boolean;
        shiftIds?: string[];
        departmentIds?: string[];
        password?: string;
    }): Promise<User>;
    private ensureShiftsBelongToLab;
    private ensureDepartmentsBelongToLab;
    deleteUser(userId: string, labId: string, currentUserId: string): Promise<void>;
}
export {};
