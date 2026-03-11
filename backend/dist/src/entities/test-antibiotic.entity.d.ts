import { Antibiotic } from './antibiotic.entity';
import { Test } from './test.entity';
export declare class TestAntibiotic {
    id: string;
    testId: string;
    antibioticId: string;
    sortOrder: number;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    test: Test;
    antibiotic: Antibiotic;
}
