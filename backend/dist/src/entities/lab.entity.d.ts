import { UserLabAssignment } from './user-lab-assignment.entity';
import { Shift } from './shift.entity';
import { Department } from './department.entity';
import { Test } from './test.entity';
export declare class Lab {
    id: string;
    code: string;
    subdomain: string | null;
    name: string;
    timezone: string;
    isActive: boolean;
    labelSequenceBy: string;
    sequenceResetBy: string;
    enableOnlineResults: boolean;
    reportBannerDataUrl: string | null;
    reportFooterDataUrl: string | null;
    reportLogoDataUrl: string | null;
    reportWatermarkDataUrl: string | null;
    onlineResultWatermarkDataUrl: string | null;
    onlineResultWatermarkText: string | null;
    createdAt: Date;
    updatedAt: Date;
    userAssignments: UserLabAssignment[];
    shifts: Shift[];
    departments: Department[];
    tests: Test[];
}
