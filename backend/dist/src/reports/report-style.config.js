"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REPORT_STYLE_V1 = exports.REPORT_FONT_FAMILY_VALUES = exports.DEFAULT_REPORT_FONT_FAMILY = void 0;
exports.resolveReportFontStack = resolveReportFontStack;
exports.resolveReportFontStackWithArabicFallback = resolveReportFontStackWithArabicFallback;
exports.resolveReportRtlFontStack = resolveReportRtlFontStack;
exports.validateAndNormalizeReportStyleConfig = validateAndNormalizeReportStyleConfig;
exports.resolveReportStyleConfig = resolveReportStyleConfig;
exports.DEFAULT_REPORT_FONT_FAMILY = 'system-sans';
exports.REPORT_FONT_FAMILY_VALUES = [
    'system-sans',
    'arial',
    'tahoma',
    'verdana',
    'georgia',
    'times-new-roman',
    'courier-new',
];
const REPORT_FONT_STACKS = {
    'system-sans': "'Segoe UI', Tahoma, Arial, sans-serif",
    arial: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
    tahoma: "Tahoma, 'Segoe UI', Arial, sans-serif",
    verdana: "Verdana, 'Segoe UI', Arial, sans-serif",
    georgia: "Georgia, 'Times New Roman', serif",
    'times-new-roman': "'Times New Roman', Times, serif",
    'courier-new': "'Courier New', Courier, monospace",
};
const REPORT_ARABIC_FONT_STACK = "'KurdishReportFont', 'Noto Naskh Arabic', 'Noto Sans Arabic'";
function resolveReportFontStack(fontFamily) {
    return REPORT_FONT_STACKS[fontFamily];
}
function resolveReportFontStackWithArabicFallback(fontFamily) {
    return `${resolveReportFontStack(fontFamily)}, ${REPORT_ARABIC_FONT_STACK}`;
}
function resolveReportRtlFontStack(fontFamily) {
    return `${REPORT_ARABIC_FONT_STACK}, ${resolveReportFontStack(fontFamily)}`;
}
exports.DEFAULT_REPORT_STYLE_V1 = {
    version: 1,
    patientInfo: {
        backgroundColor: '#FAFAFA',
        borderColor: '#CCCCCC',
        textColor: '#333333',
        labelColor: '#333333',
        fontSizePx: 13,
        fontFamily: exports.DEFAULT_REPORT_FONT_FAMILY,
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
        fontFamily: exports.DEFAULT_REPORT_FONT_FAMILY,
        cellTextAlign: 'left',
        borderColor: '#EEEEEE',
        rowStripeEnabled: false,
        rowStripeColor: '#F9FBFF',
        abnormalRowBackgroundColor: '#FFF5F5',
        referenceValueColor: '#333333',
        showStatusColumn: true,
        showDepartmentRow: true,
        departmentRowBackgroundColor: '#222222',
        departmentRowTextColor: '#FFFFFF',
        departmentRowFontSizePx: 12,
        departmentRowTextAlign: 'left',
        showCategoryRow: true,
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
    pageLayout: {
        pageMarginTopMm: 3,
        pageMarginRightMm: 3,
        pageMarginBottomMm: 3,
        pageMarginLeftMm: 3,
        contentMarginXMm: 3,
    },
};
const HEX_COLOR_REGEX = /^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const TEXT_ALIGN_SET = new Set(['left', 'center', 'right']);
const BREAK_BEHAVIOR_SET = new Set(['auto', 'avoid']);
const REPORT_FONT_FAMILY_SET = new Set(exports.REPORT_FONT_FAMILY_VALUES);
const PATIENT_INFO_KEYS = [
    'backgroundColor',
    'borderColor',
    'textColor',
    'labelColor',
    'fontSizePx',
    'fontFamily',
    'labelFontWeight',
    'valueFontWeight',
    'textAlign',
    'borderRadiusPx',
    'paddingYpx',
    'paddingXpx',
];
const RESULTS_TABLE_KEYS = [
    'headerBackgroundColor',
    'headerTextColor',
    'headerFontSizePx',
    'headerTextAlign',
    'bodyTextColor',
    'bodyFontSizePx',
    'fontFamily',
    'cellTextAlign',
    'borderColor',
    'rowStripeEnabled',
    'rowStripeColor',
    'abnormalRowBackgroundColor',
    'referenceValueColor',
    'showStatusColumn',
    'showDepartmentRow',
    'departmentRowBackgroundColor',
    'departmentRowTextColor',
    'departmentRowFontSizePx',
    'departmentRowTextAlign',
    'showCategoryRow',
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
const PAGE_LAYOUT_KEYS = [
    'pageMarginTopMm',
    'pageMarginRightMm',
    'pageMarginBottomMm',
    'pageMarginLeftMm',
    'contentMarginXMm',
];
function assertObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${fieldName} must be an object`);
    }
    return value;
}
function assertExactKeys(value, keys, fieldName) {
    const unknown = Object.keys(value).filter((key) => !keys.includes(key));
    if (unknown.length > 0) {
        throw new Error(`${fieldName} contains unknown keys: ${unknown.join(', ')}`);
    }
    const missing = keys.filter((key) => !(key in value));
    if (missing.length > 0) {
        throw new Error(`${fieldName} is missing keys: ${missing.join(', ')}`);
    }
}
function assertColor(value, fieldName) {
    if (typeof value !== 'string' || !HEX_COLOR_REGEX.test(value.trim())) {
        throw new Error(`${fieldName} must be a valid color (#RRGGBB or #RRGGBBAA)`);
    }
    return value.trim().toUpperCase();
}
function assertIntRange(value, min, max, fieldName) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`${fieldName} must be an integer`);
    }
    if (value < min || value > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return value;
}
function assertFromSet(value, set, fieldName) {
    if (typeof value !== 'string' || !set.has(value)) {
        throw new Error(`${fieldName} must be one of: ${Array.from(set).join(', ')}`);
    }
    return value;
}
function assertBoolean(value, fieldName) {
    if (typeof value !== 'boolean') {
        throw new Error(`${fieldName} must be boolean`);
    }
    return value;
}
function validateAndNormalizeReportStyleConfig(value, fieldName = 'reportStyle') {
    const styleObj = assertObject(value, fieldName);
    assertExactKeys(styleObj, ['version', 'patientInfo', 'resultsTable', 'pageLayout'], fieldName);
    const version = styleObj.version;
    if (version !== 1) {
        throw new Error(`${fieldName}.version must be 1`);
    }
    const patientInfoObj = assertObject(styleObj.patientInfo, `${fieldName}.patientInfo`);
    assertExactKeys(patientInfoObj, PATIENT_INFO_KEYS, `${fieldName}.patientInfo`);
    const patientInfo = {
        backgroundColor: assertColor(patientInfoObj.backgroundColor, `${fieldName}.patientInfo.backgroundColor`),
        borderColor: assertColor(patientInfoObj.borderColor, `${fieldName}.patientInfo.borderColor`),
        textColor: assertColor(patientInfoObj.textColor, `${fieldName}.patientInfo.textColor`),
        labelColor: assertColor(patientInfoObj.labelColor, `${fieldName}.patientInfo.labelColor`),
        fontSizePx: assertIntRange(patientInfoObj.fontSizePx, 10, 18, `${fieldName}.patientInfo.fontSizePx`),
        fontFamily: assertFromSet(patientInfoObj.fontFamily, REPORT_FONT_FAMILY_SET, `${fieldName}.patientInfo.fontFamily`),
        labelFontWeight: assertIntRange(patientInfoObj.labelFontWeight, 600, 800, `${fieldName}.patientInfo.labelFontWeight`),
        valueFontWeight: assertIntRange(patientInfoObj.valueFontWeight, 400, 700, `${fieldName}.patientInfo.valueFontWeight`),
        textAlign: assertFromSet(patientInfoObj.textAlign, TEXT_ALIGN_SET, `${fieldName}.patientInfo.textAlign`),
        borderRadiusPx: assertIntRange(patientInfoObj.borderRadiusPx, 0, 12, `${fieldName}.patientInfo.borderRadiusPx`),
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
    const resultsTable = {
        headerBackgroundColor: assertColor(resultsObj.headerBackgroundColor, `${fieldName}.resultsTable.headerBackgroundColor`),
        headerTextColor: assertColor(resultsObj.headerTextColor, `${fieldName}.resultsTable.headerTextColor`),
        headerFontSizePx: assertIntRange(resultsObj.headerFontSizePx, 10, 16, `${fieldName}.resultsTable.headerFontSizePx`),
        headerTextAlign: assertFromSet(resultsObj.headerTextAlign, TEXT_ALIGN_SET, `${fieldName}.resultsTable.headerTextAlign`),
        bodyTextColor: assertColor(resultsObj.bodyTextColor, `${fieldName}.resultsTable.bodyTextColor`),
        bodyFontSizePx: assertIntRange(resultsObj.bodyFontSizePx, 9, 14, `${fieldName}.resultsTable.bodyFontSizePx`),
        fontFamily: assertFromSet(resultsObj.fontFamily, REPORT_FONT_FAMILY_SET, `${fieldName}.resultsTable.fontFamily`),
        cellTextAlign: assertFromSet(resultsObj.cellTextAlign, TEXT_ALIGN_SET, `${fieldName}.resultsTable.cellTextAlign`),
        borderColor: assertColor(resultsObj.borderColor, `${fieldName}.resultsTable.borderColor`),
        rowStripeEnabled: assertBoolean(resultsObj.rowStripeEnabled, `${fieldName}.resultsTable.rowStripeEnabled`),
        rowStripeColor: assertColor(resultsObj.rowStripeColor, `${fieldName}.resultsTable.rowStripeColor`),
        abnormalRowBackgroundColor: assertColor(resultsObj.abnormalRowBackgroundColor, `${fieldName}.resultsTable.abnormalRowBackgroundColor`),
        referenceValueColor: assertColor(resultsObj.referenceValueColor, `${fieldName}.resultsTable.referenceValueColor`),
        showStatusColumn: assertBoolean(resultsObj.showStatusColumn, `${fieldName}.resultsTable.showStatusColumn`),
        showDepartmentRow: assertBoolean(resultsObj.showDepartmentRow, `${fieldName}.resultsTable.showDepartmentRow`),
        departmentRowBackgroundColor: assertColor(resultsObj.departmentRowBackgroundColor, `${fieldName}.resultsTable.departmentRowBackgroundColor`),
        departmentRowTextColor: assertColor(resultsObj.departmentRowTextColor, `${fieldName}.resultsTable.departmentRowTextColor`),
        departmentRowFontSizePx: assertIntRange(resultsObj.departmentRowFontSizePx, 10, 16, `${fieldName}.resultsTable.departmentRowFontSizePx`),
        departmentRowTextAlign: assertFromSet(resultsObj.departmentRowTextAlign, TEXT_ALIGN_SET, `${fieldName}.resultsTable.departmentRowTextAlign`),
        showCategoryRow: assertBoolean(resultsObj.showCategoryRow, `${fieldName}.resultsTable.showCategoryRow`),
        categoryRowBackgroundColor: assertColor(resultsObj.categoryRowBackgroundColor, `${fieldName}.resultsTable.categoryRowBackgroundColor`),
        categoryRowTextColor: assertColor(resultsObj.categoryRowTextColor, `${fieldName}.resultsTable.categoryRowTextColor`),
        categoryRowFontSizePx: assertIntRange(resultsObj.categoryRowFontSizePx, 10, 16, `${fieldName}.resultsTable.categoryRowFontSizePx`),
        categoryRowTextAlign: assertFromSet(resultsObj.categoryRowTextAlign, TEXT_ALIGN_SET, `${fieldName}.resultsTable.categoryRowTextAlign`),
        statusNormalColor: assertColor(resultsObj.statusNormalColor, `${fieldName}.resultsTable.statusNormalColor`),
        statusHighColor: assertColor(resultsObj.statusHighColor, `${fieldName}.resultsTable.statusHighColor`),
        statusLowColor: assertColor(resultsObj.statusLowColor, `${fieldName}.resultsTable.statusLowColor`),
        regularDepartmentBlockBreak: assertFromSet(resultsObj.regularDepartmentBlockBreak, BREAK_BEHAVIOR_SET, `${fieldName}.resultsTable.regularDepartmentBlockBreak`),
        regularRowBreak: assertFromSet(resultsObj.regularRowBreak, BREAK_BEHAVIOR_SET, `${fieldName}.resultsTable.regularRowBreak`),
        panelTableBreak: assertFromSet(resultsObj.panelTableBreak, BREAK_BEHAVIOR_SET, `${fieldName}.resultsTable.panelTableBreak`),
        panelRowBreak: assertFromSet(resultsObj.panelRowBreak, BREAK_BEHAVIOR_SET, `${fieldName}.resultsTable.panelRowBreak`),
    };
    const pageLayoutObj = assertObject(styleObj.pageLayout, `${fieldName}.pageLayout`);
    assertExactKeys(pageLayoutObj, PAGE_LAYOUT_KEYS, `${fieldName}.pageLayout`);
    const pageLayout = {
        pageMarginTopMm: assertIntRange(pageLayoutObj.pageMarginTopMm, 0, 20, `${fieldName}.pageLayout.pageMarginTopMm`),
        pageMarginRightMm: assertIntRange(pageLayoutObj.pageMarginRightMm, 0, 20, `${fieldName}.pageLayout.pageMarginRightMm`),
        pageMarginBottomMm: assertIntRange(pageLayoutObj.pageMarginBottomMm, 0, 20, `${fieldName}.pageLayout.pageMarginBottomMm`),
        pageMarginLeftMm: assertIntRange(pageLayoutObj.pageMarginLeftMm, 0, 20, `${fieldName}.pageLayout.pageMarginLeftMm`),
        contentMarginXMm: assertIntRange(pageLayoutObj.contentMarginXMm, 0, 20, `${fieldName}.pageLayout.contentMarginXMm`),
    };
    return {
        version: 1,
        patientInfo,
        resultsTable,
        pageLayout,
    };
}
function resolveReportStyleConfig(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return exports.DEFAULT_REPORT_STYLE_V1;
        try {
            const parsed = JSON.parse(trimmed);
            return resolveReportStyleConfig(parsed);
        }
        catch {
            return exports.DEFAULT_REPORT_STYLE_V1;
        }
    }
    try {
        return validateAndNormalizeReportStyleConfig(value);
    }
    catch {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return exports.DEFAULT_REPORT_STYLE_V1;
        }
        const raw = value;
        const rawPatientInfo = raw.patientInfo && typeof raw.patientInfo === 'object' && !Array.isArray(raw.patientInfo)
            ? raw.patientInfo
            : {};
        const rawResultsTable = raw.resultsTable && typeof raw.resultsTable === 'object' && !Array.isArray(raw.resultsTable)
            ? raw.resultsTable
            : {};
        const rawPageLayout = raw.pageLayout && typeof raw.pageLayout === 'object' && !Array.isArray(raw.pageLayout)
            ? raw.pageLayout
            : {};
        const upgradedPatientInfo = {
            ...exports.DEFAULT_REPORT_STYLE_V1.patientInfo,
        };
        for (const key of PATIENT_INFO_KEYS) {
            if (key in rawPatientInfo) {
                upgradedPatientInfo[key] = rawPatientInfo[key];
            }
        }
        const upgradedResultsTable = {
            ...exports.DEFAULT_REPORT_STYLE_V1.resultsTable,
        };
        for (const key of RESULTS_TABLE_KEYS) {
            if (key in rawResultsTable) {
                upgradedResultsTable[key] = rawResultsTable[key];
            }
        }
        const upgradedPageLayout = {
            ...exports.DEFAULT_REPORT_STYLE_V1.pageLayout,
        };
        for (const key of PAGE_LAYOUT_KEYS) {
            if (key in rawPageLayout) {
                upgradedPageLayout[key] = rawPageLayout[key];
            }
        }
        try {
            return validateAndNormalizeReportStyleConfig({
                version: 1,
                patientInfo: upgradedPatientInfo,
                resultsTable: upgradedResultsTable,
                pageLayout: upgradedPageLayout,
            });
        }
        catch {
            return exports.DEFAULT_REPORT_STYLE_V1;
        }
    }
}
//# sourceMappingURL=report-style.config.js.map