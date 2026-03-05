import { Lab } from './lab.entity';
import { UserShiftAssignment } from './user-shift-assignment.entity';
export declare class Shift {
    id: string;
    labId: string;
    code: string;
    name: string | null;
    startTime: string | null;
    endTime: string | null;
    isEmergency: boolean;
    lab: Lab;
    userAssignments: UserShiftAssignment[];
}
