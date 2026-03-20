import { StreamableFile } from '@nestjs/common';
import { SettingsService } from './settings.service';
import type { ReportStyleConfig } from '../reports/report-style.config';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
        role: string;
    };
}
export declare class SettingsController {
    private readonly settingsService;
    constructor(settingsService: SettingsService);
    getRoles(): void;
    getLabSettings(req: RequestWithUser): Promise<{
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
    updateLabSettings(req: RequestWithUser, body: {
        labelSequenceBy?: string;
        sequenceResetBy?: string;
        enableOnlineResults?: boolean;
        onlineResultWatermarkDataUrl?: string | null;
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
        uiTestGroups?: {
            id: string;
            name: string;
            testIds: string[];
        }[] | null;
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
    previewLabReportPdf(req: RequestWithUser, body: {
        orderId: string;
        previewMode?: 'full' | 'culture_only';
        reportBranding: {
            bannerDataUrl?: string | null;
            footerDataUrl?: string | null;
            logoDataUrl?: string | null;
            watermarkDataUrl?: string | null;
        };
        reportStyle: ReportStyleConfig;
    }): Promise<StreamableFile>;
    getUsers(req: RequestWithUser): Promise<void>;
    getUser(req: RequestWithUser, id: string): Promise<void>;
    createUser(req: RequestWithUser, body: {
        username: string;
        password: string;
        fullName?: string;
        email?: string;
        role: string;
        shiftIds?: string[];
        departmentIds?: string[];
    }): Promise<void>;
    updateUser(req: RequestWithUser, id: string, body: {
        fullName?: string;
        email?: string;
        role?: string;
        defaultLabId?: string;
        isActive?: boolean;
        shiftIds?: string[];
        departmentIds?: string[];
        password?: string;
    }): Promise<void>;
    deleteUser(req: RequestWithUser, id: string): Promise<void>;
    getReportThemes(req: RequestWithUser): Promise<{
        id: string;
        labId: string;
        name: string;
        reportStyle: any;
        reportBranding: any;
        onlineResultWatermarkDataUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    saveReportTheme(req: RequestWithUser, body: {
        name: string;
        reportStyle: ReportStyleConfig;
        reportBranding: {
            bannerDataUrl?: string | null;
            footerDataUrl?: string | null;
            logoDataUrl?: string | null;
            watermarkDataUrl?: string | null;
        };
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
    applyReportTheme(req: RequestWithUser, id: string): Promise<{
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
    deleteReportTheme(req: RequestWithUser, id: string): Promise<{
        success: boolean;
    }>;
}
export {};
