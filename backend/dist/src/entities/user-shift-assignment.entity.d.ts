import { User } from './user.entity';
import { Shift } from './shift.entity';
export declare class UserShiftAssignment {
    userId: string;
    shiftId: string;
    user: User;
    shift: Shift;
}
