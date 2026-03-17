declare const STATISTICS_SOURCE_TYPES: readonly ["ALL", "IN_HOUSE", "SUB_LAB"];
export type StatisticsSourceTypeQuery = (typeof STATISTICS_SOURCE_TYPES)[number];
export declare class StatisticsQueryDto {
    startDate?: string;
    endDate?: string;
    shiftId?: string;
    departmentId?: string;
    sourceType?: StatisticsSourceTypeQuery;
}
export {};
