export type ReportTextAlign = 'left' | 'center' | 'right';
export type ReportFontFamily =
  | 'system-sans'
  | 'arial'
  | 'tahoma'
  | 'verdana'
  | 'georgia'
  | 'times-new-roman'
  | 'courier-new';

export const DEFAULT_REPORT_FONT_FAMILY: ReportFontFamily = 'system-sans';
export const REPORT_FONT_FAMILY_VALUES: readonly ReportFontFamily[] = [
  'system-sans',
  'arial',
  'tahoma',
  'verdana',
  'georgia',
  'times-new-roman',
  'courier-new',
] as const;

const REPORT_FONT_STACKS: Record<ReportFontFamily, string> = {
  'system-sans': "'Segoe UI', Tahoma, Arial, sans-serif",
  arial: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
  tahoma: "Tahoma, 'Segoe UI', Arial, sans-serif",
  verdana: "Verdana, 'Segoe UI', Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  'times-new-roman': "'Times New Roman', Times, serif",
  'courier-new': "'Courier New', Courier, monospace",
};

const REPORT_ARABIC_FONT_STACK = "'KurdishReportFont', 'Noto Naskh Arabic', 'Noto Sans Arabic'";

export function resolveReportFontStack(fontFamily: ReportFontFamily): string {
  return REPORT_FONT_STACKS[fontFamily];
}

export function resolveReportFontStackWithArabicFallback(fontFamily: ReportFontFamily): string {
  return `${resolveReportFontStack(fontFamily)}, ${REPORT_ARABIC_FONT_STACK}`;
}

export function resolveReportRtlFontStack(fontFamily: ReportFontFamily): string {
  return `${REPORT_ARABIC_FONT_STACK}, ${resolveReportFontStack(fontFamily)}`;
}

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

export const DEFAULT_REPORT_STYLE_V1: ReportStyleConfig = {
  version: 1,
  patientInfo: {
    backgroundColor: '#FAFAFA',
    borderColor: '#CCCCCC',
    borderRadiusPx: 6,
    paddingYpx: 10,
    paddingXpx: 12,
    marginTopPx: 8,
    marginBottomPx: 6,
    dividerWidthPx: 1,
    labelCellStyle: {
      backgroundColor: '#FAFAFA',
      textColor: '#333333',
      fontFamily: DEFAULT_REPORT_FONT_FAMILY,
      fontSizePx: 13,
      fontWeight: 700,
      textAlign: 'left',
      paddingYpx: 4,
      paddingXpx: 8,
    },
    valueCellStyle: {
      backgroundColor: '#FAFAFA',
      textColor: '#333333',
      fontFamily: DEFAULT_REPORT_FONT_FAMILY,
      fontSizePx: 13,
      fontWeight: 400,
      textAlign: 'left',
      paddingYpx: 4,
      paddingXpx: 8,
    },
  },
  reportTitle: {
    text: 'Laboratory Report',
    textColor: '#111111',
    fontSizePx: 20,
    textAlign: 'center',
    bold: true,
    underline: true,
    paddingYpx: 0,
    paddingXpx: 0,
  },
  resultsTable: {
    headerStyle: {
      backgroundColor: '#F2F2F2',
      textColor: '#333333',
      borderColor: '#EEEEEE',
      fontFamily: DEFAULT_REPORT_FONT_FAMILY,
      fontSizePx: 12,
      textAlign: 'left',
      paddingYpx: 6,
      paddingXpx: 8,
      borderRadiusPx: 0,
    },
    bodyStyle: {
      textColor: '#333333',
      borderColor: '#EEEEEE',
      fontFamily: DEFAULT_REPORT_FONT_FAMILY,
      fontSizePx: 12,
      textAlign: 'left',
      paddingYpx: 6,
      paddingXpx: 8,
      borderRadiusPx: 0,
    },
    panelSectionStyle: {
      backgroundColor: '#F3F6FB',
      textColor: '#1F2937',
      borderColor: '#D6DFEA',
      fontFamily: DEFAULT_REPORT_FONT_FAMILY,
      fontSizePx: 12,
      textAlign: 'left',
      bold: true,
      borderWidthPx: 1,
      borderRadiusPx: 6,
      paddingYpx: 6,
      paddingXpx: 10,
      marginTopPx: 10,
      marginBottomPx: 6,
    },
    rowStripeEnabled: false,
    rowStripeColor: '#F9FBFF',
    abnormalRowBackgroundColor: '#FFF5F5',
    referenceValueColor: '#333333',
    showStatusColumn: true,
    showDepartmentRow: true,
    departmentRowStyle: {
      backgroundColor: '#222222',
      textColor: '#FFFFFF',
      borderColor: '#222222',
      fontFamily: DEFAULT_REPORT_FONT_FAMILY,
      fontSizePx: 12,
      textAlign: 'left',
      paddingYpx: 8,
      paddingXpx: 12,
      borderRadiusPx: 0,
    },
    showCategoryRow: true,
    categoryRowStyle: {
      backgroundColor: '#F2F2F2',
      textColor: '#555555',
      borderColor: '#EEEEEE',
      fontFamily: DEFAULT_REPORT_FONT_FAMILY,
      fontSizePx: 12,
      textAlign: 'left',
      paddingYpx: 6,
      paddingXpx: 12,
      borderRadiusPx: 0,
    },
    statusNormalColor: '#0F8A1F',
    statusHighColor: '#D00000',
    statusLowColor: '#0066CC',
    regularDepartmentBlockBreak: 'avoid',
    regularRowBreak: 'avoid',
    panelTableBreak: 'auto',
    panelRowBreak: 'avoid',
    testColumn: {
      textColor: '#333333',
      fontSizePx: 12,
      textAlign: 'left',
      bold: false,
    },
    resultColumn: {
      textColor: '#333333',
      fontSizePx: 12,
      textAlign: 'left',
      bold: false,
    },
    unitColumn: {
      textColor: '#333333',
      fontSizePx: 12,
      textAlign: 'left',
      bold: false,
    },
    statusColumn: {
      textColor: '#333333',
      fontSizePx: 12,
      textAlign: 'left',
      bold: false,
    },
    referenceColumn: {
      textColor: '#333333',
      fontSizePx: 12,
      textAlign: 'left',
      bold: false,
    },
  },
  pageLayout: {
    pageMarginTopMm: 3,
    pageMarginRightMm: 3,
    pageMarginBottomMm: 3,
    pageMarginLeftMm: 3,
    contentMarginXMm: 3,
  },
  cultureSection: {
    fontFamily: DEFAULT_REPORT_FONT_FAMILY,
    sectionTitleColor: '#111111',
    sectionTitleBorderColor: '#222222',
    sectionTitleAlign: 'left',
    noGrowthBackgroundColor: '#F7FEF9',
    noGrowthBorderColor: '#BBF7D0',
    noGrowthTextColor: '#166534',
    noGrowthPaddingYpx: 8,
    noGrowthPaddingXpx: 10,
    metaTextColor: '#334155',
    metaTextAlign: 'left',
    commentTextColor: '#4B5563',
    commentTextAlign: 'left',
    notesTextColor: '#111827',
    notesBorderColor: '#D1D5DB',
    notesTextAlign: 'left',
    notesPaddingYpx: 6,
    notesPaddingXpx: 0,
    astGridGapPx: 6,
    astMinHeightPx: 430,
    astColumnBorderRadiusPx: 6,
    astColumnPaddingPx: 7,
    astColumnTitleColor: '#111827',
    astColumnTitleBorderColor: '#E5E7EB',
    astBodyTextColor: '#111827',
    astEmptyTextColor: '#64748B',
    astSensitiveBorderColor: '#BBF7D0',
    astSensitiveBackgroundColor: '#F8FFFB',
    astIntermediateBorderColor: '#FDE68A',
    astIntermediateBackgroundColor: '#FFFDF5',
    astResistanceBorderColor: '#FECACA',
    astResistanceBackgroundColor: '#FFF8F8',
  },
};

