import { EntityManager } from 'typeorm';
export interface LabCounterNextValueInput {
    labId: string;
    counterType: string;
    scopeKey?: string | null;
    date?: Date;
    shiftId?: string | null;
}
export declare function nextLabCounterValue(manager: EntityManager, input: LabCounterNextValueInput): Promise<number>;
export declare function peekNextLabCounterValue(manager: EntityManager, input: LabCounterNextValueInput): Promise<number>;
