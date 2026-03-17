import { Lab } from './lab.entity';
import { User } from './user.entity';
import { SubLabTestPrice } from './sub-lab-test-price.entity';
import { Order } from './order.entity';
export declare class SubLab {
    id: string;
    labId: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lab: Lab;
    users: User[];
    testPrices: SubLabTestPrice[];
    orders: Order[];
}
