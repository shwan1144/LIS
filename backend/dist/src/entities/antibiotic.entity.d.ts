import { Lab } from './lab.entity';
export declare class Antibiotic {
    id: string;
    labId: string;
    lab: Lab;
    code: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}