const HEX_COLOR_REGEX = /^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const TEXT_ALIGN_SET = new Set<ReportTextAlign>(['left', 'center', 'right']);
const BREAK_BEHAVIOR_SET = new Set<'auto' | 'avoid'>(['auto', 'avoid']);
const REPORT_FONT_FAMILY_SET = new Set<ReportFontFamily>(REPORT_FONT_FAMILY_VALUES);
const REPORT_COLUMN_KEYS: Array<keyof ReportColumnStyle> = [
  'textColor',
  'fontSizePx',
  'textAlign',
  'bold',
];
const REPORT_RESULTS_SECTION_STYLE_KEYS: Array<keyof ReportResultsTableSectionStyle> = [
  'textColor',
  'borderColor',
  'fontFamily',
  'fontSizePx',
  'textAlign',
  'paddingYpx',
  'paddingXpx',
  'borderRadiusPx',
];
const REPORT_RESULTS_FILLED_SECTION_STYLE_KEYS: Array<keyof ReportResultsTableFilledSectionStyle> = [
  'backgroundColor',
  'textColor',
  'borderColor',
  'fontFamily',
  'fontSizePx',
  'textAlign',
  'paddingYpx',
  'paddingXpx',
  'borderRadiusPx',
];
const REPORT_PANEL_SECTION_STYLE_KEYS: Array<keyof ReportPanelSectionStyle> = [
  'backgroundColor',
  'textColor',
  'borderColor',
  'fontFamily',
  'fontSizePx',
  'textAlign',
  'bold',
  'borderWidthPx',
  'borderRadiusPx',
  'paddingYpx',
  'paddingXpx',
  'marginTopPx',
  'marginBottomPx',
];
const REPORT_TITLE_KEYS: Array<keyof ReportTitleStyle> = [
  'text',
  'textColor',
  'fontSizePx',
  'textAlign',
  'bold',
  'underline',
  'paddingYpx',
  'paddingXpx',
];
const PATIENT_INFO_CELL_STYLE_KEYS: Array<keyof ReportPatientInfoCellStyle> = [
  'backgroundColor',
  'textColor',
  'fontFamily',
  'fontSizePx',
  'fontWeight',
  'textAlign',
  'paddingYpx',
  'paddingXpx',
];
const RESULTS_TABLE_COLUMN_STYLE_KEYS = [
  'testColumn',
  'resultColumn',
  'unitColumn',
  'statusColumn',
  'referenceColumn',
] as const satisfies readonly (keyof ReportResultsTableStyle)[];
const PATIENT_INFO_KEYS: Array<keyof ReportPatientInfoStyle> = [
  'backgroundColor',
  'borderColor',
  'borderRadiusPx',
  'paddingYpx',
  'paddingXpx',
  'marginTopPx',
  'marginBottomPx',
  'dividerWidthPx',
  'labelCellStyle',
  'valueCellStyle',
];
const RESULTS_TABLE_KEYS: Array<keyof ReportResultsTableStyle> = [
  'headerStyle',
  'bodyStyle',
  'panelSectionStyle',
  'rowStripeEnabled',
  'rowStripeColor',
  'abnormalRowBackgroundColor',
  'referenceValueColor',
  'showStatusColumn',
  'showDepartmentRow',
  'departmentRowStyle',
  'showCategoryRow',
  'categoryRowStyle',
  'statusNormalColor',
  'statusHighColor',
  'statusLowColor',
  'regularDepartmentBlockBreak',
  'regularRowBreak',
  'panelTableBreak',
  'panelRowBreak',
  'testColumn',
  'resultColumn',
  'unitColumn',
  'statusColumn',
  'referenceColumn',
];
const REPORT_STYLE_KEYS: Array<keyof ReportStyleConfig> = [
  'version',
  'patientInfo',
  'reportTitle',
  'resultsTable',
  'pageLayout',
  'cultureSection',
];
const PAGE_LAYOUT_KEYS: Array<keyof ReportPageLayoutStyle> = [
  'pageMarginTopMm',
  'pageMarginRightMm',
  'pageMarginBottomMm',
  'pageMarginLeftMm',
  'contentMarginXMm',
];
const CULTURE_SECTION_KEYS: Array<keyof ReportCultureSectionStyle> = [
  'fontFamily',
  'sectionTitleColor',
  'sectionTitleBorderColor',
  'sectionTitleAlign',
  'noGrowthBackgroundColor',
  'noGrowthBorderColor',
  'noGrowthTextColor',
  'noGrowthPaddingYpx',
  'noGrowthPaddingXpx',
  'metaTextColor',
  'metaTextAlign',
  'commentTextColor',
  'commentTextAlign',
  'notesTextColor',
  'notesBorderColor',
  'notesTextAlign',
  'notesPaddingYpx',
  'notesPaddingXpx',
  'astGridGapPx',
  'astMinHeightPx',
  'astColumnBorderRadiusPx',
  'astColumnPaddingPx',
  'astColumnTitleColor',
  'astColumnTitleBorderColor',
  'astBodyTextColor',
  'astEmptyTextColor',
  'astSensitiveBorderColor',
  'astSensitiveBackgroundColor',
  'astIntermediateBorderColor',
  'astIntermediateBackgroundColor',
  'astResistanceBorderColor',
  'astResistanceBackgroundColor',
];

function assertObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  fieldName: string,
): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${fieldName} contains unknown keys: ${unknown.join(', ')}`);
  }
  const missing = keys.filter((key) => !(key in value));
  if (missing.length > 0) {
    throw new Error(`${fieldName} is missing keys: ${missing.join(', ')}`);
  }
}

function assertColor(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !HEX_COLOR_REGEX.test(value.trim())) {
    throw new Error(`${fieldName} must be a valid color (#RRGGBB or #RRGGBBAA)`);
  }
  return value.trim().toUpperCase();
}

function assertIntRange(value: unknown, min: number, max: number, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return value;
}

function assertStringLength(value: unknown, min: number, max: number, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max} characters`);
  }
  return normalized;
}

function assertFromSet<T extends string>(value: unknown, set: Set<T>, fieldName: string): T {
  if (typeof value !== 'string' || !set.has(value as T)) {
    throw new Error(`${fieldName} must be one of: ${Array.from(set).join(', ')}`);
  }
  return value as T;
}

function assertBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be boolean`);
  }
  return value;
}

function pickDefinedEntries<T extends Record<string, unknown>>(value: Partial<T>): Partial<T> {
  const normalized: Partial<T> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue !== undefined) {
      (normalized as Record<string, unknown>)[key] = entryValue;
    }
  }
  return normalized;
}

function validateColumnStyle(value: unknown, fieldName: string): ReportColumnStyle {
  const columnObj = assertObject(value, fieldName);
  assertExactKeys(columnObj, REPORT_COLUMN_KEYS, fieldName);
  return {
    textColor: assertColor(columnObj.textColor, `${fieldName}.textColor`),
    fontSizePx: assertIntRange(columnObj.fontSizePx, 9, 16, `${fieldName}.fontSizePx`),
    textAlign: assertFromSet(columnObj.textAlign, TEXT_ALIGN_SET, `${fieldName}.textAlign`),
    bold: assertBoolean(columnObj.bold, `${fieldName}.bold`),
  };
}

function validateResultsTableSectionStyle(
  value: unknown,
  fieldName: string,
): ReportResultsTableSectionStyle {
  const sectionObj = assertObject(value, fieldName);
  assertExactKeys(sectionObj, REPORT_RESULTS_SECTION_STYLE_KEYS, fieldName);
  return {
    textColor: assertColor(sectionObj.textColor, `${fieldName}.textColor`),
    borderColor: assertColor(sectionObj.borderColor, `${fieldName}.borderColor`),
    fontFamily: assertFromSet(sectionObj.fontFamily, REPORT_FONT_FAMILY_SET, `${fieldName}.fontFamily`),
    fontSizePx: assertIntRange(sectionObj.fontSizePx, 9, 16, `${fieldName}.fontSizePx`),
    textAlign: assertFromSet(sectionObj.textAlign, TEXT_ALIGN_SET, `${fieldName}.textAlign`),
    paddingYpx: assertIntRange(sectionObj.paddingYpx, 0, 20, `${fieldName}.paddingYpx`),
    paddingXpx: assertIntRange(sectionObj.paddingXpx, 0, 24, `${fieldName}.paddingXpx`),
    borderRadiusPx: assertIntRange(sectionObj.borderRadiusPx, 0, 24, `${fieldName}.borderRadiusPx`),
  };
}

function validateResultsTableFilledSectionStyle(
  value: unknown,
  fieldName: string,
): ReportResultsTableFilledSectionStyle {
  const sectionObj = assertObject(value, fieldName);
  assertExactKeys(sectionObj, REPORT_RESULTS_FILLED_SECTION_STYLE_KEYS, fieldName);
  return {
    backgroundColor: assertColor(sectionObj.backgroundColor, `${fieldName}.backgroundColor`),
    textColor: assertColor(sectionObj.textColor, `${fieldName}.textColor`),
    borderColor: assertColor(sectionObj.borderColor, `${fieldName}.borderColor`),
    fontFamily: assertFromSet(sectionObj.fontFamily, REPORT_FONT_FAMILY_SET, `${fieldName}.fontFamily`),
    fontSizePx: assertIntRange(sectionObj.fontSizePx, 9, 16, `${fieldName}.fontSizePx`),
    textAlign: assertFromSet(sectionObj.textAlign, TEXT_ALIGN_SET, `${fieldName}.textAlign`),
    paddingYpx: assertIntRange(sectionObj.paddingYpx, 0, 20, `${fieldName}.paddingYpx`),
    paddingXpx: assertIntRange(sectionObj.paddingXpx, 0, 24, `${fieldName}.paddingXpx`),
    borderRadiusPx: assertIntRange(sectionObj.borderRadiusPx, 0, 24, `${fieldName}.borderRadiusPx`),
  };
}

function validatePanelSectionStyle(
  value: unknown,
  fieldName: string,
): ReportPanelSectionStyle {
  const sectionObj = assertObject(value, fieldName);
  assertExactKeys(sectionObj, REPORT_PANEL_SECTION_STYLE_KEYS, fieldName);
  return {
    backgroundColor: assertColor(sectionObj.backgroundColor, `${fieldName}.backgroundColor`),
    textColor: assertColor(sectionObj.textColor, `${fieldName}.textColor`),
    borderColor: assertColor(sectionObj.borderColor, `${fieldName}.borderColor`),
    fontFamily: assertFromSet(sectionObj.fontFamily, REPORT_FONT_FAMILY_SET, `${fieldName}.fontFamily`),
    fontSizePx: assertIntRange(sectionObj.fontSizePx, 9, 18, `${fieldName}.fontSizePx`),
    textAlign: assertFromSet(sectionObj.textAlign, TEXT_ALIGN_SET, `${fieldName}.textAlign`),
    bold: assertBoolean(sectionObj.bold, `${fieldName}.bold`),
    borderWidthPx: assertIntRange(sectionObj.borderWidthPx, 0, 4, `${fieldName}.borderWidthPx`),
    borderRadiusPx: assertIntRange(sectionObj.borderRadiusPx, 0, 16, `${fieldName}.borderRadiusPx`),
    paddingYpx: assertIntRange(sectionObj.paddingYpx, 0, 20, `${fieldName}.paddingYpx`),
    paddingXpx: assertIntRange(sectionObj.paddingXpx, 0, 24, `${fieldName}.paddingXpx`),
    marginTopPx: assertIntRange(sectionObj.marginTopPx, 0, 24, `${fieldName}.marginTopPx`),
    marginBottomPx: assertIntRange(sectionObj.marginBottomPx, 0, 24, `${fieldName}.marginBottomPx`),
  };
}

