export type ReportTextAlign = 'left' | 'center' | 'right';

export interface ReportPatientInfoStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  labelColor: string;
  fontSizePx: number;
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
  cellTextAlign: ReportTextAlign;
  borderColor: string;
  rowStripeEnabled: boolean;
  rowStripeColor: string;
  abnormalRowBackgroundColor: string;
  referenceValueColor: string;
  departmentRowBackgroundColor: string;
  departmentRowTextColor: string;
  departmentRowFontSizePx: number;
  departmentRowTextAlign: ReportTextAlign;
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

export interface ReportStyleConfig {
  version: 1;
  patientInfo: ReportPatientInfoStyle;
  resultsTable: ReportResultsTableStyle;
}

export const DEFAULT_REPORT_STYLE_V1: ReportStyleConfig = {
  version: 1,
  patientInfo: {
    backgroundColor: '#FAFAFA',
    borderColor: '#CCCCCC',
    textColor: '#333333',
    labelColor: '#333333',
    fontSizePx: 13,
    labelFontWeight: 700,
    valueFontWeight: 400,
    textAlign: 'left',
    borderRadiusPx: 6,
    paddingYpx: 10,
    paddingXpx: 12,
  },
  resultsTable: {
    headerBackgroundColor: '#F2F2F2',
    headerTextColor: '#333333',
    headerFontSizePx: 12,
    headerTextAlign: 'left',
    bodyTextColor: '#333333',
    bodyFontSizePx: 12,
    cellTextAlign: 'left',
    borderColor: '#EEEEEE',
    rowStripeEnabled: false,
    rowStripeColor: '#F9FBFF',
    abnormalRowBackgroundColor: '#FFF5F5',
    referenceValueColor: '#333333',
    departmentRowBackgroundColor: '#222222',
    departmentRowTextColor: '#FFFFFF',
    departmentRowFontSizePx: 12,
    departmentRowTextAlign: 'left',
    categoryRowBackgroundColor: '#F2F2F2',
    categoryRowTextColor: '#555555',
    categoryRowFontSizePx: 12,
    categoryRowTextAlign: 'left',
    statusNormalColor: '#0F8A1F',
    statusHighColor: '#D00000',
    statusLowColor: '#0066CC',
    regularDepartmentBlockBreak: 'avoid',
    regularRowBreak: 'avoid',
    panelTableBreak: 'auto',
    panelRowBreak: 'avoid',
  },
};

