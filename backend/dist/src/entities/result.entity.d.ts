export declare class Result {
    id: string;
    labId: string;
    orderTestId: string;
    analyteCode: string | null;
    value: string | null;
    unit: string | null;
    flags: string | null;
    enteredAt: Date | null;
    enteredByUserId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}
