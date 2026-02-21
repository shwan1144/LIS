import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { UserShiftAssignment } from '../entities/user-shift-assignment.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
type ReportBrandingUpdate = {
    bannerDataUrl?: string | null;
    footerDataUrl?: string | null;
    logoDataUrl?: string | null;
    watermarkDataUrl?: string | null;
};
type LabPrintingUpdate = {
    mode?: 'browser' | 'direct_qz' | string;
    receiptPrinterName?: string | null;
    labelsPrinterName?: string | null;
    reportPrinterName?: string | null;
};
export declare class SettingsService {
    private readonly userRepo;
    private readonly labAssignmentRepo;
    private readonly shiftAssignmentRepo;
    private readonly userDeptRepo;
    private readonly departmentRepo;
    private readonly labRepo;
    private readonly shiftRepo;
    constructor(userRepo: Repository<User>, labAssignmentRepo: Repository<UserLabAssignment>, shiftAssignmentRepo: Repository<UserShiftAssignment>, userDeptRepo: Repository<UserDepartmentAssignment>, departmentRepo: Repository<Department>, labRepo: Repository<Lab>, shiftRepo: Repository<Shift>);
    getRoles(): string[];
    getLabSettings(labId: string): Promise<{
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
    updateLabSettings(labId: string, data: {
        labelSequenceBy?: string;
        sequenceResetBy?: string;
        enableOnlineResults?: boolean;
        onlineResultWatermarkDataUrl?: string | null;
        onlineResultWatermarkText?: string | null;
        printing?: LabPrintingUpdate;
        reportBranding?: ReportBrandingUpdate;
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
    private normalizeReportImageDataUrl;
    private normalizeOnlineResultWatermarkText;
    private normalizePrintMethod;
    private normalizePrinterName;
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
