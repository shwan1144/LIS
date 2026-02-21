import { SettingsService } from './settings.service';
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
        onlineResultWatermarkText: string | null;
        reportBranding: {
            bannerDataUrl: string | null;
            footerDataUrl: string | null;
            logoDataUrl: string | null;
            watermarkDataUrl: string | null;
        };
    }>;
    updateLabSettings(req: RequestWithUser, body: {
        labelSequenceBy?: string;
        sequenceResetBy?: string;
        enableOnlineResults?: boolean;
        onlineResultWatermarkDataUrl?: string | null;
        onlineResultWatermarkText?: string | null;
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
        reportBranding: {
            bannerDataUrl: string | null;
            footerDataUrl: string | null;
            logoDataUrl: string | null;
            watermarkDataUrl: string | null;
        };
    }>;
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
}
export {};
