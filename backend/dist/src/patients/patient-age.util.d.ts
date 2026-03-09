type DateInput = Date | string | null | undefined;
export interface PatientAgeSnapshot {
    years: number;
    months: number;
    days: number;
}
export declare function formatPatientAgeDisplay(dateOfBirth: DateInput, referenceDate?: DateInput): string | null;
export declare function getPatientAgeSnapshot(dateOfBirth: DateInput, referenceDate?: DateInput): PatientAgeSnapshot | null;
export declare function getPatientAgeYears(dateOfBirth: DateInput, referenceDate?: DateInput): number | null;
export {};