const HEX_COLOR_REGEX = /^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const TEXT_ALIGN_SET = new Set<ReportTextAlign>(['left', 'center', 'right']);
const BREAK_BEHAVIOR_SET = new Set<'auto' | 'avoid'>(['auto', 'avoid']);
const PATIENT_INFO_KEYS: Array<keyof ReportPatientInfoStyle> = [
  'backgroundColor',
  'borderColor',
  'textColor',
  'labelColor',
  'fontSizePx',
  'labelFontWeight',
  'valueFontWeight',
  'textAlign',
  'borderRadiusPx',
  'paddingYpx',
  'paddingXpx',
];
const RESULTS_TABLE_KEYS: Array<keyof ReportResultsTableStyle> = [
  'headerBackgroundColor',
  'headerTextColor',
  'headerFontSizePx',
  'headerTextAlign',
  'bodyTextColor',
  'bodyFontSizePx',
  'cellTextAlign',
  'borderColor',
  'rowStripeEnabled',
  'rowStripeColor',
  'abnormalRowBackgroundColor',
  'referenceValueColor',
  'departmentRowBackgroundColor',
  'departmentRowTextColor',
  'departmentRowFontSizePx',
  'departmentRowTextAlign',
  'categoryRowBackgroundColor',
  'categoryRowTextColor',
  'categoryRowFontSizePx',
  'categoryRowTextAlign',
  'statusNormalColor',
  'statusHighColor',
  'statusLowColor',
  'regularDepartmentBlockBreak',
  'regularRowBreak',
  'panelTableBreak',
  'panelRowBreak',
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

export function validateAndNormalizeReportStyleConfig(
  value: unknown,
  fieldName = 'reportStyle',
): ReportStyleConfig {
  const styleObj = assertObject(value, fieldName);
  assertExactKeys(styleObj, ['version', 'patientInfo', 'resultsTable'], fieldName);

  const version = styleObj.version;
  if (version !== 1) {
    throw new Error(`${fieldName}.version must be 1`);
  }

  const patientInfoObj = assertObject(styleObj.patientInfo, `${fieldName}.patientInfo`);
  assertExactKeys(patientInfoObj, PATIENT_INFO_KEYS, `${fieldName}.patientInfo`);
  const patientInfo: ReportPatientInfoStyle = {
    backgroundColor: assertColor(patientInfoObj.backgroundColor, `${fieldName}.patientInfo.backgroundColor`),
    borderColor: assertColor(patientInfoObj.borderColor, `${fieldName}.patientInfo.borderColor`),
    textColor: assertColor(patientInfoObj.textColor, `${fieldName}.patientInfo.textColor`),
    labelColor: assertColor(patientInfoObj.labelColor, `${fieldName}.patientInfo.labelColor`),
    fontSizePx: assertIntRange(patientInfoObj.fontSizePx, 10, 18, `${fieldName}.patientInfo.fontSizePx`),
    labelFontWeight: assertIntRange(
      patientInfoObj.labelFontWeight,
      600,
      800,
      `${fieldName}.patientInfo.labelFontWeight`,
    ) as 600 | 700 | 800,
    valueFontWeight: assertIntRange(
      patientInfoObj.valueFontWeight,
      400,
      700,
      `${fieldName}.patientInfo.valueFontWeight`,
    ) as 400 | 500 | 600 | 700,
    textAlign: assertFromSet(
      patientInfoObj.textAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.patientInfo.textAlign`,
    ),
    borderRadiusPx: assertIntRange(
      patientInfoObj.borderRadiusPx,
      0,
      12,
      `${fieldName}.patientInfo.borderRadiusPx`,
    ),
    paddingYpx: assertIntRange(patientInfoObj.paddingYpx, 6, 18, `${fieldName}.patientInfo.paddingYpx`),
    paddingXpx: assertIntRange(patientInfoObj.paddingXpx, 8, 24, `${fieldName}.patientInfo.paddingXpx`),
  };
  if (![600, 700, 800].includes(patientInfo.labelFontWeight)) {
    throw new Error(`${fieldName}.patientInfo.labelFontWeight must be one of: 600, 700, 800`);
  }
  if (![400, 500, 600, 700].includes(patientInfo.valueFontWeight)) {
    throw new Error(`${fieldName}.patientInfo.valueFontWeight must be one of: 400, 500, 600, 700`);
  }

  const resultsObj = assertObject(styleObj.resultsTable, `${fieldName}.resultsTable`);
  assertExactKeys(resultsObj, RESULTS_TABLE_KEYS, `${fieldName}.resultsTable`);
  const resultsTable: ReportResultsTableStyle = {
    headerBackgroundColor: assertColor(
      resultsObj.headerBackgroundColor,
      `${fieldName}.resultsTable.headerBackgroundColor`,
    ),
    headerTextColor: assertColor(resultsObj.headerTextColor, `${fieldName}.resultsTable.headerTextColor`),
    headerFontSizePx: assertIntRange(
      resultsObj.headerFontSizePx,
      10,
      16,
      `${fieldName}.resultsTable.headerFontSizePx`,
    ),
    headerTextAlign: assertFromSet(
      resultsObj.headerTextAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.resultsTable.headerTextAlign`,
    ),
    bodyTextColor: assertColor(resultsObj.bodyTextColor, `${fieldName}.resultsTable.bodyTextColor`),
    bodyFontSizePx: assertIntRange(resultsObj.bodyFontSizePx, 9, 14, `${fieldName}.resultsTable.bodyFontSizePx`),
    cellTextAlign: assertFromSet(
      resultsObj.cellTextAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.resultsTable.cellTextAlign`,
    ),
    borderColor: assertColor(resultsObj.borderColor, `${fieldName}.resultsTable.borderColor`),
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
    departmentRowBackgroundColor: assertColor(
      resultsObj.departmentRowBackgroundColor,
      `${fieldName}.resultsTable.departmentRowBackgroundColor`,
    ),
    departmentRowTextColor: assertColor(
      resultsObj.departmentRowTextColor,
      `${fieldName}.resultsTable.departmentRowTextColor`,
    ),
    departmentRowFontSizePx: assertIntRange(
      resultsObj.departmentRowFontSizePx,
      10,
      16,
      `${fieldName}.resultsTable.departmentRowFontSizePx`,
    ),
    departmentRowTextAlign: assertFromSet(
      resultsObj.departmentRowTextAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.resultsTable.departmentRowTextAlign`,
    ),
    categoryRowBackgroundColor: assertColor(
      resultsObj.categoryRowBackgroundColor,
      `${fieldName}.resultsTable.categoryRowBackgroundColor`,
    ),
    categoryRowTextColor: assertColor(
      resultsObj.categoryRowTextColor,
      `${fieldName}.resultsTable.categoryRowTextColor`,
    ),
    categoryRowFontSizePx: assertIntRange(
      resultsObj.categoryRowFontSizePx,
      10,
      16,
      `${fieldName}.resultsTable.categoryRowFontSizePx`,
    ),
    categoryRowTextAlign: assertFromSet(
      resultsObj.categoryRowTextAlign,
      TEXT_ALIGN_SET,
      `${fieldName}.resultsTable.categoryRowTextAlign`,
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
  };

  return {
    version: 1,
    patientInfo,
    resultsTable,
  };
}

export function resolveReportStyleConfig(value: unknown): ReportStyleConfig {
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
    const rawResultsTable =
      raw.resultsTable && typeof raw.resultsTable === 'object' && !Array.isArray(raw.resultsTable)
        ? (raw.resultsTable as Record<string, unknown>)
        : {};

    const upgradedPatientInfo: Record<string, unknown> = {
      ...DEFAULT_REPORT_STYLE_V1.patientInfo,
    };
    for (const key of PATIENT_INFO_KEYS) {
      if (key in rawPatientInfo) {
        upgradedPatientInfo[key] = rawPatientInfo[key];
      }
    }

    const upgradedResultsTable: Record<string, unknown> = {
      ...DEFAULT_REPORT_STYLE_V1.resultsTable,
    };
    for (const key of RESULTS_TABLE_KEYS) {
      if (key in rawResultsTable) {
        upgradedResultsTable[key] = rawResultsTable[key];
      }
    }

    try {
      return validateAndNormalizeReportStyleConfig({
        version: 1,
        patientInfo: upgradedPatientInfo,
        resultsTable: upgradedResultsTable,
      });
    } catch {
      return DEFAULT_REPORT_STYLE_V1;
    }
  }
}
