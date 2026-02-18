import { UserLabAssignment } from './user-lab-assignment.entity';
import { UserShiftAssignment } from './user-shift-assignment.entity';
import { UserDepartmentAssignment } from './user-department-assignment.entity';
import { Lab } from './lab.entity';
export declare class User {
    id: string;
    username: string;
    passwordHash: string;
    fullName: string | null;
    email: string | null;
    role: string;
    defaultLabId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    labAssignments: UserLabAssignment[];
    shiftAssignments: UserShiftAssignment[];
    departmentAssignments: UserDepartmentAssignment[];
    defaultLab: Lab | null;
}
