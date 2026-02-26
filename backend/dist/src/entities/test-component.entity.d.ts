import { Test } from './test.entity';
export declare class TestComponent {
    panelTestId: string;
    childTestId: string;
    required: boolean;
    sortOrder: number;
    reportSection: string | null;
    reportGroup: string | null;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    createdAt: Date;
    updatedAt: Date;
    panelTest: Test;
    childTest: Test;
}
