export declare const RESULTS_REPORT_PRINT_READY_FLAG = "__lisResultsPrintReady";
export declare const RESULTS_REPORT_PRINT_ERROR_FLAG = "__lisResultsPrintError";
export declare const RESULTS_REPORT_PRINT_READY_EVENT = "lis-results-print-ready";
export declare const RESULTS_REPORT_PRINT_ERROR_EVENT = "lis-results-print-error";
export declare function prepareResultsReportDocumentForPrint(): Promise<void>;
export declare function injectResultsReportPrintPreparationScript(html: string): string;
