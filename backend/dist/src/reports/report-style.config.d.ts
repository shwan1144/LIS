export type ReportTextAlign = 'left' | 'center' | 'right';
export type ReportFontFamily = 'system-sans' | 'arial' | 'tahoma' | 'verdana' | 'georgia' | 'times-new-roman' | 'courier-new';
export declare const DEFAULT_REPORT_FONT_FAMILY: ReportFontFamily;
export declare const REPORT_FONT_FAMILY_VALUES: readonly ReportFontFamily[];
export declare function resolveReportFontStack(fontFamily: ReportFontFamily): string;
export declare function resolveReportFontStackWithArabicFallback(fontFamily: ReportFontFamily): string;
export declare function resolveReportRtlFontStack(fontFamily: ReportFontFamily): string;
export interface ReportPatientInfoStyle {
    backgroundColor: string;
    borderColor: string;
    textColor: string;
    labelColor: string;
    fontSizePx: number;
    fontFamily: ReportFontFamily;
    labelFontWeight: 600 | 700 | 800;
    valueFontWeight: 400 | 500 | 600 | 700;
    textAlign: ReportTextAlign;
    borderRadiusPx: number;
    paddingYpx: number;
    paddingXpx: number;
}
export interface ReportResultsTableStyle {
    headerBackgroundColor: string;
    headerTextColor: string;
    headerFontSizePx: number;
    headerTextAlign: ReportTextAlign;
    bodyTextColor: string;
    bodyFontSizePx: number;
    fontFamily: ReportFontFamily;
    cellTextAlign: ReportTextAlign;
    borderColor: string;
    rowStripeEnabled: boolean;
    rowStripeColor: string;
    abnormalRowBackgroundColor: string;
    referenceValueColor: string;
    showDepartmentRow: boolean;
    departmentRowBackgroundColor: string;
    departmentRowTextColor: string;
    departmentRowFontSizePx: number;
    departmentRowTextAlign: ReportTextAlign;
    showCategoryRow: boolean;
    categoryRowBackgroundColor: string;
    categoryRowTextColor: string;
    categoryRowFontSizePx: number;
    categoryRowTextAlign: ReportTextAlign;
    statusNormalColor: string;
    statusHighColor: string;
    statusLowColor: string;
    regularDepartmentBlockBreak: 'auto' | 'avoid';
    regularRowBreak: 'auto' | 'avoid';
    panelTableBreak: 'auto' | 'avoid';
    panelRowBreak: 'auto' | 'avoid';
}
export interface ReportPageLayoutStyle {
    pageMarginTopMm: number;
    pageMarginRightMm: number;
    pageMarginBottomMm: number;
    pageMarginLeftMm: number;
    contentMarginXMm: number;
}
export interface ReportStyleConfig {
    version: 1;
    patientInfo: ReportPatientInfoStyle;
    resultsTable: ReportResultsTableStyle;
    pageLayout: ReportPageLayoutStyle;
}
export declare const DEFAULT_REPORT_STYLE_V1: ReportStyleConfig;
export declare function validateAndNormalizeReportStyleConfig(value: unknown, fieldName?: string): ReportStyleConfig;
export declare function resolveReportStyleConfig(value: unknown): ReportStyleConfig;
