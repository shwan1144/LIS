type OrderTestResultSnapshot = {
    resultValue?: unknown;
    resultText?: unknown;
    resultParameters?: unknown;
    cultureResult?: unknown;
    resultDocument?: unknown;
    resultDocumentStorageKey?: unknown;
};
export declare function hasMeaningfulOrderTestResult(orderTest: OrderTestResultSnapshot | null | undefined): boolean;
export {};
