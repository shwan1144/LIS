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
    getRoles(): string[];
    getLabSettings(req: RequestWithUser): Promise<{
        id: string;
        code: string;
        name: string;
        labelSequenceBy: string;
        sequenceResetBy: string;
        enableOnlineResults: boolean;
    }>;
    updateLabSettings(req: RequestWithUser, body: {
        labelSequenceBy?: string;
        sequenceResetBy?: string;
        enableOnlineResults?: boolean;
    }): Promise<{
        id: string;
        code: string;
        name: string;
        labelSequenceBy: string;
        sequenceResetBy: string;
        enableOnlineResults: boolean;
    }>;
    getUsers(req: RequestWithUser): Promise<import("../entities/user.entity").User[]>;
    getUser(req: RequestWithUser, id: string): Promise<{
        user: import("../entities/user.entity").User;
        labIds: string[];
        shiftIds: string[];
        departmentIds: string[];
    }>;
    createUser(req: RequestWithUser, body: {
        username: string;
        password: string;
        fullName?: string;
        email?: string;
        role: string;
        shiftIds?: string[];
        departmentIds?: string[];
    }): Promise<import("../entities/user.entity").User>;
    updateUser(req: RequestWithUser, id: string, body: {
        fullName?: string;
        email?: string;
        role?: string;
        defaultLabId?: string;
        isActive?: boolean;
        shiftIds?: string[];
        departmentIds?: string[];
        password?: string;
    }): Promise<import("../entities/user.entity").User>;
    deleteUser(req: RequestWithUser, id: string): Promise<{
        success: boolean;
    }>;
}
export {};
