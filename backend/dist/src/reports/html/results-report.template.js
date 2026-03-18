"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildResultsReportHtml = buildResultsReportHtml;
const test_entity_1 = require("../../entities/test.entity");
const report_style_config_1 = require("../report-style.config");
const normal_range_util_1 = require("../../tests/normal-range.util");
const patient_age_util_1 = require("../../patients/patient-age.util");
const order_test_flag_util_1 = require("../../order-tests/order-test-flag.util");
const TEMPLATE_LOGO_BASE64 = 'data:image/png;base64,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';
function escapeHtml(value) {
    const s = value == null ? '' : String(value);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function formatDateTime(value) {
    if (!value)
        return '-';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return '-';
    return d.toLocaleString();
}
function containsArabicScript(text) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}
function normalizeFlag(flag) {
    const f = (0, order_test_flag_util_1.normalizeOrderTestFlag)(flag) ?? String(flag ?? '').trim().toUpperCase();
    return f || '';
}
function isAbnormalFlag(flag) {
    return flag === 'H' || flag === 'L';
}
function formatResultValue(ot) {
    const resultEntryType = String(ot.test?.resultEntryType ?? '').toUpperCase();
    if (resultEntryType === 'PDF_UPLOAD' &&
        String(ot.resultDocumentStorageKey ?? '').trim()) {
        return 'See attached PDF result';
    }
    const cultureResult = ot.cultureResult;
    if (cultureResult && typeof cultureResult === 'object') {
        if (cultureResult.noGrowth === true) {
            const noGrowthResult = typeof cultureResult.noGrowthResult === 'string' &&
                cultureResult.noGrowthResult.trim().length > 0
                ? cultureResult.noGrowthResult.trim()
                : 'No growth';
            return noGrowthResult;
        }
        if (Array.isArray(cultureResult.isolates) && cultureResult.isolates.length > 0) {
            const rows = cultureResult.isolates.reduce((sum, isolate) => {
                if (!isolate || typeof isolate !== 'object')
                    return sum;
                const antibiotics = Array.isArray(isolate.antibiotics)
                    ? (isolate.antibiotics?.length ?? 0)
                    : 0;
                return sum + antibiotics;
            }, 0);
            return `${cultureResult.isolates.length} isolate${cultureResult.isolates.length === 1 ? '' : 's'} • ${rows} row${rows === 1 ? '' : 's'}`;
        }
    }
    if (ot.resultText?.trim())
        return ot.resultText.trim();
    if (ot.resultValue !== null && ot.resultValue !== undefined)
        return String(ot.resultValue);
    return 'Pending';
}
function getPanelReportSection(ot) {
    const raw = ot.panelReportSection;
    if (typeof raw !== 'string') {
        return null;
    }
    const normalized = raw.trim();
    return normalized || null;
}
const CULTURE_PRIMARY_RESISTANCE_CAPACITY = 24;
function isCultureSensitivityOrderTest(ot) {
    return (String(ot.test?.resultEntryType ?? '').toUpperCase() ===
        'CULTURE_SENSITIVITY');
}
function getCultureAntibioticName(row) {
    if (!row || typeof row !== 'object')
        return '-';
    const rowObj = row;
    const antibioticName = String(rowObj.antibioticName ?? '').trim();
    if (antibioticName)
        return antibioticName;
    const antibioticCode = String(rowObj.antibioticCode ?? '').trim();
    return antibioticCode || '-';
}
function buildCultureAstColumns(isolate) {
    const sensitive = [];
    const intermediate = [];
    const resistance = [];
    const isolateObj = isolate && typeof isolate === 'object'
        ? isolate
        : null;
    const antibiotics = Array.isArray(isolateObj?.antibiotics)
        ? isolateObj.antibiotics
        : [];
    for (const row of antibiotics) {
        if (!row || typeof row !== 'object')
            continue;
        const interpretation = String(row.interpretation ?? '').trim();
        const name = getCultureAntibioticName(row);
        if (interpretation === 'S') {
            sensitive.push(name);
            continue;
        }
        if (interpretation === 'I') {
            intermediate.push(name);
            continue;
        }
        resistance.push(name);
    }
    const sortNames = (list) => list
        .slice()
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const resistanceSorted = sortNames(resistance);
    return {
        sensitive: sortNames(sensitive),
        intermediate: sortNames(intermediate),
        resistancePrimary: resistanceSorted.slice(0, CULTURE_PRIMARY_RESISTANCE_CAPACITY),
        resistanceSecondary: resistanceSorted.slice(CULTURE_PRIMARY_RESISTANCE_CAPACITY),
    };
}
function renderCultureAstColumn(title, values, columnClass) {
    const listHtml = values.length
        ? values
            .map((name) => `<li class="culture-ast-item">${escapeHtml(name)}</li>`)
            .join('')
        : '<li class="culture-ast-empty">-</li>';
    return `
    <div class="culture-ast-column ${columnClass}">
      <div class="culture-ast-column-title">${escapeHtml(title)}</div>
      <ul class="culture-ast-list">${listHtml}</ul>
    </div>
  `;
}
function formatRange(ot, patientSex, patientAgeSnapshot) {
    const test = ot.test;
    if (!test)
        return '-';
    const { normalMin: min, normalMax: max } = (0, normal_range_util_1.resolveNumericRange)(test, patientSex, patientAgeSnapshot);
    const resolvedText = (0, normal_range_util_1.resolveNormalText)(test, patientSex);
    if (resolvedText !== null)
        return resolvedText;
    if (min != null && max != null)
        return `${min}-${max}`;
    if (min != null)
        return `>= ${min}`;
    if (max != null)
        return `<= ${max}`;
    return '-';
}
function formatParams(params) {
    if (!params)
        return [];
    return Object.entries(params)
        .filter(([, v]) => v != null && String(v).trim() !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}: ${String(v).trim()}`);
}
function flagToStatus(flag) {
    const f = normalizeFlag(flag);
    if (f === 'N')
        return 'Normal';
    if (f === 'H')
        return 'High';
    if (f === 'L')
        return 'Low';
    if (f === 'POS')
        return 'Positive';
    if (f === 'NEG')
        return 'Negative';
    if (f === 'ABN')
        return 'Abnormal';
    if (f === '')
        return '';
    return f;
}
function getCategoryName(test) {
    return test?.category || test?.group || '';
}
function getDeptName(test) {
    return (test?.department?.name ||
        test?.departmentName ||
        test?.department?.title ||
        test?.section ||
        test?.group ||
        '');
}
function getDirection(order, orderTests, comments) {
    const fields = [
        order.lab?.name,
        order.lab?.code,
        order.patient?.fullName,
        order.patient?.address,
        ...orderTests.map((ot) => ot.test?.name),
        ...orderTests.map((ot) => ot.resultText),
        ...comments,
    ]
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .join(' ');
    return containsArabicScript(fields) ? 'rtl' : 'ltr';
}
function normalizeDoctors(order) {
    const lab = order.lab;
    const arr = Array.isArray(lab?.doctors) ? lab.doctors : null;
    if (arr && arr.length) {
        return arr
            .map((d) => ({
            name: d?.name ?? d?.title ?? '',
            subtitle: d?.subtitle ?? d?.sub ?? d?.degree ?? '',
        }))
            .filter((d) => (d.name || d.subtitle) && String(d.name || d.subtitle).trim() !== '')
            .slice(0, 4);
    }
    return [{}, {}, {}, {}];
}
function buildResultsReportHtml(input) {
    const { order, orderTests } = input;
    const orderNumber = order.orderNumber || order.id.substring(0, 8);
    const patientName = order.patient?.fullName?.trim() || '-';
    const patientNameIsRtl = containsArabicScript(patientName);
    const ageForRanges = (0, patient_age_util_1.getPatientAgeSnapshot)(order.patient?.dateOfBirth ?? null, order.registeredAt ?? null);
    const ageDisplay = (0, patient_age_util_1.formatPatientAgeDisplay)(order.patient?.dateOfBirth ?? null, order.registeredAt);
    const sex = order.patient?.sex || '-';
    const sexLabel = sex === 'M' ? 'Male' : sex === 'F' ? 'Female' : sex || '-';
    const patientId = order.patient?.patientNumber || order.patient?.externalId || order.patient?.nationalId || order.patient?.id || '-';
    const referredBy = order.notes || order.patient?.address || 'Himself';
    const dir = getDirection(order, orderTests, input.comments);
    const labAny = order.lab;
    const reportStyle = (0, report_style_config_1.resolveReportStyleConfig)(labAny?.reportStyle);
    const reportTitleText = reportStyle.reportTitle.text.trim() || 'Laboratory Report';
    const showStatusColumn = reportStyle.resultsTable.showStatusColumn;
    const regularVisibleColumnCount = showStatusColumn ? 5 : 4;
    const parameterVisibleColumnCount = showStatusColumn ? 4 : 3;
    const regularTableWidths = {
        test: showStatusColumn ? '32%' : '34%',
        result: showStatusColumn ? '12%' : '14%',
        unit: showStatusColumn ? '10%' : '12%',
        status: '10%',
        reference: showStatusColumn ? '36%' : '40%',
    };
    const parameterTableWidths = {
        test: showStatusColumn ? '34%' : '38%',
        result: showStatusColumn ? '20%' : '22%',
        status: '10%',
        reference: showStatusColumn ? '36%' : '40%',
    };
    const regularColGroupHtml = `<colgroup><col style="width:${regularTableWidths.test};" /><col style="width:${regularTableWidths.result};" /><col style="width:${regularTableWidths.unit};" />${showStatusColumn ? `<col style="width:${regularTableWidths.status};" />` : ''}<col style="width:${regularTableWidths.reference};" /></colgroup>`;
    const parameterColGroupHtml = `<colgroup><col style="width:${parameterTableWidths.test};" /><col style="width:${parameterTableWidths.result};" />${showStatusColumn ? `<col style="width:${parameterTableWidths.status};" />` : ''}<col style="width:${parameterTableWidths.reference};" /></colgroup>`;
    const regularHeaderCellsHtml = `<th class="col-test" style="width:${regularTableWidths.test};">Test</th><th class="col-result" style="width:${regularTableWidths.result};">Result</th><th class="col-unit" style="width:${regularTableWidths.unit};">Unit</th>${showStatusColumn ? `<th class="col-status" style="width:${regularTableWidths.status};">Status</th>` : ''}<th class="col-reference" style="width:${regularTableWidths.reference};">Reference Value</th>`;
    const parameterHeaderCellsHtml = `<th class="col-test" style="width:${parameterTableWidths.test};">Test</th><th class="col-result" style="width:${parameterTableWidths.result};">Result</th>${showStatusColumn ? `<th class="col-status" style="width:${parameterTableWidths.status};">Status</th>` : ''}<th class="col-reference" style="width:${parameterTableWidths.reference};">Reference Value</th>`;
    const pageMarginTopMm = reportStyle.pageLayout.pageMarginTopMm;
    const pageMarginRightMm = reportStyle.pageLayout.pageMarginRightMm;
    const pageMarginBottomMm = reportStyle.pageLayout.pageMarginBottomMm;
    const pageMarginLeftMm = reportStyle.pageLayout.pageMarginLeftMm;
    const contentMarginXMm = reportStyle.pageLayout.contentMarginXMm;
    const patientInfoLabelFontFamily = (0, report_style_config_1.resolveReportFontStackWithArabicFallback)(reportStyle.patientInfo.labelCellStyle.fontFamily);
    const patientInfoValueFontFamily = (0, report_style_config_1.resolveReportFontStackWithArabicFallback)(reportStyle.patientInfo.valueCellStyle.fontFamily);
    const patientInfoValueRtlFontFamily = (0, report_style_config_1.resolveReportRtlFontStack)(reportStyle.patientInfo.valueCellStyle.fontFamily);
    const resultsHeaderFontFamily = (0, report_style_config_1.resolveReportFontStackWithArabicFallback)(reportStyle.resultsTable.headerStyle.fontFamily);
    const resultsBodyFontFamily = (0, report_style_config_1.resolveReportFontStackWithArabicFallback)(reportStyle.resultsTable.bodyStyle.fontFamily);
    const resultsDepartmentFontFamily = (0, report_style_config_1.resolveReportFontStackWithArabicFallback)(reportStyle.resultsTable.departmentRowStyle.fontFamily);
    const resultsCategoryFontFamily = (0, report_style_config_1.resolveReportFontStackWithArabicFallback)(reportStyle.resultsTable.categoryRowStyle.fontFamily);
    const cultureSectionFontFamily = (0, report_style_config_1.resolveReportFontStackWithArabicFallback)(reportStyle.cultureSection.fontFamily);
    const bannerSrc = labAny?.reportBannerDataUrl || '';
    const footerSrc = labAny?.reportFooterDataUrl || '';
    const logoSrc = labAny?.reportLogoDataUrl || '';
    const watermarkSrc = labAny?.reportWatermarkDataUrl || '';
    const hasCustomBanner = Boolean(bannerSrc);
    const hasCustomLogo = Boolean(logoSrc);
    const visitDate = formatDateTime(order.registeredAt);
    const ageSex = `${ageDisplay || '-'}/${sexLabel}`;
    const referredByDisplay = String(referredBy || '').trim() || 'Himself';
    const referredByIsRtl = containsArabicScript(referredByDisplay);
    const patientInfoIsKurdish = patientNameIsRtl || referredByIsRtl;
    const bannerUrlAttr = bannerSrc ? `src="${escapeHtml(bannerSrc)}"` : '';
    const footerUrlAttr = footerSrc ? `src="${escapeHtml(footerSrc)}"` : '';
    const logoUrlAttr = logoSrc ? `src="${escapeHtml(logoSrc)}"` : '';
    const watermarkUrlAttr = watermarkSrc ? `src="${escapeHtml(watermarkSrc)}"` : '';
    const orderQrSrc = typeof input.orderQrDataUrl === 'string' ? input.orderQrDataUrl.trim() : '';
    const orderQrUrlAttr = orderQrSrc ? `src="${escapeHtml(orderQrSrc)}"` : '';
    const hasOrderQr = Boolean(orderQrUrlAttr);
    const hasHeaderBanner = hasCustomBanner && Boolean(bannerUrlAttr);
    const hasHeaderLogoOnly = !hasHeaderBanner && hasCustomLogo && Boolean(logoUrlAttr);
    const rowStripeCss = reportStyle.resultsTable.rowStripeEnabled
        ? `
    .regular-results-table tbody.regular-dept-block tr:not(.dept-row):not(.cat-row):not(.abnormal):nth-child(even) td { background: ${reportStyle.resultsTable.rowStripeColor}; }
    .panel-page tbody tr:not(.abnormal):nth-child(even) td { background: ${reportStyle.resultsTable.rowStripeColor}; }
    `
        : '';
    const kurdishFontFace = input.kurdishFontBase64
        ? `@font-face { font-family: 'KurdishReportFont'; src: url('${escapeHtml(input.kurdishFontBase64)}') format('truetype'); font-weight: 400; font-style: normal; }`
        : '';
    const templateLogo = 'data:image/png;base64,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أ¢â‚¬آ¦48787 tokens truncatedأ¢â‚¬آ¦';
    const doctors = normalizeDoctors(order);
    const childrenByParent = new Map();
    for (const ot of orderTests) {
        if (ot.parentOrderTestId) {
            const arr = childrenByParent.get(ot.parentOrderTestId) ?? [];
            arr.push(ot);
            childrenByParent.set(ot.parentOrderTestId, arr);
        }
    }
    const sortKey = (ot) => {
        const anyTest = ot.test;
        const sortOrder = anyTest?.sortOrder ?? 0;
        const code = (anyTest?.code || '').toUpperCase();
        return `${String(sortOrder).padStart(6, '0')}_${code}`;
    };
    for (const [, arr] of childrenByParent) {
        arr.sort((a, b) => {
            const aOrder = a.panelSortOrder ?? 9999;
            const bOrder = b.panelSortOrder ?? 9999;
            if (aOrder !== bOrder)
                return aOrder - bOrder;
            return sortKey(a).localeCompare(sortKey(b));
        });
    }
    const flattenedTests = [];
    const addWithChildren = (ot) => {
        flattenedTests.push(ot);
        const kids = childrenByParent.get(ot.id) || [];
        kids.forEach((child) => flattenedTests.push(child));
    };
    orderTests
        .filter((ot) => !ot.parentOrderTestId)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
        .forEach((ot) => {
        if (ot.test?.type === test_entity_1.TestType.PANEL)
            addWithChildren(ot);
        else
            flattenedTests.push(ot);
    });
    const reportReady = input.reportableCount > 0 && input.verifiedCount === input.reportableCount;
    const preliminary = input.reportableCount > 0 && !reportReady;
    const commentsText = input.comments.length ? input.comments.join(' أ¢â‚¬آ¢ ') : '';
    const verifierText = input.verifiers.join(', ') || (input.verifiedCount > 0 ? 'Verifier' : 'Pending');
    const pageHeaderHtml = `
    <div class="report-header">
    ${hasHeaderBanner
        ? `<div class="banner-wrap"><img class="banner-image" ${bannerUrlAttr} alt="Report Banner" /></div>`
        : hasHeaderLogoOnly
            ? `<div class="logo-only-wrap"><img class="logo" ${logoUrlAttr} alt="Report Logo" /></div>`
            : `<div class="header-spacer" aria-hidden="true"></div>`}
    <div class="patient-info${hasOrderQr ? ' has-order-qr' : ''}${patientInfoIsKurdish ? ' patient-info--kurdish' : ''}">
      <div class="patient-info-table-wrap">
        <table class="patient-info-table">
          <colgroup>
            <col style="width: 18%;" />
            <col style="width: 32%;" />
            <col style="width: 18%;" />
            <col style="width: 32%;" />
          </colgroup>
          <tbody>
            <tr>
              <td class="patient-info-label-cell">Name:</td>
              <td class="patient-info-value-cell"><span class="patient-info-value-text name-value ${patientNameIsRtl ? 'rtl-text' : ''}">${escapeHtml(patientName)}</span></td>
              <td class="patient-info-label-cell">Visit Date:</td>
              <td class="patient-info-value-cell"><span class="patient-info-value-text">${escapeHtml(visitDate)}</span></td>
            </tr>
            <tr>
              <td class="patient-info-label-cell">Age/Sex:</td>
              <td class="patient-info-value-cell"><span class="patient-info-value-text">${escapeHtml(ageSex)}</span></td>
              <td class="patient-info-label-cell">Order No:</td>
              <td class="patient-info-value-cell"><span class="patient-info-value-text">${escapeHtml(orderNumber)}</span></td>
            </tr>
            <tr>
              <td class="patient-info-label-cell">Referred By:</td>
              <td class="patient-info-value-cell"><span class="patient-info-value-text name-value ${referredByIsRtl ? 'rtl-text' : ''}">${escapeHtml(referredByDisplay)}</span></td>
              <td class="patient-info-label-cell">Patient ID:</td>
              <td class="patient-info-value-cell"><span class="patient-info-value-text">${escapeHtml(patientId)}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      ${hasOrderQr
        ? `<div class="patient-info-qr"><img class="patient-info-qr-image" ${orderQrUrlAttr} alt="Order QR Code" /><div class="patient-info-qr-caption">Order QR</div></div>`
        : ''}
    </div>
    <div class="report-title">${escapeHtml(reportTitleText)}</div>
    </div>
  `;
    const pageFooterHtml = footerUrlAttr
        ? `<div class="report-footer"><img class="footer-image" ${footerUrlAttr} alt="Report Footer" /></div>`
        : `<div class="report-footer report-footer-placeholder" aria-hidden="true"></div>`;
    const panelParentIds = new Set(orderTests
        .filter((ot) => !ot.parentOrderTestId && ot.test?.type === test_entity_1.TestType.PANEL)
        .map((ot) => ot.id));
    const panelChildrenByParent = new Map();
    for (const [parentId, children] of childrenByParent) {
        if (panelParentIds.has(parentId)) {
            panelChildrenByParent.set(parentId, children);
        }
    }
    const panelParents = flattenedTests.filter((ot) => panelParentIds.has(ot.id));
    const allRegularTests = flattenedTests.filter((ot) => !panelParentIds.has(ot.id) &&
        (!ot.parentOrderTestId || !panelParentIds.has(ot.parentOrderTestId)));
    const cultureRegularTests = allRegularTests.filter((ot) => isCultureSensitivityOrderTest(ot));
    const regularTests = allRegularTests.filter((ot) => !isCultureSensitivityOrderTest(ot));
    const panelPageSections = [];
    for (let i = 0; i < panelParents.length; i++) {
        const ot = panelParents[i];
        const t = ot.test;
        const testName = t?.name || t?.code || 'Examination';
        const kids = panelChildrenByParent.get(ot.id) || [];
        const params = Array.isArray(t?.parameterDefinitions) ? t.parameterDefinitions : [];
        const resultParams = ot.resultParameters && typeof ot.resultParameters === 'object' ? ot.resultParameters : {};
        let contentRows = '';
        let isParamTable = params.length > 0 || Object.keys(resultParams).length > 0;
        if (isParamTable) {
            contentRows = params
                .map((p) => {
                const val = p?.code ? resultParams[p.code] : '';
                const valStr = val != null ? String(val).trim() : '';
                const normalOpts = Array.isArray(p?.normalOptions) ? p.normalOptions : [];
                const isAbnormalParam = normalOpts.length > 0 && valStr !== '' && !normalOpts.includes(valStr);
                const valueCell = escapeHtml(valStr || '-');
                const referenceValue = normalOpts.length > 0 ? normalOpts.join(', ') : '-';
                let statusText = '-';
                let statusClass = '';
                if (valStr !== '') {
                    if (normalOpts.length > 0) {
                        if (isAbnormalParam) {
                            statusText = 'Abnormal';
                            statusClass = 'status-high';
                        }
                        else {
                            statusText = 'Normal';
                            statusClass = 'status-normal';
                        }
                    }
                }
                const rowClass = isAbnormalParam ? ' class="abnormal"' : '';
                return `<tr${rowClass}>
            <td class="col-test" style="width:${parameterTableWidths.test};">${escapeHtml(p?.label || p?.code || '')}</td>
            <td class="col-result" style="width:${parameterTableWidths.result};">${valueCell}</td>
            ${showStatusColumn ? `<td class="col-status ${statusClass}" style="width:${parameterTableWidths.status};">${escapeHtml(statusText)}</td>` : ''}
            <td class="col-reference reference-value" style="width:${parameterTableWidths.reference};">${escapeHtml(referenceValue)}</td>
          </tr>`;
            })
                .join('');
            if (!contentRows && Object.keys(resultParams).length > 0) {
                contentRows = Object.entries(resultParams)
                    .filter(([, v]) => v != null && String(v).trim() !== '')
                    .map(([k, v]) => `<tr>
            <td class="col-test" style="width:${parameterTableWidths.test};">${escapeHtml(k)}</td>
            <td class="col-result" style="width:${parameterTableWidths.result};">${escapeHtml(String(v))}</td>
            ${showStatusColumn ? `<td class="col-status" style="width:${parameterTableWidths.status};">-</td>` : ''}
            <td class="col-reference reference-value" style="width:${parameterTableWidths.reference};">-</td>
          </tr>`)
                    .join('');
            }
            if (!contentRows) {
                contentRows = `<tr><td colspan="${parameterVisibleColumnCount}">No parameters</td></tr>`;
            }
        }
        else if (kids.length > 0) {
            let currentSection = null;
            contentRows = kids
                .map((child) => {
                const ct = child.test;
                const flag = normalizeFlag(child.flag);
                const statusText = flagToStatus(flag);
                const abnormal = isAbnormalFlag(flag);
                const statusClass = abnormal ? (flag.startsWith('H') ? 'status-high' : 'status-low') : 'status-normal';
                const reportSection = getPanelReportSection(child);
                const sectionHeaderHtml = reportSection && reportSection !== currentSection
                    ? `<tr class="panel-section-row"><td class="panel-section-cell" colspan="${regularVisibleColumnCount}"><div class="panel-section-label">${escapeHtml(reportSection)}</div></td></tr>`
                    : '';
                currentSection = reportSection;
                return `${sectionHeaderHtml}<tr class="${abnormal ? 'abnormal' : ''}">
            <td class="col-test" style="width:${regularTableWidths.test};">${escapeHtml(ct?.abbreviation || ct?.name || '-')}</td>
            <td class="col-result nowrap" style="width:${regularTableWidths.result};">${escapeHtml(formatResultValue(child))}</td>
            <td class="col-unit nowrap" style="width:${regularTableWidths.unit};">${escapeHtml(ct?.unit || '-')}</td>
            ${showStatusColumn ? `<td class="col-status ${statusClass}" style="width:${regularTableWidths.status};">${escapeHtml(statusText)}</td>` : ''}
            <td class="col-reference reference-value" style="width:${regularTableWidths.reference};">${escapeHtml(formatRange(child, order.patient?.sex ?? null, ageForRanges))}</td>
          </tr>`;
            })
                .join('');
        }
        else {
            contentRows = `<tr><td colspan="${isParamTable ? parameterVisibleColumnCount : regularVisibleColumnCount}">No data</td></tr>`;
        }
        panelPageSections.push(`
      <table class="page-table ${isParamTable ? 'gue-gse-table' : 'panel-results-table'}">
        ${isParamTable ? parameterColGroupHtml : regularColGroupHtml}
        <thead>
          <tr><td class="page-header-cell" colspan="${isParamTable ? parameterVisibleColumnCount : regularVisibleColumnCount}"><div class="page-header-space"></div></td></tr>
          <tr><td class="panel-title-cell" colspan="${isParamTable ? parameterVisibleColumnCount : regularVisibleColumnCount}"><div class="panel-page-title">${escapeHtml(testName)}</div></td></tr>
          <tr>${isParamTable ? parameterHeaderCellsHtml : regularHeaderCellsHtml}</tr>
        </thead>
        <tbody>
          ${contentRows}
        </tbody>
        <tfoot><tr><td class="page-footer-cell" colspan="${isParamTable ? parameterVisibleColumnCount : regularVisibleColumnCount}"><div class="page-footer-space"></div></td></tr></tfoot>
      </table>`);
    }
    const panelPagesHtml = panelPageSections
        .map((panelSectionHtml, index) => {
        const shouldBreakBefore = regularTests.length > 0 || index > 0;
        const showComments = Boolean(commentsText) && index === panelPageSections.length - 1;
        return `
    <div class="page panel-page" style="page-break-before: ${shouldBreakBefore ? 'always' : 'auto'};">
      <div class="content">
        ${panelSectionHtml}
        ${showComments ? `<div class="comments" style="margin-top:8px;font-size:11px;font-weight:700;"><strong>Comments:</strong> ${escapeHtml(commentsText)}</div>` : ''}
      </div>
    </div>`;
    })
        .join('');
    const culturePageItems = [];
    for (const ot of cultureRegularTests) {
        const test = ot.test;
        const testName = test?.name || test?.code || 'Culture & Sensitivity';
        const cultureResult = ot.cultureResult && typeof ot.cultureResult === 'object'
            ? ot.cultureResult
            : null;
        const noGrowth = cultureResult?.noGrowth === true;
        const noGrowthResult = typeof cultureResult?.noGrowthResult === 'string' &&
            cultureResult.noGrowthResult.trim().length > 0
            ? cultureResult.noGrowthResult.trim()
            : 'No growth';
        const isolates = Array.isArray(cultureResult?.isolates)
            ? cultureResult.isolates
            : [];
        const notes = typeof cultureResult?.notes === 'string' &&
            cultureResult.notes.trim().length > 0
            ? cultureResult.notes.trim()
            : '';
        if (isolates.length === 0) {
            if (noGrowth) {
                culturePageItems.push({
                    testName,
                    bodyHtml: `
            <div class="culture-isolate-block">
              <div class="culture-no-growth-result">Result: ${escapeHtml(noGrowthResult)}</div>
            </div>
          `,
                    notes: '',
                });
                continue;
            }
            culturePageItems.push({
                testName,
                bodyHtml: '<div class="culture-no-growth">No isolate data</div>',
                notes,
            });
            continue;
        }
        isolates.forEach((isolate, isolateIndex) => {
            const organismRaw = String(isolate?.organism ?? '').trim();
            const organism = organismRaw || (noGrowth ? '-' : `Isolate ${isolateIndex + 1}`);
            const isolateSource = typeof isolate?.source === 'string' && isolate.source.trim().length > 0
                ? isolate.source.trim()
                : '';
            const isolateCondition = typeof isolate?.condition === 'string' && isolate.condition.trim().length > 0
                ? isolate.condition.trim()
                : '';
            const isolateColonyCount = typeof isolate?.colonyCount === 'string' &&
                isolate.colonyCount.trim().length > 0
                ? isolate.colonyCount.trim()
                : '';
            const isolateComment = typeof isolate?.comment === 'string' && isolate.comment.trim().length > 0
                ? isolate.comment.trim()
                : '';
            if (noGrowth) {
                const bodyHtml = `
          <div class="culture-isolate-block">
            <div class="culture-no-growth-result">Result: ${escapeHtml(noGrowthResult)}</div>
            ${isolateSource ? `<div class="culture-isolate-source"><strong>Source:</strong> ${escapeHtml(isolateSource)}</div>` : ''}
            ${isolateComment ? `<div class="culture-isolate-comment"><strong>Comment:</strong> ${escapeHtml(isolateComment)}</div>` : ''}
          </div>
        `;
                culturePageItems.push({
                    testName,
                    bodyHtml,
                    notes: '',
                });
                return;
            }
            const columns = buildCultureAstColumns(isolate);
            const hasSecondaryResistance = columns.resistanceSecondary.length > 0;
            const astColumnsHtml = [
                renderCultureAstColumn('Sensitive', columns.sensitive, 'culture-ast-column-sensitive'),
                renderCultureAstColumn('Intermediate', columns.intermediate, 'culture-ast-column-intermediate'),
                renderCultureAstColumn('Resistance', columns.resistancePrimary, 'culture-ast-column-resistance-primary'),
            ];
            if (hasSecondaryResistance) {
                astColumnsHtml.push(renderCultureAstColumn('Resistance', columns.resistanceSecondary, 'culture-ast-column-resistance-secondary'));
            }
            const bodyHtml = `
        <div class="culture-isolate-block">
          <div class="culture-isolate-title">
            <span class="culture-isolate-title-label">Microorganism:</span>
            <span class="culture-isolate-title-value">${escapeHtml(organism)}</span>
          </div>
          ${isolateSource ? `<div class="culture-isolate-source"><strong>Source:</strong> ${escapeHtml(isolateSource)}</div>` : ''}
          ${isolateCondition ? `<div class="culture-isolate-source"><strong>Condition:</strong> ${escapeHtml(isolateCondition)}</div>` : ''}
          ${isolateColonyCount ? `<div class="culture-isolate-source"><strong>Colony count:</strong> ${escapeHtml(isolateColonyCount)}</div>` : ''}
          ${isolateComment ? `<div class="culture-isolate-comment">${escapeHtml(isolateComment)}</div>` : ''}
          <div class="culture-ast-grid ${hasSecondaryResistance ? 'culture-ast-grid-four' : 'culture-ast-grid-three'}">
            ${astColumnsHtml.join('')}
          </div>
        </div>
      `;
            culturePageItems.push({
                testName,
                bodyHtml,
                notes: isolateIndex === 0 ? notes : '',
            });
        });
    }
    const culturePagesHtml = culturePageItems
        .map((item, index) => {
        return `
      <div class="page culture-page" style="page-break-before: always; break-before: page;">
        <table class="page-table">
          <thead><tr><td class="page-header-cell"><div class="page-header-space"></div></td></tr></thead>
          <tbody>
            <tr>
              <td>
                <div class="content">
                  <div class="panel-page-title">${escapeHtml(item.testName)}</div>
                  ${item.bodyHtml}
                  ${item.notes ? `<div class="culture-notes"><strong>Notes:</strong> ${escapeHtml(item.notes)}</div>` : ''}
                  ${commentsText && index === culturePageItems.length - 1 && panelPageSections.length === 0
            ? `<div class="comments" style="margin-top:8px;font-size:11px;font-weight:700;"><strong>Comments:</strong> ${escapeHtml(commentsText)}</div>`
            : ''}
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot><tr><td class="page-footer-cell"><div class="page-footer-space"></div></td></tr></tfoot>
        </table>
      </div>`;
    })
        .join('');
    const deptCatMap = new Map();
    for (const ot of regularTests) {
        const t = ot.test;
        const dept = getDeptName(t) || 'General Department';
        const cat = getCategoryName(t) || '';
        if (!deptCatMap.has(dept))
            deptCatMap.set(dept, new Map());
        const catMap = deptCatMap.get(dept);
        if (!catMap.has(cat))
            catMap.set(cat, []);
        catMap.get(cat).push(ot);
    }
    let regularContentHtml = '';
    if (regularTests.length > 0) {
        let deptBodiesHtml = '';
        for (const [dept, catMap] of deptCatMap) {
            let deptRowsHtml = reportStyle.resultsTable.showDepartmentRow
                ? `<tr class="dept-row"><td colspan="${regularVisibleColumnCount}">${escapeHtml(dept)}</td></tr>`
                : '';
            for (const [cat, tests] of catMap) {
                if (cat && reportStyle.resultsTable.showCategoryRow) {
                    deptRowsHtml += `<tr class="cat-row"><td colspan="${regularVisibleColumnCount}">${escapeHtml(cat)}</td></tr>`;
                }
                deptRowsHtml += tests
                    .map((ot) => {
                    const t = ot.test;
                    const flag = normalizeFlag(ot.flag);
                    const statusText = flagToStatus(flag);
                    const abnormal = isAbnormalFlag(flag);
                    const statusClass = abnormal
                        ? (flag.startsWith('H') ? 'status-high' : 'status-low')
                        : 'status-normal';
                    return `<tr class="${abnormal ? 'abnormal' : ''}">
            <td class="col-test" style="width:${regularTableWidths.test};">${escapeHtml(t?.abbreviation || t?.name || '-')}</td>
            <td class="col-result nowrap" style="width:${regularTableWidths.result};">${escapeHtml(formatResultValue(ot))}</td>
            <td class="col-unit nowrap" style="width:${regularTableWidths.unit};">${escapeHtml(t?.unit || '-')}</td>
            ${showStatusColumn ? `<td class="col-status ${statusClass}" style="width:${regularTableWidths.status};">${escapeHtml(statusText)}</td>` : ''}
            <td class="col-reference reference-value" style="width:${regularTableWidths.reference};">${escapeHtml(formatRange(ot, order.patient?.sex ?? null, ageForRanges))}</td>
          </tr>`;
                })
                    .join('');
            }
            deptBodiesHtml += `<tbody class="regular-dept-block">${deptRowsHtml}</tbody>`;
        }
        regularContentHtml = `<table class="page-table regular-results-table">
      ${regularColGroupHtml}
      <thead>
        <tr><td class="page-header-cell" colspan="${regularVisibleColumnCount}"><div class="page-header-space"></div></td></tr>
        <tr>${regularHeaderCellsHtml}</tr>
      </thead>
      ${deptBodiesHtml}
      <tfoot><tr><td class="page-footer-cell" colspan="${regularVisibleColumnCount}"><div class="page-footer-space"></div></td></tr></tfoot>
    </table>`;
    }
    let pagesHtml = '';
    if (regularTests.length > 0) {
        pagesHtml += `
    <div class="page">
      <div class="content">
        ${regularContentHtml}
        ${commentsText && panelParents.length === 0 && cultureRegularTests.length === 0 ? `<div class="comments" style="margin-top:8px;font-size:11px;font-weight:700;"><strong>Comments:</strong> ${escapeHtml(commentsText)}</div>` : ''}
      </div>
    </div>`;
    }
    if (culturePagesHtml) {
        pagesHtml += culturePagesHtml;
    }
    if (panelPagesHtml) {
        pagesHtml += panelPagesHtml;
    }
    if (regularTests.length === 0 && panelParents.length === 0 && cultureRegularTests.length === 0) {
        pagesHtml += `
    <div class="page">
      <div class="content">
        <div class="regular-empty-state ltr">No tests</div>
      </div>
    </div>`;
    }
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(reportTitleText)}</title>
  <style>
    ${kurdishFontFace}
    @page { size: A4; margin: ${pageMarginTopMm}mm ${pageMarginRightMm}mm ${pageMarginBottomMm}mm ${pageMarginLeftMm}mm; }
    body {
      --header-reserved-height: 92mm;
      --page-margin-top: ${pageMarginTopMm}mm;
      --page-margin-bottom: ${pageMarginBottomMm}mm;
      --content-x: ${contentMarginXMm}mm;
      --footer-height: 18mm;
      --patient-info-bg: ${reportStyle.patientInfo.backgroundColor};
      --patient-info-border-color: ${reportStyle.patientInfo.borderColor};
      --patient-info-radius: ${reportStyle.patientInfo.borderRadiusPx}px;
      --patient-info-padding-y: ${reportStyle.patientInfo.paddingYpx}px;
      --patient-info-padding-x: ${reportStyle.patientInfo.paddingXpx}px;
      --patient-info-margin-top: ${reportStyle.patientInfo.marginTopPx}px;
      --patient-info-margin-bottom: ${reportStyle.patientInfo.marginBottomPx}px;
      --patient-info-divider-width: ${reportStyle.patientInfo.dividerWidthPx}px;
      --patient-info-label-cell-bg: ${reportStyle.patientInfo.labelCellStyle.backgroundColor};
      --patient-info-label-cell-text: ${reportStyle.patientInfo.labelCellStyle.textColor};
      --patient-info-label-font-family: ${patientInfoLabelFontFamily};
      --patient-info-label-font-size: ${reportStyle.patientInfo.labelCellStyle.fontSizePx}px;
      --patient-info-label-font-weight: ${reportStyle.patientInfo.labelCellStyle.fontWeight};
      --patient-info-label-align: ${reportStyle.patientInfo.labelCellStyle.textAlign};
      --patient-info-label-padding-y: ${reportStyle.patientInfo.labelCellStyle.paddingYpx}px;
      --patient-info-label-padding-x: ${reportStyle.patientInfo.labelCellStyle.paddingXpx}px;
      --patient-info-value-cell-bg: ${reportStyle.patientInfo.valueCellStyle.backgroundColor};
      --patient-info-value-cell-text: ${reportStyle.patientInfo.valueCellStyle.textColor};
      --patient-info-value-font-family: ${patientInfoValueFontFamily};
      --patient-info-value-font-size: ${reportStyle.patientInfo.valueCellStyle.fontSizePx}px;
      --patient-info-value-font-weight: ${reportStyle.patientInfo.valueCellStyle.fontWeight};
      --patient-info-value-align: ${reportStyle.patientInfo.valueCellStyle.textAlign};
      --patient-info-value-padding-y: ${reportStyle.patientInfo.valueCellStyle.paddingYpx}px;
      --patient-info-value-padding-x: ${reportStyle.patientInfo.valueCellStyle.paddingXpx}px;
      --patient-info-value-rtl-font-family: ${patientInfoValueRtlFontFamily};
      --report-title-color: ${reportStyle.reportTitle.textColor};
      --report-title-font-size: ${reportStyle.reportTitle.fontSizePx}px;
      --report-title-align: ${reportStyle.reportTitle.textAlign};
      --report-title-weight: ${reportStyle.reportTitle.bold ? 700 : 400};
      --report-title-decoration: ${reportStyle.reportTitle.underline ? 'underline' : 'none'};
      --report-title-padding-y: ${reportStyle.reportTitle.paddingYpx}px;
      --report-title-padding-x: ${reportStyle.reportTitle.paddingXpx}px;
      --report-title-font-family: ${resultsHeaderFontFamily};
      --results-header-bg: ${reportStyle.resultsTable.headerStyle.backgroundColor};
      --results-header-text-color: ${reportStyle.resultsTable.headerStyle.textColor};
      --results-header-border-color: ${reportStyle.resultsTable.headerStyle.borderColor};
      --results-header-font-family: ${resultsHeaderFontFamily};
      --results-header-font-size: ${reportStyle.resultsTable.headerStyle.fontSizePx}px;
      --results-header-align: ${reportStyle.resultsTable.headerStyle.textAlign};
      --results-header-padding-y: ${reportStyle.resultsTable.headerStyle.paddingYpx}px;
      --results-header-padding-x: ${reportStyle.resultsTable.headerStyle.paddingXpx}px;
      --results-header-radius: ${reportStyle.resultsTable.headerStyle.borderRadiusPx}px;
      --results-body-text-color: ${reportStyle.resultsTable.bodyStyle.textColor};
      --results-body-border-color: ${reportStyle.resultsTable.bodyStyle.borderColor};
      --results-body-font-family: ${resultsBodyFontFamily};
      --results-body-font-size: ${reportStyle.resultsTable.bodyStyle.fontSizePx}px;
      --results-cell-align: ${reportStyle.resultsTable.bodyStyle.textAlign};
      --results-body-padding-y: ${reportStyle.resultsTable.bodyStyle.paddingYpx}px;
      --results-body-padding-x: ${reportStyle.resultsTable.bodyStyle.paddingXpx}px;
      --results-body-radius: ${reportStyle.resultsTable.bodyStyle.borderRadiusPx}px;
      --results-panel-section-bg: ${reportStyle.resultsTable.panelSectionStyle.backgroundColor};
      --results-panel-section-text-color: ${reportStyle.resultsTable.panelSectionStyle.textColor};
      --results-panel-section-border-color: ${reportStyle.resultsTable.panelSectionStyle.borderColor};
      --results-panel-section-font-family: ${(0, report_style_config_1.resolveReportFontStackWithArabicFallback)(reportStyle.resultsTable.panelSectionStyle.fontFamily)};
      --results-panel-section-font-size: ${reportStyle.resultsTable.panelSectionStyle.fontSizePx}px;
      --results-panel-section-text-align: ${reportStyle.resultsTable.panelSectionStyle.textAlign};
      --results-panel-section-font-weight: ${reportStyle.resultsTable.panelSectionStyle.bold ? 700 : 400};
      --results-panel-section-border-width: ${reportStyle.resultsTable.panelSectionStyle.borderWidthPx}px;
      --results-panel-section-radius: ${reportStyle.resultsTable.panelSectionStyle.borderRadiusPx}px;
      --results-panel-section-padding-y: ${reportStyle.resultsTable.panelSectionStyle.paddingYpx}px;
      --results-panel-section-padding-x: ${reportStyle.resultsTable.panelSectionStyle.paddingXpx}px;
      --results-panel-section-margin-top: ${reportStyle.resultsTable.panelSectionStyle.marginTopPx}px;
      --results-panel-section-margin-bottom: ${reportStyle.resultsTable.panelSectionStyle.marginBottomPx}px;
      --results-abnormal-row-bg: ${reportStyle.resultsTable.abnormalRowBackgroundColor};
      --results-reference-color: ${reportStyle.resultsTable.referenceValueColor};
      --results-test-color: ${reportStyle.resultsTable.testColumn.textColor};
      --results-test-font-size: ${reportStyle.resultsTable.testColumn.fontSizePx}px;
      --results-test-align: ${reportStyle.resultsTable.testColumn.textAlign};
      --results-test-weight: ${reportStyle.resultsTable.testColumn.bold ? 700 : 400};
      --results-result-color: ${reportStyle.resultsTable.resultColumn.textColor};
      --results-result-font-size: ${reportStyle.resultsTable.resultColumn.fontSizePx}px;
      --results-result-align: ${reportStyle.resultsTable.resultColumn.textAlign};
      --results-result-weight: ${reportStyle.resultsTable.resultColumn.bold ? 700 : 400};
      --results-unit-color: ${reportStyle.resultsTable.unitColumn.textColor};
      --results-unit-font-size: ${reportStyle.resultsTable.unitColumn.fontSizePx}px;
      --results-unit-align: ${reportStyle.resultsTable.unitColumn.textAlign};
      --results-unit-weight: ${reportStyle.resultsTable.unitColumn.bold ? 700 : 400};
      --results-status-column-color: ${reportStyle.resultsTable.statusColumn.textColor};
      --results-status-font-size: ${reportStyle.resultsTable.statusColumn.fontSizePx}px;
      --results-status-align: ${reportStyle.resultsTable.statusColumn.textAlign};
      --results-status-weight: ${reportStyle.resultsTable.statusColumn.bold ? 700 : 400};
      --results-reference-column-color: ${reportStyle.resultsTable.referenceColumn.textColor};
      --results-reference-font-size: ${reportStyle.resultsTable.referenceColumn.fontSizePx}px;
      --results-reference-align: ${reportStyle.resultsTable.referenceColumn.textAlign};
      --results-reference-weight: ${reportStyle.resultsTable.referenceColumn.bold ? 700 : 400};
      --results-dept-bg: ${reportStyle.resultsTable.departmentRowStyle.backgroundColor};
      --results-dept-text-color: ${reportStyle.resultsTable.departmentRowStyle.textColor};
      --results-dept-border-color: ${reportStyle.resultsTable.departmentRowStyle.borderColor};
      --results-dept-font-family: ${resultsDepartmentFontFamily};
      --results-dept-font-size: ${reportStyle.resultsTable.departmentRowStyle.fontSizePx}px;
      --results-dept-text-align: ${reportStyle.resultsTable.departmentRowStyle.textAlign};
      --results-dept-padding-y: ${reportStyle.resultsTable.departmentRowStyle.paddingYpx}px;
      --results-dept-padding-x: ${reportStyle.resultsTable.departmentRowStyle.paddingXpx}px;
      --results-dept-radius: ${reportStyle.resultsTable.departmentRowStyle.borderRadiusPx}px;
      --results-cat-bg: ${reportStyle.resultsTable.categoryRowStyle.backgroundColor};
      --results-cat-text-color: ${reportStyle.resultsTable.categoryRowStyle.textColor};
      --results-cat-border-color: ${reportStyle.resultsTable.categoryRowStyle.borderColor};
      --results-cat-font-family: ${resultsCategoryFontFamily};
      --results-cat-font-size: ${reportStyle.resultsTable.categoryRowStyle.fontSizePx}px;
      --results-cat-text-align: ${reportStyle.resultsTable.categoryRowStyle.textAlign};
      --results-cat-padding-y: ${reportStyle.resultsTable.categoryRowStyle.paddingYpx}px;
      --results-cat-padding-x: ${reportStyle.resultsTable.categoryRowStyle.paddingXpx}px;
      --results-cat-radius: ${reportStyle.resultsTable.categoryRowStyle.borderRadiusPx}px;
      --results-status-normal-color: ${reportStyle.resultsTable.statusNormalColor};
      --results-status-high-color: ${reportStyle.resultsTable.statusHighColor};
      --results-status-low-color: ${reportStyle.resultsTable.statusLowColor};
      --results-regular-dept-break: ${reportStyle.resultsTable.regularDepartmentBlockBreak};
      --results-regular-row-break: ${reportStyle.resultsTable.regularRowBreak};
      --results-panel-table-break: ${reportStyle.resultsTable.panelTableBreak};
      --results-panel-row-break: ${reportStyle.resultsTable.panelRowBreak};
      --culture-font-family: ${cultureSectionFontFamily};
      --culture-section-title-color: ${reportStyle.cultureSection.sectionTitleColor};
      --culture-section-title-border-color: ${reportStyle.cultureSection.sectionTitleBorderColor};
      --culture-section-title-align: ${reportStyle.cultureSection.sectionTitleAlign};
      --culture-no-growth-bg: ${reportStyle.cultureSection.noGrowthBackgroundColor};
      --culture-no-growth-border: ${reportStyle.cultureSection.noGrowthBorderColor};
      --culture-no-growth-text: ${reportStyle.cultureSection.noGrowthTextColor};
      --culture-no-growth-padding-y: ${reportStyle.cultureSection.noGrowthPaddingYpx}px;
      --culture-no-growth-padding-x: ${reportStyle.cultureSection.noGrowthPaddingXpx}px;
      --culture-meta-text: ${reportStyle.cultureSection.metaTextColor};
      --culture-meta-align: ${reportStyle.cultureSection.metaTextAlign};
      --culture-comment-text: ${reportStyle.cultureSection.commentTextColor};
      --culture-comment-align: ${reportStyle.cultureSection.commentTextAlign};
      --culture-notes-text: ${reportStyle.cultureSection.notesTextColor};
      --culture-notes-border: ${reportStyle.cultureSection.notesBorderColor};
      --culture-notes-align: ${reportStyle.cultureSection.notesTextAlign};
      --culture-notes-padding-y: ${reportStyle.cultureSection.notesPaddingYpx}px;
      --culture-notes-padding-x: ${reportStyle.cultureSection.notesPaddingXpx}px;
      --culture-ast-gap: ${reportStyle.cultureSection.astGridGapPx}px;
      --culture-ast-min-height: ${reportStyle.cultureSection.astMinHeightPx}px;
      --culture-ast-column-radius: ${reportStyle.cultureSection.astColumnBorderRadiusPx}px;
      --culture-ast-column-padding: ${reportStyle.cultureSection.astColumnPaddingPx}px;
      --culture-ast-title-color: ${reportStyle.cultureSection.astColumnTitleColor};
      --culture-ast-title-border: ${reportStyle.cultureSection.astColumnTitleBorderColor};
      --culture-ast-body-text: ${reportStyle.cultureSection.astBodyTextColor};
      --culture-ast-empty-text: ${reportStyle.cultureSection.astEmptyTextColor};
      --culture-ast-sensitive-border: ${reportStyle.cultureSection.astSensitiveBorderColor};
      --culture-ast-sensitive-bg: ${reportStyle.cultureSection.astSensitiveBackgroundColor};
      --culture-ast-intermediate-border: ${reportStyle.cultureSection.astIntermediateBorderColor};
      --culture-ast-intermediate-bg: ${reportStyle.cultureSection.astIntermediateBackgroundColor};
      --culture-ast-resistance-border: ${reportStyle.cultureSection.astResistanceBorderColor};
      --culture-ast-resistance-bg: ${reportStyle.cultureSection.astResistanceBackgroundColor};
      margin: 0;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 12px;
      color: var(--results-body-text-color);
      position: relative;
    }
    .rtl {
      direction: rtl;
      unicode-bidi: isolate;
      font-family: 'KurdishReportFont', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;
      letter-spacing: 0;
      word-spacing: 0;
    }
    .ltr { direction: ltr; unicode-bidi: isolate; }
    .nowrap { white-space: nowrap; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); opacity: 0.08; width: min(68vw, 170mm); z-index: 0; pointer-events: none; }
    .page-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .page + .page {
      page-break-before: always;
      break-before: page;
    }
    .regular-results-page,
    .regular-results-page .regular-results-table {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .page-header-space { height: var(--header-reserved-height); display: block; }
    .page-footer-space { height: var(--footer-height); display: block; }
    .page-header-cell,
    .page-footer-cell {
      padding: 0;
      border: 0;
    }
    .panel-title-cell {
      padding: 0;
      border: 0;
      background: transparent;
    }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tbody { display: table-row-group; }

    .report-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--header-reserved-height);
      padding: 0 var(--content-x) 0 var(--content-x);
      background: white;
      z-index: 1000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .report-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 0 var(--content-x) 5mm var(--content-x);
      height: var(--footer-height);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      text-align: center;
      overflow: hidden;
      background: white;
      z-index: 1000;
    }
    .patient-info,
    .content { margin-left: var(--content-x); margin-right: var(--content-x); }
    .banner-wrap {
      width: calc(100% - (var(--content-x) * 2));
      margin: 0 auto 6px auto;
    }
    .banner-image {
      width: 100%;
      height: auto;
      display: block;
    }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #222; padding: 0 var(--content-x) 8px var(--content-x); }
    .logo-only-wrap { display: flex; justify-content: center; align-items: center; margin: 2px 0 8px; }
    .header-spacer {
      height: 90px;
      margin: 0 var(--content-x) 8px var(--content-x);
      border-bottom: 2px solid #222;
      box-sizing: border-box;
    }
    .header-col { flex: 1; font-size: 13px; font-weight: 700; line-height: 1.35; }
    .header-col.ltr { text-align: left; }
    .header-col.rtl {
      text-align: right;
      font-family: 'KurdishReportFont', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;
    }
    .header-col.rtl * {
      direction: rtl;
      unicode-bidi: isolate;
      font-family: 'KurdishReportFont', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;
      letter-spacing: 0;
      word-spacing: 0;
      font-feature-settings: "liga" 1, "calt" 1, "kern" 1;
    }
    .logo-wrap { flex: 0 0 120px; text-align: center; }
    .logo { width: 90px; height: auto; object-fit: contain; }
    .report-title {
      text-align: var(--report-title-align);
      color: var(--report-title-color);
      font-size: var(--report-title-font-size);
      font-weight: var(--report-title-weight);
      font-family: var(--report-title-font-family);
      text-decoration: var(--report-title-decoration);
      padding: var(--report-title-padding-y) var(--report-title-padding-x);
      margin: 0 0 6px;
    }
    .patient-info {
      margin-top: var(--patient-info-margin-top);
      margin-bottom: var(--patient-info-margin-bottom);
      border: 1px solid var(--patient-info-border-color);
      border-radius: var(--patient-info-radius);
      padding: var(--patient-info-padding-y) var(--patient-info-padding-x);
      background: var(--patient-info-bg);
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
    .patient-info.has-order-qr {
      grid-template-columns: minmax(0, 1fr) 66px;
      column-gap: 10px;
      align-items: start;
    }
    .patient-info-table-wrap { min-width: 0; }
    .patient-info-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      margin: 0;
    }
    .patient-info-label-cell,
    .patient-info-value-cell {
      vertical-align: middle;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .patient-info-label-cell {
      background: var(--patient-info-label-cell-bg);
      color: var(--patient-info-label-cell-text);
      font-family: var(--patient-info-label-font-family);
      font-size: var(--patient-info-label-font-size);
      font-weight: var(--patient-info-label-font-weight);
      text-align: var(--patient-info-label-align);
      padding: var(--patient-info-label-padding-y) var(--patient-info-label-padding-x);
      border-right: var(--patient-info-divider-width) solid var(--patient-info-border-color);
      border-bottom: var(--patient-info-divider-width) solid var(--patient-info-border-color);
    }
    .patient-info-value-cell {
      background: var(--patient-info-value-cell-bg);
      color: var(--patient-info-value-cell-text);
      font-family: var(--patient-info-value-font-family);
      font-size: var(--patient-info-value-font-size);
      font-weight: var(--patient-info-value-font-weight);
      text-align: var(--patient-info-value-align);
      padding: var(--patient-info-value-padding-y) var(--patient-info-value-padding-x);
      border-right: var(--patient-info-divider-width) solid var(--patient-info-border-color);
      border-bottom: var(--patient-info-divider-width) solid var(--patient-info-border-color);
    }
    .patient-info-table tr:last-child .patient-info-label-cell,
    .patient-info-table tr:last-child .patient-info-value-cell {
      border-bottom: 0;
    }
    .patient-info-table td:last-child {
      border-right: 0;
    }
    .patient-info-value-text,
    .name-value {
      display: block;
      width: 100%;
      text-align: inherit;
      font-weight: inherit;
    }
    .patient-info-qr {
      width: 66px;
      justify-self: end;
      align-self: start;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      text-align: center;
    }
    .patient-info-qr-image {
      width: 62px;
      height: 62px;
      display: block;
      object-fit: contain;
      border: 1px solid var(--patient-info-border-color);
      border-radius: 3px;
      background: #fff;
      padding: 2px;
      box-sizing: border-box;
    }
    .patient-info-qr-caption {
      font-size: 9px;
      line-height: 1.05;
      color: var(--patient-info-label-cell-text);
      font-weight: 600;
    }
    .rtl-text {
      direction: rtl;
      unicode-bidi: isolate;
      font-family: var(--patient-info-value-rtl-font-family);
      letter-spacing: 0;
      word-spacing: 0;
      font-feature-settings: "liga" 1, "calt" 1, "kern" 1;
    }
    .content { padding: 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-family: var(--results-body-font-family); }
    th {
      padding: var(--results-header-padding-y) var(--results-header-padding-x);
      border: 1px solid var(--results-header-border-color);
      background: var(--results-header-bg);
      color: var(--results-header-text-color);
      font-weight: 700;
      font-family: var(--results-header-font-family);
      font-size: var(--results-header-font-size);
      text-align: var(--results-header-align);
      border-radius: var(--results-header-radius);
    }
    th:first-child {
      border-top-left-radius: var(--results-header-radius);
      border-bottom-left-radius: var(--results-header-radius);
    }
    th:last-child {
      border-top-right-radius: var(--results-header-radius);
      border-bottom-right-radius: var(--results-header-radius);
    }
    td {
      padding: var(--results-body-padding-y) var(--results-body-padding-x);
      border: 1px solid var(--results-body-border-color);
      color: var(--results-body-text-color);
      font-family: var(--results-body-font-family);
      font-size: var(--results-body-font-size);
      text-align: var(--results-cell-align);
      border-radius: var(--results-body-radius);
    }
    tr:not(.dept-row):not(.cat-row) td:first-child {
      border-top-left-radius: var(--results-body-radius);
      border-bottom-left-radius: var(--results-body-radius);
    }
    tr:not(.dept-row):not(.cat-row) td:last-child {
      border-top-right-radius: var(--results-body-radius);
      border-bottom-right-radius: var(--results-body-radius);
    }
    td.col-test { text-align: var(--results-test-align); }
    td.col-test {
      color: var(--results-test-color);
      font-size: var(--results-test-font-size);
      font-weight: var(--results-test-weight);
    }
    td.col-result { text-align: var(--results-result-align); }
    td.col-result {
      color: var(--results-result-color);
      font-size: var(--results-result-font-size);
      font-weight: var(--results-result-weight);
    }
    td.col-unit { text-align: var(--results-unit-align); }
    td.col-unit {
      color: var(--results-unit-color);
      font-size: var(--results-unit-font-size);
      font-weight: var(--results-unit-weight);
    }
    td.col-status { text-align: var(--results-status-align); }
    td.col-status {
      color: var(--results-status-column-color);
      font-size: var(--results-status-font-size);
      font-weight: var(--results-status-weight);
    }
    td.col-reference { text-align: var(--results-reference-align); }
    td.col-reference {
      color: var(--results-reference-column-color);
      font-size: var(--results-reference-font-size);
      font-weight: var(--results-reference-weight);
    }
    .regular-results-table,
    .panel-results-table,
    .gue-gse-table {
      width: 100%;
      table-layout: fixed;
    }
    .regular-results-table {
      page-break-inside: auto;
      break-inside: auto;
    }
    .regular-results-table thead {
      display: table-header-group;
    }
    .regular-results-table tbody {
      display: table-row-group;
    }
    .regular-results-table tbody.regular-dept-block {
      page-break-inside: var(--results-regular-dept-break);
      break-inside: var(--results-regular-dept-break);
    }
    .regular-results-table tr {
      page-break-inside: var(--results-regular-row-break);
      break-inside: var(--results-regular-row-break);
    }
    .regular-results-table .dept-row td {
      background: var(--results-dept-bg);
      color: var(--results-dept-text-color);
      border-color: var(--results-dept-border-color);
      padding: var(--results-dept-padding-y) var(--results-dept-padding-x);
      font-weight: 800;
      font-family: var(--results-dept-font-family);
      font-size: var(--results-dept-font-size);
      text-align: var(--results-dept-text-align);
      border-radius: var(--results-dept-radius);
    }
    .regular-results-table .dept-row td {
      border-radius: var(--results-dept-radius);
    }
    .regular-results-table .cat-row td {
      background: var(--results-cat-bg);
      color: var(--results-cat-text-color);
      padding: var(--results-cat-padding-y) var(--results-cat-padding-x);
      font-weight: 700;
      border: 1px solid var(--results-cat-border-color);
      font-family: var(--results-cat-font-family);
      font-size: var(--results-cat-font-size);
      text-align: var(--results-cat-text-align);
      border-radius: var(--results-cat-radius);
    }
    .regular-results-table .cat-row td {
      border-radius: var(--results-cat-radius);
    }
    .regular-empty-state {
      background: #222;
      color: #fff;
      padding: 8px 12px;
      font-weight: 800;
      margin-top: 12px;
    }
    td.col-status.status-low { color: var(--results-status-low-color); font-weight: 700; }
    td.col-status.status-high { color: var(--results-status-high-color); font-weight: 700; }
    td.col-status.status-normal { color: var(--results-status-normal-color); font-weight: var(--results-status-weight); }
    .reference-value { color: var(--results-reference-column-color); white-space: pre-wrap; word-break: break-word; }
    .param-abnormal { color: #c00; font-size: 11px; font-weight: 600; margin-left: 4px; }
    tr.abnormal td { background-color: var(--results-abnormal-row-bg); }
    .panel-section { margin-top: 20px; }
    .panel-page-title { font-size: 18px; font-weight: 800; margin: 0 0 12px; border-bottom: 2px solid #222; padding-bottom: 6px; }
    .panel-page { page-break-inside: auto; break-inside: auto; }
    .panel-page .content { padding: 0; overflow: visible; }
    .panel-page .panel-section { page-break-inside: auto; break-inside: auto; }
    .panel-page table { page-break-inside: var(--results-panel-table-break); break-inside: var(--results-panel-table-break); }
    .panel-page tr { page-break-inside: var(--results-panel-row-break); break-inside: var(--results-panel-row-break); }
    .gue-gse-table { margin-top: 8px; margin-bottom: 12px; }
    .panel-section-row td {
      padding: 0;
      border: 0;
      background: transparent;
    }
    .panel-section-cell {
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
    }
    .panel-section-label {
      margin-top: var(--results-panel-section-margin-top);
      margin-bottom: var(--results-panel-section-margin-bottom);
      background: var(--results-panel-section-bg);
      color: var(--results-panel-section-text-color);
      border: var(--results-panel-section-border-width) solid var(--results-panel-section-border-color);
      border-radius: var(--results-panel-section-radius);
      padding: var(--results-panel-section-padding-y) var(--results-panel-section-padding-x);
      font-family: var(--results-panel-section-font-family);
      font-size: var(--results-panel-section-font-size);
      font-weight: var(--results-panel-section-font-weight);
      text-align: var(--results-panel-section-text-align);
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .culture-page .panel-page-title {
      color: var(--culture-section-title-color);
      border-bottom-color: var(--culture-section-title-border-color);
      font-family: var(--culture-font-family);
      text-align: var(--culture-section-title-align);
    }
    .culture-page .content {
      padding: 0;
      overflow: visible;
      display: flex;
      flex-direction: column;
    }
    .culture-no-growth {
      background: var(--culture-no-growth-bg);
      border: 1px solid var(--culture-no-growth-border);
      color: var(--culture-no-growth-text);
      font-weight: 700;
      padding: var(--culture-no-growth-padding-y) var(--culture-no-growth-padding-x);
      border-radius: 6px;
      margin-bottom: 10px;
      font-family: var(--culture-font-family);
      text-align: var(--culture-meta-align);
    }
    .culture-no-growth-result {
      font-size: 11px;
      color: var(--culture-meta-text);
      font-weight: 400;
      margin-bottom: 4px;
      font-family: var(--culture-font-family);
      text-align: var(--culture-meta-align);
    }
    .culture-isolate-block {
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .culture-isolate-title {
      font-size: 13px;
      margin-bottom: 4px;
      color: var(--culture-meta-text);
      font-family: var(--culture-font-family);
      text-align: var(--culture-meta-align);
    }
    .culture-isolate-title-label { font-weight: 700; }
    .culture-isolate-title-value { font-style: italic; font-weight: 600; color: var(--culture-section-title-color); }
    .culture-isolate-source {
      font-size: 11px;
      color: var(--culture-meta-text);
      margin-bottom: 4px;
      font-family: var(--culture-font-family);
      text-align: var(--culture-meta-align);
    }
    .culture-isolate-comment {
      font-size: 11px;
      color: var(--culture-comment-text);
      margin-bottom: 6px;
      font-family: var(--culture-font-family);
      text-align: var(--culture-comment-align);
    }
    .culture-ast-grid {
      width: 100%;
      display: grid;
      gap: var(--culture-ast-gap);
      margin-bottom: 8px;
      flex: 1;
      align-items: stretch;
      min-height: var(--culture-ast-min-height);
    }
    .culture-ast-grid-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .culture-ast-grid-four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .culture-ast-column {
      border: 1px solid #d1d5db;
      border-radius: var(--culture-ast-column-radius);
      background: #f8fafc;
      padding: var(--culture-ast-column-padding);
      min-height: 92px;
      display: flex;
      flex-direction: column;
    }
    .culture-ast-column-sensitive {
      border-color: var(--culture-ast-sensitive-border);
      background: var(--culture-ast-sensitive-bg);
    }
    .culture-ast-column-intermediate {
      border-color: var(--culture-ast-intermediate-border);
      background: var(--culture-ast-intermediate-bg);
    }
    .culture-ast-column-resistance-primary,
    .culture-ast-column-resistance-secondary {
      border-color: var(--culture-ast-resistance-border);
      background: var(--culture-ast-resistance-bg);
    }
    .culture-ast-column-title {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--culture-ast-title-color);
      border-bottom: 1px solid var(--culture-ast-title-border);
      padding-bottom: 2px;
      font-family: var(--culture-font-family);
    }
    .culture-ast-list {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
    }
    .culture-ast-item {
      font-size: 10.5px;
      line-height: 1.35;
      margin: 0 0 2px 0;
      word-break: break-word;
      color: var(--culture-ast-body-text);
      font-family: var(--culture-font-family);
    }
    .culture-ast-empty {
      list-style: none;
      font-size: 10.5px;
      color: var(--culture-ast-empty-text);
      margin: 0;
      font-family: var(--culture-font-family);
    }
    .culture-notes {
      margin-top: 8px;
      font-size: 11px;
      border-top: 1px dashed var(--culture-notes-border);
      color: var(--culture-notes-text);
      padding: var(--culture-notes-padding-y) var(--culture-notes-padding-x) 0;
      font-family: var(--culture-font-family);
      text-align: var(--culture-notes-align);
    }
    ${rowStripeCss}
    .report-footer-placeholder { min-height: var(--footer-height); }
    .footer-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center bottom;
      display: block;
    }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
  ${watermarkUrlAttr ? `<img ${watermarkUrlAttr} class="watermark" alt="Watermark" />` : ''}
  ${pageHeaderHtml}
  ${pagesHtml}
  ${pageFooterHtml}
</body>
</html>
  `;
}
//# sourceMappingURL=results-report.template.js.map