import { SubLab } from './sub-lab.entity';
import { Test } from './test.entity';
export declare class SubLabTestPrice {
    id: string;
    subLabId: string;
    testId: string;
    price: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    subLab: SubLab;
    test: Test;
}
