import { User } from './user.entity';
import { Department } from './department.entity';
export declare class UserDepartmentAssignment {
    userId: string;
    departmentId: string;
    user: User;
    department: Department;
}
