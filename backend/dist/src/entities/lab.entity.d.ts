import { UserLabAssignment } from './user-lab-assignment.entity';
import { Shift } from './shift.entity';
import { Department } from './department.entity';
export declare class Lab {
    id: string;
    code: string;
    name: string;
    timezone: string;
    isActive: boolean;
    labelSequenceBy: string;
    sequenceResetBy: string;
    enableOnlineResults: boolean;
    createdAt: Date;
    updatedAt: Date;
    userAssignments: UserLabAssignment[];
    shifts: Shift[];
    departments: Department[];
}
