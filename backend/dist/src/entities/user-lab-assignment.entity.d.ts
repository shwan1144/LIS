import { User } from './user.entity';
import { Lab } from './lab.entity';
export declare class UserLabAssignment {
    userId: string;
    labId: string;
    user: User;
    lab: Lab;
}