function validateReportTitleStyle(value: unknown, fieldName: string): ReportTitleStyle {
  const titleObj = assertObject(value, fieldName);
  assertExactKeys(titleObj, REPORT_TITLE_KEYS, fieldName);
  return {
    text: assertStringLength(titleObj.text, 0, 80, `${fieldName}.text`),
    textColor: assertColor(titleObj.textColor, `${fieldName}.textColor`),
    fontSizePx: assertIntRange(titleObj.fontSizePx, 14, 28, `${fieldName}.fontSizePx`),
    textAlign: assertFromSet(titleObj.textAlign, TEXT_ALIGN_SET, `${fieldName}.textAlign`),
    bold: assertBoolean(titleObj.bold, `${fieldName}.bold`),
    underline: assertBoolean(titleObj.underline, `${fieldName}.underline`),
    paddingYpx: assertIntRange(titleObj.paddingYpx, 0, 20, `${fieldName}.paddingYpx`),
    paddingXpx: assertIntRange(titleObj.paddingXpx, 0, 24, `${fieldName}.paddingXpx`),
  };
}

function validatePatientInfoCellStyle(
  value: unknown,
  fieldName: string,
  allowedWeights: readonly number[],
): ReportPatientInfoCellStyle {
  const cellObj = assertObject(value, fieldName);
  assertExactKeys(cellObj, PATIENT_INFO_CELL_STYLE_KEYS, fieldName);
  const fontWeight = assertIntRange(cellObj.fontWeight, 400, 800, `${fieldName}.fontWeight`);
  if (!allowedWeights.includes(fontWeight)) {
    throw new Error(`${fieldName}.fontWeight must be one of: ${allowedWeights.join(', ')}`);
  }
  return {
    backgroundColor: assertColor(cellObj.backgroundColor, `${fieldName}.backgroundColor`),
    textColor: assertColor(cellObj.textColor, `${fieldName}.textColor`),
    fontFamily: assertFromSet(cellObj.fontFamily, REPORT_FONT_FAMILY_SET, `${fieldName}.fontFamily`),
    fontSizePx: assertIntRange(cellObj.fontSizePx, 10, 18, `${fieldName}.fontSizePx`),
    fontWeight: fontWeight as ReportPatientInfoCellStyle['fontWeight'],
    textAlign: assertFromSet(cellObj.textAlign, TEXT_ALIGN_SET, `${fieldName}.textAlign`),
    paddingYpx: assertIntRange(cellObj.paddingYpx, 0, 20, `${fieldName}.paddingYpx`),
    paddingXpx: assertIntRange(cellObj.paddingXpx, 0, 24, `${fieldName}.paddingXpx`),
  };
}

