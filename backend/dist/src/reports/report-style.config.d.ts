export type ReportTextAlign = 'left' | 'center' | 'right';
export type ReportFontFamily = 'system-sans' | 'arial' | 'tahoma' | 'verdana' | 'georgia' | 'times-new-roman' | 'courier-new';
export declare const DEFAULT_REPORT_FONT_FAMILY: ReportFontFamily;
export declare const REPORT_FONT_FAMILY_VALUES: readonly ReportFontFamily[];
export declare function resolveReportFontStack(fontFamily: ReportFontFamily): string;
export declare function resolveReportFontStackWithArabicFallback(fontFamily: ReportFontFamily): string;
export declare function resolveReportRtlFontStack(fontFamily: ReportFontFamily): string;
export interface ReportPatientInfoCellStyle {
    backgroundColor: string;
    textColor: string;
    fontFamily: ReportFontFamily;
    fontSizePx: number;
    fontWeight: 400 | 500 | 600 | 700 | 800;
    textAlign: ReportTextAlign;
    paddingYpx: number;
    paddingXpx: number;
}
export interface ReportPatientInfoStyle {
    backgroundColor: string;
    borderColor: string;
    borderRadiusPx: number;
    paddingYpx: number;
    paddingXpx: number;
    marginTopPx: number;
    marginBottomPx: number;
    dividerWidthPx: number;
    labelCellStyle: ReportPatientInfoCellStyle;
    valueCellStyle: ReportPatientInfoCellStyle;
}
export interface ReportColumnStyle {
    textColor: string;
    fontSizePx: number;
    textAlign: ReportTextAlign;
    bold: boolean;
}
export interface ReportResultsTableSectionStyle {
    textColor: string;
    borderColor: string;
    fontFamily: ReportFontFamily;
    fontSizePx: number;
    textAlign: ReportTextAlign;
    paddingYpx: number;
    paddingXpx: number;
    borderRadiusPx: number;
}
export interface ReportResultsTableFilledSectionStyle extends ReportResultsTableSectionStyle {
    backgroundColor: string;
}
export interface ReportPanelSectionStyle extends ReportResultsTableFilledSectionStyle {
    bold: boolean;
    borderWidthPx: number;
    borderRadiusPx: number;
    marginTopPx: number;
    marginBottomPx: number;
}
export interface ReportTitleStyle {
    text: string;
    textColor: string;
    fontSizePx: number;
    textAlign: ReportTextAlign;
    bold: boolean;
    underline: boolean;
    paddingYpx: number;
    paddingXpx: number;
}
export interface ReportResultsTableStyle {
    headerStyle: ReportResultsTableFilledSectionStyle;
    bodyStyle: ReportResultsTableSectionStyle;
    panelSectionStyle: ReportPanelSectionStyle;
    rowStripeEnabled: boolean;
    rowStripeColor: string;
    abnormalRowBackgroundColor: string;
    referenceValueColor: string;
    showStatusColumn: boolean;
    showDepartmentRow: boolean;
    departmentRowStyle: ReportResultsTableFilledSectionStyle;
    showCategoryRow: boolean;
    categoryRowStyle: ReportResultsTableFilledSectionStyle;
    statusNormalColor: string;
    statusHighColor: string;
    statusLowColor: string;
    regularDepartmentBlockBreak: 'auto' | 'avoid';
    regularRowBreak: 'auto' | 'avoid';
    panelTableBreak: 'auto' | 'avoid';
    panelRowBreak: 'auto' | 'avoid';
    testColumn: ReportColumnStyle;
    resultColumn: ReportColumnStyle;
    unitColumn: ReportColumnStyle;
    statusColumn: ReportColumnStyle;
    referenceColumn: ReportColumnStyle;
}
export interface ReportPageLayoutStyle {
    pageMarginTopMm: number;
    pageMarginRightMm: number;
    pageMarginBottomMm: number;
    pageMarginLeftMm: number;
    contentMarginXMm: number;
}
export interface ReportCultureSectionStyle {
    fontFamily: ReportFontFamily;
    sectionTitleColor: string;
    sectionTitleBorderColor: string;
    sectionTitleAlign: ReportTextAlign;
    noGrowthBackgroundColor: string;
    noGrowthBorderColor: string;
    noGrowthTextColor: string;
    noGrowthPaddingYpx: number;
    noGrowthPaddingXpx: number;
    metaTextColor: string;
    metaTextAlign: ReportTextAlign;
    commentTextColor: string;
    commentTextAlign: ReportTextAlign;
    notesTextColor: string;
    notesBorderColor: string;
    notesTextAlign: ReportTextAlign;
    notesPaddingYpx: number;
    notesPaddingXpx: number;
    astGridGapPx: number;
    astMinHeightPx: number;
    astColumnBorderRadiusPx: number;
    astColumnPaddingPx: number;
    astColumnTitleColor: string;
    astColumnTitleBorderColor: string;
    astBodyTextColor: string;
    astEmptyTextColor: string;
    astSensitiveBorderColor: string;
    astSensitiveBackgroundColor: string;
    astIntermediateBorderColor: string;
    astIntermediateBackgroundColor: string;
    astResistanceBorderColor: string;
    astResistanceBackgroundColor: string;
}
export interface ReportStyleConfig {
    version: 1;
    patientInfo: ReportPatientInfoStyle;
    reportTitle: ReportTitleStyle;
    resultsTable: ReportResultsTableStyle;
    pageLayout: ReportPageLayoutStyle;
    cultureSection: ReportCultureSectionStyle;
}
export declare const DEFAULT_REPORT_STYLE_V1: ReportStyleConfig;
export declare function validateAndNormalizeReportStyleConfig(value: unknown, fieldName?: string): ReportStyleConfig;
export declare function resolveReportStyleConfig(value: unknown): ReportStyleConfig;
