export declare function normalizeLabTimeZone(rawTimeZone: string | null | undefined): string;
export declare function formatDateKeyForTimeZone(date: Date, rawTimeZone: string | null | undefined): string;
export declare function formatOrderDatePrefixForTimeZone(date: Date, rawTimeZone: string | null | undefined): string;
export declare function addDaysToDateKey(dateKey: string, dayOffset: number): string;
export declare function getUtcRangeForLabDate(dateKey: string, rawTimeZone: string | null | undefined): {
    startDate: Date;
    endDate: Date;
    endExclusive: Date;
};