export function validateAndNormalizeReportStyleConfig(
  value: unknown,
  fieldName = 'reportStyle',
): ReportStyleConfig {
  const styleObj = assertObject(value, fieldName);
  assertExactKeys(styleObj, REPORT_STYLE_KEYS, fieldName);

  const version = styleObj.version;
  if (version !== 1) {
    throw new Error(`${fieldName}.version must be 1`);
  }

  const patientInfoObj = assertObject(styleObj.patientInfo, `${fieldName}.patientInfo`);
  assertExactKeys(patientInfoObj, PATIENT_INFO_KEYS, `${fieldName}.patientInfo`);
  const patientInfo: ReportPatientInfoStyle = {
    backgroundColor: assertColor(patientInfoObj.backgroundColor, `${fieldName}.patientInfo.backgroundColor`),
    borderColor: assertColor(patientInfoObj.borderColor, `${fieldName}.patientInfo.borderColor`),
    borderRadiusPx: assertIntRange(
      patientInfoObj.borderRadiusPx,
      0,
      12,
      `${fieldName}.patientInfo.borderRadiusPx`,
    ),
    paddingYpx: assertIntRange(patientInfoObj.paddingYpx, 6, 18, `${fieldName}.patientInfo.paddingYpx`),
    paddingXpx: assertIntRange(patientInfoObj.paddingXpx, 8, 24, `${fieldName}.patientInfo.paddingXpx`),
    marginTopPx: assertIntRange(patientInfoObj.marginTopPx, 0, 24, `${fieldName}.patientInfo.marginTopPx`),
    marginBottomPx: assertIntRange(
      patientInfoObj.marginBottomPx,
      0,
      24,
      `${fieldName}.patientInfo.marginBottomPx`,
    ),
    dividerWidthPx: assertIntRange(patientInfoObj.dividerWidthPx, 0, 3, `${fieldName}.patientInfo.dividerWidthPx`),
    labelCellStyle: validatePatientInfoCellStyle(
      patientInfoObj.labelCellStyle,
      `${fieldName}.patientInfo.labelCellStyle`,
      [600, 700, 800],
    ),
    valueCellStyle: validatePatientInfoCellStyle(
      patientInfoObj.valueCellStyle,
      `${fieldName}.patientInfo.valueCellStyle`,
      [400, 500, 600, 700],
    ),
  };

  const reportTitle = validateReportTitleStyle(styleObj.reportTitle, `${fieldName}.reportTitle`);

  const resultsObj = assertObject(styleObj.resultsTable, `${fieldName}.resultsTable`);
  assertExactKeys(resultsObj, RESULTS_TABLE_KEYS, `${fieldName}.resultsTable`);
  const resultsTable: ReportResultsTableStyle = {
    headerStyle: validateResultsTableFilledSectionStyle(
      resultsObj.headerStyle,
      `${fieldName}.resultsTable.headerStyle`,
    ),
    bodyStyle: validateResultsTableSectionStyle(
      resultsObj.bodyStyle,
      `${fieldName}.resultsTable.bodyStyle`,
    ),
    panelSectionStyle: validatePanelSectionStyle(
      resultsObj.panelSectionStyle,
      `${fieldName}.resultsTable.panelSectionStyle`,
    ),
    rowStripeEnabled: assertBoolean(resultsObj.rowStripeEnabled, `${fieldName}.resultsTable.rowStripeEnabled`),
    rowStripeColor: assertColor(resultsObj.rowStripeColor, `${fieldName}.resultsTable.rowStripeColor`),
    abnormalRowBackgroundColor: assertColor(
      resultsObj.abnormalRowBackgroundColor,
      `${fieldName}.resultsTable.abnormalRowBackgroundColor`,
    ),
    referenceValueColor: assertColor(
      resultsObj.referenceValueColor,
      `${fieldName}.resultsTable.referenceValueColor`,
    ),
    showStatusColumn: assertBoolean(
      resultsObj.showStatusColumn,
      `${fieldName}.resultsTable.showStatusColumn`,
    ),
    showDepartmentRow: assertBoolean(
      resultsObj.showDepartmentRow,
      `${fieldName}.resultsTable.showDepartmentRow`,
    ),
    departmentRowStyle: validateResultsTableFilledSectionStyle(
      resultsObj.departmentRowStyle,
      `${fieldName}.resultsTable.departmentRowStyle`,
    ),
    showCategoryRow: assertBoolean(
      resultsObj.showCategoryRow,
      `${fieldName}.resultsTable.showCategoryRow`,
    ),
    categoryRowStyle: validateResultsTableFilledSectionStyle(
      resultsObj.categoryRowStyle,
      `${fieldName}.resultsTable.categoryRowStyle`,
    ),
    statusNormalColor: assertColor(resultsObj.statusNormalColor, `${fieldName}.resultsTable.statusNormalColor`),
    statusHighColor: assertColor(resultsObj.statusHighColor, `${fieldName}.resultsTable.statusHighColor`),
    statusLowColor: assertColor(resultsObj.statusLowColor, `${fieldName}.resultsTable.statusLowColor`),
    regularDepartmentBlockBreak: assertFromSet(
      resultsObj.regularDepartmentBlockBreak,
      BREAK_BEHAVIOR_SET,
      `${fieldName}.resultsTable.regularDepartmentBlockBreak`,
    ),
    regularRowBreak: assertFromSet(
      resultsObj.regularRowBreak,
      BREAK_BEHAVIOR_SET,
      `${fieldName}.resultsTable.regularRowBreak`,
    ),
    panelTableBreak: assertFromSet(
      resultsObj.panelTableBreak,
      BREAK_BEHAVIOR_SET,
      `${fieldName}.resultsTable.panelTableBreak`,
    ),
    panelRowBreak: assertFromSet(
      resultsObj.panelRowBreak,
      BREAK_BEHAVIOR_SET,
      `${fieldName}.resultsTable.panelRowBreak`,
    ),
    testColumn: validateColumnStyle(resultsObj.testColumn, `${fieldName}.resultsTable.testColumn`),
    resultColumn: validateColumnStyle(resultsObj.resultColumn, `${fieldName}.resultsTable.resultColumn`),
    unitColumn: validateColumnStyle(resultsObj.unitColumn, `${fieldName}.resultsTable.unitColumn`),
    statusColumn: validateColumnStyle(resultsObj.statusColumn, `${fieldName}.resultsTable.statusColumn`),
    referenceColumn: validateColumnStyle(
      resultsObj.referenceColumn,
      `${fieldName}.resultsTable.referenceColumn`,
    ),
  };

  const pageLayoutObj = assertObject(styleObj.pageLayout, `${fieldName}.pageLayout`);
  assertExactKeys(pageLayoutObj, PAGE_LAYOUT_KEYS, `${fieldName}.pageLayout`);
  const pageLayout: ReportPageLayoutStyle = {
    pageMarginTopMm: assertIntRange(
      pageLayoutObj.pageMarginTopMm,
      0,
      20,
      `${fieldName}.pageLayout.pageMarginTopMm`,
    ),
    pageMarginRightMm: assertIntRange(
      pageLayoutObj.pageMarginRightMm,
      0,
      20,
      `${fieldName}.pageLayout.pageMarginRightMm`,
    ),
    pageMarginBottomMm: assertIntRange(
      pageLayoutObj.pageMarginBottomMm,
      0,
      20,
      `${fieldName}.pageLayout.pageMarginBottomMm`,
    ),
    pageMarginLeftMm: assertIntRange(
      pageLayoutObj.pageMarginLeftMm,
      0,
      20,
      `${fieldName}.pageLayout.pageMarginLeftMm`,
    ),
    contentMarginXMm: assertIntRange(
      pageLayoutObj.contentMarginXMm,
      0,
      20,
      `${fieldName}.pageLayout.contentMarginXMm`,
    ),
  };

  const cultureSectionObj = assertObject(styleObj.cultureSection, `${fieldName}.cultureSection`);
  assertExactKeys(cultureSectionObj, CULTURE_SECTION_KEYS, `${fieldName}.cultureSection`);
  const cultureSection: ReportCultureSectionStyle = {
    fontFamily: assertFromSet(
      cultureSectionObj.fontFamily,
      REPORT_FONT_FAMILY_SET,
      `${fieldName}.cultureSection.fontFamily`,
    ),
    sectionTitleColor: assertColor(
      cultureSectionObj.sectionTitleColor,
      `${fieldName}.cultureSection.sectionTitleColor`,
    ),
    sectionTitleBorderColor: assertColor(
      cultureSectionObj.sectionTitleBorderColor,
      `${fieldName}.cultureSection.sectionTitleBorderColor`,
    ),
    sectionTitleAlign: assertFromSet(
      cultureSectionObj.sectionTitleAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.cultureSection.sectionTitleAlign`,
    ),
    noGrowthBackgroundColor: assertColor(
      cultureSectionObj.noGrowthBackgroundColor,
      `${fieldName}.cultureSection.noGrowthBackgroundColor`,
    ),
    noGrowthBorderColor: assertColor(
      cultureSectionObj.noGrowthBorderColor,
      `${fieldName}.cultureSection.noGrowthBorderColor`,
    ),
    noGrowthTextColor: assertColor(
      cultureSectionObj.noGrowthTextColor,
      `${fieldName}.cultureSection.noGrowthTextColor`,
    ),
    noGrowthPaddingYpx: assertIntRange(
      cultureSectionObj.noGrowthPaddingYpx,
      0,
      20,
      `${fieldName}.cultureSection.noGrowthPaddingYpx`,
    ),
    noGrowthPaddingXpx: assertIntRange(
      cultureSectionObj.noGrowthPaddingXpx,
      0,
      24,
      `${fieldName}.cultureSection.noGrowthPaddingXpx`,
    ),
    metaTextColor: assertColor(
      cultureSectionObj.metaTextColor,
      `${fieldName}.cultureSection.metaTextColor`,
    ),
    metaTextAlign: assertFromSet(
      cultureSectionObj.metaTextAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.cultureSection.metaTextAlign`,
    ),
    commentTextColor: assertColor(
      cultureSectionObj.commentTextColor,
      `${fieldName}.cultureSection.commentTextColor`,
    ),
    commentTextAlign: assertFromSet(
      cultureSectionObj.commentTextAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.cultureSection.commentTextAlign`,
    ),
    notesTextColor: assertColor(
      cultureSectionObj.notesTextColor,
      `${fieldName}.cultureSection.notesTextColor`,
    ),
    notesBorderColor: assertColor(
      cultureSectionObj.notesBorderColor,
      `${fieldName}.cultureSection.notesBorderColor`,
    ),
    notesTextAlign: assertFromSet(
      cultureSectionObj.notesTextAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.cultureSection.notesTextAlign`,
    ),
    notesPaddingYpx: assertIntRange(
      cultureSectionObj.notesPaddingYpx,
      0,
      20,
      `${fieldName}.cultureSection.notesPaddingYpx`,
    ),
    notesPaddingXpx: assertIntRange(
      cultureSectionObj.notesPaddingXpx,
      0,
      24,
      `${fieldName}.cultureSection.notesPaddingXpx`,
    ),
    astGridGapPx: assertIntRange(
      cultureSectionObj.astGridGapPx,
      2,
      16,
      `${fieldName}.cultureSection.astGridGapPx`,
    ),
    astMinHeightPx: assertIntRange(
      cultureSectionObj.astMinHeightPx,
      120,
      700,
      `${fieldName}.cultureSection.astMinHeightPx`,
    ),
    astColumnBorderRadiusPx: assertIntRange(
      cultureSectionObj.astColumnBorderRadiusPx,
      0,
      16,
      `${fieldName}.cultureSection.astColumnBorderRadiusPx`,
    ),
    astColumnPaddingPx: assertIntRange(
      cultureSectionObj.astColumnPaddingPx,
      2,
      16,
      `${fieldName}.cultureSection.astColumnPaddingPx`,
    ),
    astColumnTitleColor: assertColor(
      cultureSectionObj.astColumnTitleColor,
      `${fieldName}.cultureSection.astColumnTitleColor`,
    ),
    astColumnTitleBorderColor: assertColor(
      cultureSectionObj.astColumnTitleBorderColor,
      `${fieldName}.cultureSection.astColumnTitleBorderColor`,
    ),
    astBodyTextColor: assertColor(
      cultureSectionObj.astBodyTextColor,
      `${fieldName}.cultureSection.astBodyTextColor`,
    ),
    astEmptyTextColor: assertColor(
      cultureSectionObj.astEmptyTextColor,
      `${fieldName}.cultureSection.astEmptyTextColor`,
    ),
    astSensitiveBorderColor: assertColor(
      cultureSectionObj.astSensitiveBorderColor,
      `${fieldName}.cultureSection.astSensitiveBorderColor`,
    ),
    astSensitiveBackgroundColor: assertColor(
      cultureSectionObj.astSensitiveBackgroundColor,
      `${fieldName}.cultureSection.astSensitiveBackgroundColor`,
    ),
    astIntermediateBorderColor: assertColor(
      cultureSectionObj.astIntermediateBorderColor,
      `${fieldName}.cultureSection.astIntermediateBorderColor`,
    ),
    astIntermediateBackgroundColor: assertColor(
      cultureSectionObj.astIntermediateBackgroundColor,
      `${fieldName}.cultureSection.astIntermediateBackgroundColor`,
    ),
    astResistanceBorderColor: assertColor(
      cultureSectionObj.astResistanceBorderColor,
      `${fieldName}.cultureSection.astResistanceBorderColor`,
    ),
    astResistanceBackgroundColor: assertColor(
      cultureSectionObj.astResistanceBackgroundColor,
      `${fieldName}.cultureSection.astResistanceBackgroundColor`,
    ),
  };

  return {
    version: 1,
    patientInfo,
    reportTitle,
    resultsTable,
    pageLayout,
    cultureSection,
  };
}

export function resolveReportStyleConfig(value: unknown): ReportStyleConfig {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_REPORT_STYLE_V1;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return resolveReportStyleConfig(parsed);
    } catch {
      return DEFAULT_REPORT_STYLE_V1;
    }
  }

  try {
    return validateAndNormalizeReportStyleConfig(value);
  } catch {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return DEFAULT_REPORT_STYLE_V1;
    }
    const raw = value as Record<string, unknown>;
    const rawPatientInfo =
      raw.patientInfo && typeof raw.patientInfo === 'object' && !Array.isArray(raw.patientInfo)
        ? (raw.patientInfo as Record<string, unknown>)
        : {};
    const rawReportTitle =
      raw.reportTitle && typeof raw.reportTitle === 'object' && !Array.isArray(raw.reportTitle)
        ? (raw.reportTitle as Record<string, unknown>)
        : {};
    const rawResultsTable =
      raw.resultsTable && typeof raw.resultsTable === 'object' && !Array.isArray(raw.resultsTable)
        ? (raw.resultsTable as Record<string, unknown>)
        : {};
    const rawPageLayout =
      raw.pageLayout && typeof raw.pageLayout === 'object' && !Array.isArray(raw.pageLayout)
        ? (raw.pageLayout as Record<string, unknown>)
        : {};
    const rawCultureSection =
      raw.cultureSection && typeof raw.cultureSection === 'object' && !Array.isArray(raw.cultureSection)
        ? (raw.cultureSection as Record<string, unknown>)
        : {};

    const upgradedPatientInfo: Record<string, unknown> = {
      ...DEFAULT_REPORT_STYLE_V1.patientInfo,
    };
    for (const key of PATIENT_INFO_KEYS) {
      if (key === 'labelCellStyle' || key === 'valueCellStyle') {
        continue;
      }
      if (key in rawPatientInfo) {
        upgradedPatientInfo[key] = rawPatientInfo[key];
      }
    }

    const legacyPatientInfo = rawPatientInfo as Record<string, unknown>;
    const upgradePatientCellStyle = (
      key: 'labelCellStyle' | 'valueCellStyle',
      defaults: ReportPatientInfoCellStyle,
      legacy: Partial<ReportPatientInfoCellStyle>,
    ) => {
      const rawCell =
        rawPatientInfo[key] && typeof rawPatientInfo[key] === 'object' && !Array.isArray(rawPatientInfo[key])
          ? (rawPatientInfo[key] as Record<string, unknown>)
          : null;
      const upgradedCell: Record<string, unknown> = {
        ...defaults,
        ...pickDefinedEntries(legacy),
      };
      if (rawCell) {
        for (const cellKey of PATIENT_INFO_CELL_STYLE_KEYS) {
          if (cellKey in rawCell) {
            upgradedCell[cellKey] = rawCell[cellKey];
          }
        }
      }
      upgradedPatientInfo[key] = upgradedCell;
    };

    upgradePatientCellStyle('labelCellStyle', DEFAULT_REPORT_STYLE_V1.patientInfo.labelCellStyle, {
      backgroundColor: legacyPatientInfo.backgroundColor as string | undefined,
      textColor: legacyPatientInfo.labelColor as string | undefined,
      fontFamily: legacyPatientInfo.fontFamily as ReportFontFamily | undefined,
      fontSizePx: legacyPatientInfo.fontSizePx as number | undefined,
      fontWeight: legacyPatientInfo.labelFontWeight as ReportPatientInfoCellStyle['fontWeight'] | undefined,
      textAlign:
        (legacyPatientInfo.labelTextAlign as ReportTextAlign | undefined) ??
        (legacyPatientInfo.textAlign as ReportTextAlign | undefined),
    });
    upgradePatientCellStyle('valueCellStyle', DEFAULT_REPORT_STYLE_V1.patientInfo.valueCellStyle, {
      backgroundColor: legacyPatientInfo.backgroundColor as string | undefined,
      textColor: legacyPatientInfo.textColor as string | undefined,
      fontFamily: legacyPatientInfo.fontFamily as ReportFontFamily | undefined,
      fontSizePx: legacyPatientInfo.fontSizePx as number | undefined,
      fontWeight: legacyPatientInfo.valueFontWeight as ReportPatientInfoCellStyle['fontWeight'] | undefined,
      textAlign:
        (legacyPatientInfo.valueTextAlign as ReportTextAlign | undefined) ??
        (legacyPatientInfo.textAlign as ReportTextAlign | undefined),
    });

    const upgradedReportTitle: Record<string, unknown> = {
      ...DEFAULT_REPORT_STYLE_V1.reportTitle,
    };
    for (const key of REPORT_TITLE_KEYS) {
      if (key in rawReportTitle) {
        upgradedReportTitle[key] = rawReportTitle[key];
      }
    }

    const upgradedResultsTable: Record<string, unknown> = {
      ...DEFAULT_REPORT_STYLE_V1.resultsTable,
    };
    for (const key of RESULTS_TABLE_KEYS) {
      if (
        (RESULTS_TABLE_COLUMN_STYLE_KEYS as readonly string[]).includes(key) ||
        key === 'headerStyle' ||
        key === 'bodyStyle' ||
        key === 'panelSectionStyle' ||
        key === 'departmentRowStyle' ||
        key === 'categoryRowStyle'
      ) {
        continue;
      }
      if (key in rawResultsTable) {
        upgradedResultsTable[key] = rawResultsTable[key];
      }
    }

    const legacyResultsTable = rawResultsTable as Record<string, unknown>;
    const legacySharedFontFamily = legacyResultsTable.fontFamily ?? DEFAULT_REPORT_STYLE_V1.resultsTable.bodyStyle.fontFamily;
    const legacySharedBorderColor = legacyResultsTable.borderColor ?? DEFAULT_REPORT_STYLE_V1.resultsTable.bodyStyle.borderColor;

    const upgradeFilledSection = (
      key: 'headerStyle' | 'departmentRowStyle' | 'categoryRowStyle',
      defaults: ReportResultsTableFilledSectionStyle,
      legacy: Partial<ReportResultsTableFilledSectionStyle>,
    ) => {
      const rawSection =
        rawResultsTable[key] && typeof rawResultsTable[key] === 'object' && !Array.isArray(rawResultsTable[key])
          ? (rawResultsTable[key] as Record<string, unknown>)
          : null;
      const upgradedSection: Record<string, unknown> = {
        ...defaults,
        fontFamily: legacySharedFontFamily,
        borderColor: legacySharedBorderColor,
        ...pickDefinedEntries(legacy),
      };
      if (rawSection) {
        for (const sectionKey of REPORT_RESULTS_FILLED_SECTION_STYLE_KEYS) {
          if (sectionKey in rawSection) {
            upgradedSection[sectionKey] = rawSection[sectionKey];
          }
        }
      }
      upgradedResultsTable[key] = upgradedSection;
    };

    const upgradeSection = (
      key: 'bodyStyle',
      defaults: ReportResultsTableSectionStyle,
      legacy: Partial<ReportResultsTableSectionStyle>,
    ) => {
      const rawSection =
        rawResultsTable[key] && typeof rawResultsTable[key] === 'object' && !Array.isArray(rawResultsTable[key])
          ? (rawResultsTable[key] as Record<string, unknown>)
          : null;
      const upgradedSection: Record<string, unknown> = {
        ...defaults,
        fontFamily: legacySharedFontFamily,
        borderColor: legacySharedBorderColor,
        ...pickDefinedEntries(legacy),
      };
      if (rawSection) {
        for (const sectionKey of REPORT_RESULTS_SECTION_STYLE_KEYS) {
          if (sectionKey in rawSection) {
            upgradedSection[sectionKey] = rawSection[sectionKey];
          }
        }
      }
      upgradedResultsTable[key] = upgradedSection;
    };

    const upgradePanelSection = (
      defaults: ReportPanelSectionStyle,
      legacy: Partial<ReportPanelSectionStyle>,
    ) => {
      const rawSection =
        rawResultsTable.panelSectionStyle &&
        typeof rawResultsTable.panelSectionStyle === 'object' &&
        !Array.isArray(rawResultsTable.panelSectionStyle)
          ? (rawResultsTable.panelSectionStyle as Record<string, unknown>)
          : null;
      const upgradedSection: Record<string, unknown> = {
        ...defaults,
        fontFamily: legacySharedFontFamily,
        borderColor: legacySharedBorderColor,
        ...pickDefinedEntries(legacy),
      };
      if (rawSection) {
        for (const sectionKey of REPORT_PANEL_SECTION_STYLE_KEYS) {
          if (sectionKey in rawSection) {
            upgradedSection[sectionKey] = rawSection[sectionKey];
          }
        }
      }
      upgradedResultsTable.panelSectionStyle = upgradedSection;
    };

    upgradeFilledSection('headerStyle', DEFAULT_REPORT_STYLE_V1.resultsTable.headerStyle, {
      backgroundColor: legacyResultsTable.headerBackgroundColor as string | undefined,
      textColor: legacyResultsTable.headerTextColor as string | undefined,
      fontSizePx: legacyResultsTable.headerFontSizePx as number | undefined,
      textAlign: legacyResultsTable.headerTextAlign as ReportTextAlign | undefined,
    });
    upgradeSection('bodyStyle', DEFAULT_REPORT_STYLE_V1.resultsTable.bodyStyle, {
      textColor: legacyResultsTable.bodyTextColor as string | undefined,
      fontSizePx: legacyResultsTable.bodyFontSizePx as number | undefined,
      textAlign: legacyResultsTable.cellTextAlign as ReportTextAlign | undefined,
    });
    upgradePanelSection(DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle, {
      backgroundColor:
        (legacyResultsTable.panelSectionBackgroundColor as string | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.backgroundColor,
      textColor:
        (legacyResultsTable.panelSectionTextColor as string | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.textColor,
      borderColor:
        (legacyResultsTable.panelSectionBorderColor as string | undefined) ??
        (legacySharedBorderColor as string),
      fontSizePx:
        (legacyResultsTable.panelSectionFontSizePx as number | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.fontSizePx,
      textAlign:
        (legacyResultsTable.panelSectionTextAlign as ReportTextAlign | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.textAlign,
      bold:
        (legacyResultsTable.panelSectionBold as boolean | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.bold,
      borderWidthPx:
        (legacyResultsTable.panelSectionBorderWidthPx as number | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.borderWidthPx,
      borderRadiusPx:
        (legacyResultsTable.panelSectionBorderRadiusPx as number | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.borderRadiusPx,
      paddingYpx:
        (legacyResultsTable.panelSectionPaddingYpx as number | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.paddingYpx,
      paddingXpx:
        (legacyResultsTable.panelSectionPaddingXpx as number | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.paddingXpx,
      marginTopPx:
        (legacyResultsTable.panelSectionMarginTopPx as number | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.marginTopPx,
      marginBottomPx:
        (legacyResultsTable.panelSectionMarginBottomPx as number | undefined) ??
        DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle.marginBottomPx,
    });
    upgradeFilledSection('departmentRowStyle', DEFAULT_REPORT_STYLE_V1.resultsTable.departmentRowStyle, {
      backgroundColor: legacyResultsTable.departmentRowBackgroundColor as string | undefined,
      textColor: legacyResultsTable.departmentRowTextColor as string | undefined,
      fontSizePx: legacyResultsTable.departmentRowFontSizePx as number | undefined,
      textAlign: legacyResultsTable.departmentRowTextAlign as ReportTextAlign | undefined,
      borderColor:
        (legacyResultsTable.departmentRowBackgroundColor as string | undefined) ?? (legacySharedBorderColor as string),
    });
    upgradeFilledSection('categoryRowStyle', DEFAULT_REPORT_STYLE_V1.resultsTable.categoryRowStyle, {
      backgroundColor: legacyResultsTable.categoryRowBackgroundColor as string | undefined,
      textColor: legacyResultsTable.categoryRowTextColor as string | undefined,
      fontSizePx: legacyResultsTable.categoryRowFontSizePx as number | undefined,
      textAlign: legacyResultsTable.categoryRowTextAlign as ReportTextAlign | undefined,
    });

    const derivedColumnDefaults: Record<
      (typeof RESULTS_TABLE_COLUMN_STYLE_KEYS)[number],
      ReportColumnStyle
    > = {
      testColumn: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable.testColumn,
        textColor: String((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textColor),
        fontSizePx: Number((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).fontSizePx),
        textAlign: (upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textAlign,
      },
      resultColumn: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable.resultColumn,
        textColor: String((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textColor),
        fontSizePx: Number((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).fontSizePx),
        textAlign: (upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textAlign,
      },
      unitColumn: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable.unitColumn,
        textColor: String((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textColor),
        fontSizePx: Number((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).fontSizePx),
        textAlign: (upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textAlign,
      },
      statusColumn: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable.statusColumn,
        textColor: String((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textColor),
        fontSizePx: Number((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).fontSizePx),
        textAlign: (upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textAlign,
      },
      referenceColumn: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable.referenceColumn,
        textColor: String(upgradedResultsTable.referenceValueColor),
        fontSizePx: Number((upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).fontSizePx),
        textAlign: (upgradedResultsTable.bodyStyle as ReportResultsTableSectionStyle).textAlign,
      },
    };

    for (const key of RESULTS_TABLE_COLUMN_STYLE_KEYS) {
      const rawColumn =
        rawResultsTable[key] && typeof rawResultsTable[key] === 'object' && !Array.isArray(rawResultsTable[key])
          ? (rawResultsTable[key] as Record<string, unknown>)
          : {};
      const upgradedColumn: Record<string, unknown> = {
        ...derivedColumnDefaults[key],
      };
      for (const columnKey of REPORT_COLUMN_KEYS) {
        if (columnKey in rawColumn) {
          upgradedColumn[columnKey] = rawColumn[columnKey];
        }
      }
      upgradedResultsTable[key] = upgradedColumn;
    }

    const upgradedPageLayout: Record<string, unknown> = {
      ...DEFAULT_REPORT_STYLE_V1.pageLayout,
    };
    for (const key of PAGE_LAYOUT_KEYS) {
      if (key in rawPageLayout) {
        upgradedPageLayout[key] = rawPageLayout[key];
      }
    }

    const upgradedCultureSection: Record<string, unknown> = {
      ...DEFAULT_REPORT_STYLE_V1.cultureSection,
    };
    for (const key of CULTURE_SECTION_KEYS) {
      if (key in rawCultureSection) {
        upgradedCultureSection[key] = rawCultureSection[key];
      }
    }

    try {
      return validateAndNormalizeReportStyleConfig({
        version: 1,
        patientInfo: upgradedPatientInfo,
        reportTitle: upgradedReportTitle,
        resultsTable: upgradedResultsTable,
        pageLayout: upgradedPageLayout,
        cultureSection: upgradedCultureSection,
      });
    } catch {
      return DEFAULT_REPORT_STYLE_V1;
    }
  }
}
