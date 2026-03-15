"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ReportsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const order_entity_1 = require("../entities/order.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const patient_entity_1 = require("../entities/patient.entity");
const lab_entity_1 = require("../entities/lab.entity");
const user_entity_1 = require("../entities/user.entity");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const test_entity_1 = require("../entities/test.entity");
const results_report_template_1 = require("./html/results-report.template");
const report_design_fingerprint_util_1 = require("./report-design-fingerprint.util");
const normal_range_util_1 = require("../tests/normal-range.util");
const patient_age_util_1 = require("../patients/patient-age.util");
const order_test_result_util_1 = require("../order-tests/order-test-result.util");
const REPORT_BANNER_WIDTH = 2480;
const REPORT_BANNER_HEIGHT = 220;
function formatDateTime(value) {
    if (!value)
        return '-';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return '-';
    return d.toLocaleString();
}
function getNormalRange(test, sex, patientAge) {
    const { normalMin: min, normalMax: max } = (0, normal_range_util_1.resolveNumericRange)(test, sex, patientAge);
    const resolvedText = (0, normal_range_util_1.resolveNormalText)(test, sex);
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
function formatResultValue(ot) {
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
            const antibioticRows = cultureResult.isolates.reduce((sum, isolate) => {
                if (!isolate || typeof isolate !== 'object')
                    return sum;
                const rows = Array.isArray(isolate.antibiotics)
                    ? (isolate.antibiotics?.length ?? 0)
                    : 0;
                return sum + rows;
            }, 0);
            return `${cultureResult.isolates.length} isolate${cultureResult.isolates.length === 1 ? '' : 's'} • ${antibioticRows} row${antibioticRows === 1 ? '' : 's'}`;
        }
    }
    if (ot.resultText?.trim())
        return ot.resultText.trim();
    if (ot.resultValue !== null && ot.resultValue !== undefined)
        return String(ot.resultValue);
    return 'Pending';
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
function hasNonEmptyResultParameters(params) {
    if (!params || typeof params !== 'object') {
        return false;
    }
    return Object.values(params).some((value) => String(value ?? '').trim() !== '');
}
function formatResultParameters(params) {
    if (!params)
        return [];
    return Object.entries(params)
        .filter(([, v]) => v != null && String(v).trim() !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}: ${String(v).trim()}`);
}
function drawHeaderBar(doc, opts) {
    const pageWidth = doc.page.width;
    const margin = doc.page.margins.left;
    const barHeight = 54;
    doc.save();
    doc.rect(0, 0, pageWidth, barHeight).fill('#0B5FFF');
    doc.fillColor('#FFFFFF');
    doc.font('Helvetica-Bold').fontSize(16).text(opts.labName || 'Laboratory', margin, 14, {
        width: pageWidth - margin * 2,
        align: 'left',
    });
    doc.font('Helvetica').fontSize(10).text(opts.title, margin, 34, {
        width: pageWidth - margin * 2,
        align: 'left',
    });
    if (opts.subtitle?.trim()) {
        doc.text(opts.subtitle.trim(), margin, 34, {
            width: pageWidth - margin * 2,
            align: 'right',
        });
    }
    if (opts.logoImage) {
        try {
            const logoSize = 34;
            doc.image(opts.logoImage, pageWidth - margin - logoSize, 10, { fit: [logoSize, logoSize], align: 'center', valign: 'center' });
        }
        catch {
        }
    }
    doc.restore();
    doc.y = barHeight + 18;
}
function drawTwoColumnInfo(doc, left, right) {
    const startX = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const gutter = 16;
    const colWidth = (usableWidth - gutter) / 2;
    const labelColor = '#5B667A';
    const valueColor = '#111827';
    const labelFontSize = 8;
    const valueFontSize = 10;
    const rowGap = 10;
    const startY = doc.y;
    const drawColumn = (items, x) => {
        let y = startY;
        for (const [label, value] of items) {
            doc.fillColor(labelColor).font('Helvetica').fontSize(labelFontSize).text(label, x, y, {
                width: colWidth,
            });
            y += 10;
            doc.fillColor(valueColor).font('Helvetica-Bold').fontSize(valueFontSize).text(value || '-', x, y, {
                width: colWidth,
            });
            y += rowGap;
        }
        return y;
    };
    const yLeft = drawColumn(left, startX);
    const yRight = drawColumn(right, startX + colWidth + gutter);
    doc.y = Math.max(yLeft, yRight) + 8;
    doc.save();
    doc.strokeColor('#E5E7EB').lineWidth(1);
    doc.moveTo(startX, doc.y).lineTo(startX + usableWidth, doc.y).stroke();
    doc.restore();
    doc.moveDown(1);
}
function ensureSpace(doc, neededHeight, onNewPage) {
    const bottomY = doc.page.height - doc.page.margins.bottom;
    if (doc.y + neededHeight <= bottomY)
        return;
    doc.addPage();
    onNewPage?.();
}
function resolveReadablePath(candidates) {
    for (const candidate of candidates) {
        if ((0, fs_1.existsSync)(candidate))
            return candidate;
    }
    return null;
}
function buildLabReportDesignFingerprint(lab) {
    const reportLab = (lab ?? {});
    return (0, report_design_fingerprint_util_1.buildReportDesignFingerprint)({
        reportBranding: {
            bannerDataUrl: reportLab.reportBannerDataUrl ?? null,
            footerDataUrl: reportLab.reportFooterDataUrl ?? null,
            logoDataUrl: reportLab.reportLogoDataUrl ?? null,
            watermarkDataUrl: reportLab.reportWatermarkDataUrl ?? null,
        },
        reportStyle: reportLab.reportStyle ?? null,
    });
}
let ReportsService = ReportsService_1 = class ReportsService {
    constructor(orderRepo, orderTestRepo, patientRepo, labRepo, userRepo, auditLogRepo) {
        this.orderRepo = orderRepo;
        this.orderTestRepo = orderTestRepo;
        this.patientRepo = patientRepo;
        this.labRepo = labRepo;
        this.userRepo = userRepo;
        this.auditLogRepo = auditLogRepo;
        this.logger = new common_1.Logger(ReportsService_1.name);
        this.browserPromise = null;
        this.pdfCache = new Map();
        this.pdfInFlight = new Map();
        this.pdfCacheTtlMs = this.parseEnvInt('REPORTS_PDF_CACHE_TTL_MS', 120_000, 0, 900_000);
        this.pdfCacheMaxEntries = this.parseEnvInt('REPORTS_PDF_CACHE_MAX_ENTRIES', 30, 1, 1000);
        this.pdfPerfLogThresholdMs = this.parseEnvInt('REPORTS_PDF_PERF_LOG_THRESHOLD_MS', 500, 0, 60_000);
    }
    parseEnvInt(name, fallback, min, max) {
        const raw = process.env[name];
        if (!raw)
            return fallback;
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed))
            return fallback;
        if (parsed < min)
            return min;
        if (parsed > max)
            return max;
        return parsed;
    }
    onModuleInit() {
        this.getBrowser().catch(() => { });
    }
    async getBrowser() {
        if (!this.browserPromise) {
            this.browserPromise = (async () => {
                const { chromium } = await Promise.resolve().then(() => require('playwright'));
                return chromium.launch({
                    headless: true,
                    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
                    args: [
                        '--disable-gpu',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                    ],
                });
            })();
        }
        return this.browserPromise;
    }
    async renderPdfFromHtml(html) {
        const browser = await this.getBrowser();
        const pxPerInch = 96;
        const mmPerInch = 25.4;
        const a4WidthPx = Math.round((210 / mmPerInch) * pxPerInch);
        const a4HeightPx = Math.round((297 / mmPerInch) * pxPerInch);
        const page = await browser.newPage({
            viewport: { width: a4WidthPx, height: a4HeightPx },
            deviceScaleFactor: 2,
        });
        try {
            await page.setContent(html, { waitUntil: 'domcontentloaded' });
            try {
                await page.emulateMedia({ media: 'print' });
            }
            catch {
            }
            await page.evaluate(async () => {
                const fontReady = document.fonts?.ready;
                if (fontReady) {
                    try {
                        await fontReady;
                    }
                    catch {
                    }
                }
                const images = Array.from(document.images || []);
                await Promise.all(images
                    .filter((img) => !img.complete)
                    .map((img) => new Promise((resolve) => {
                    const done = () => {
                        img.removeEventListener('load', done);
                        img.removeEventListener('error', done);
                        resolve();
                    };
                    img.addEventListener('load', done);
                    img.addEventListener('error', done);
                })));
            });
            await page.evaluate(() => {
                const createMmProbe = () => {
                    const probe = document.createElement('div');
                    probe.style.position = 'absolute';
                    probe.style.visibility = 'hidden';
                    probe.style.height = '100mm';
                    probe.style.width = '1mm';
                    document.body.appendChild(probe);
                    const pxPerMm = probe.getBoundingClientRect().height / 100;
                    probe.remove();
                    return pxPerMm || 3.78;
                };
                const pxPerMm = createMmProbe();
                const toMm = (px) => (pxPerMm > 0 ? px / pxPerMm : px);
                const header = document.querySelector('.report-header');
                if (header) {
                    const prevHeight = header.style.height;
                    const prevMinHeight = header.style.minHeight;
                    header.style.height = 'auto';
                    header.style.minHeight = '0';
                    const headerRect = header.getBoundingClientRect();
                    let contentBottom = headerRect.top;
                    const title = header.querySelector('.report-title');
                    if (title) {
                        const rect = title.getBoundingClientRect();
                        let marginBottom = 0;
                        try {
                            const style = window.getComputedStyle(title);
                            marginBottom = parseFloat(style.marginBottom || '0') || 0;
                        }
                        catch {
                            marginBottom = 0;
                        }
                        contentBottom = rect.bottom + marginBottom;
                    }
                    else {
                        const headerChildren = Array.from(header.children || []);
                        for (const child of headerChildren) {
                            const rect = child.getBoundingClientRect();
                            if (rect.bottom > contentBottom) {
                                contentBottom = rect.bottom;
                            }
                        }
                        const lastChild = header.lastElementChild;
                        if (lastChild) {
                            try {
                                const style = window.getComputedStyle(lastChild);
                                const marginBottom = parseFloat(style.marginBottom || '0') || 0;
                                if (marginBottom > 0) {
                                    contentBottom += marginBottom;
                                }
                            }
                            catch {
                            }
                        }
                    }
                    const measuredHeight = contentBottom > headerRect.top
                        ? contentBottom - headerRect.top + 4
                        : Math.max(header.scrollHeight, headerRect.height);
                    let cloneHeight = 0;
                    try {
                        const clone = header.cloneNode(true);
                        clone.style.position = 'static';
                        clone.style.visibility = 'hidden';
                        clone.style.height = 'auto';
                        clone.style.minHeight = '0';
                        clone.style.maxHeight = 'none';
                        clone.style.overflow = 'visible';
                        clone.style.pointerEvents = 'none';
                        clone.style.top = 'auto';
                        clone.style.left = 'auto';
                        clone.style.right = 'auto';
                        clone.style.zIndex = '-1';
                        document.body.prepend(clone);
                        cloneHeight = clone.getBoundingClientRect().height || 0;
                        clone.remove();
                    }
                    catch {
                        cloneHeight = 0;
                    }
                    const finalHeight = Math.max(measuredHeight, cloneHeight);
                    if (finalHeight > 0) {
                        const roundedMm = Math.ceil(toMm(finalHeight) * 10) / 10;
                        document.body.style.setProperty('--header-reserved-height', `${roundedMm}mm`);
                    }
                    header.style.height = prevHeight;
                    header.style.minHeight = prevMinHeight;
                }
                const footer = document.querySelector('.report-footer');
                if (footer) {
                    const prevHeight = footer.style.height;
                    const prevMinHeight = footer.style.minHeight;
                    footer.style.height = 'auto';
                    footer.style.minHeight = '0';
                    const footerRect = footer.getBoundingClientRect();
                    const footerStyle = window.getComputedStyle(footer);
                    const footerPaddingBottom = parseFloat(footerStyle.paddingBottom || '0') || 0;
                    let contentBottom = footerRect.top;
                    const footerChildren = Array.from(footer.children || []);
                    for (const child of footerChildren) {
                        const rect = child.getBoundingClientRect();
                        if (rect.bottom > contentBottom) {
                            contentBottom = rect.bottom;
                        }
                    }
                    const measuredHeight = contentBottom > footerRect.top
                        ? contentBottom - footerRect.top + footerPaddingBottom
                        : Math.max(footer.scrollHeight, footerRect.height);
                    if (measuredHeight > 0) {
                        const roundedMm = Math.ceil(toMm(measuredHeight) * 10) / 10;
                        document.body.style.setProperty('--footer-height', `${roundedMm}mm`);
                    }
                    footer.style.height = prevHeight;
                    footer.style.minHeight = prevMinHeight;
                }
            });
            await page.evaluate(() => {
                const table = document.querySelector('table.regular-results-table');
                if (!table)
                    return;
                const sourcePage = table.closest('.page');
                const sourceContent = table.closest('.content');
                if (!sourcePage || !sourceContent)
                    return;
                const tableHead = table.querySelector('thead');
                const tableFoot = table.querySelector('tfoot');
                const tableColGroup = table.querySelector('colgroup');
                if (!tableHead || !tableFoot)
                    return;
                const pageComments = sourceContent.querySelector('.comments');
                const headerSpace = table.querySelector('thead .page-header-space');
                const footerSpace = table.querySelector('tfoot .page-footer-space');
                const headerRows = Array.from(table.querySelectorAll('thead tr'));
                const columnHeaderRow = headerRows[headerRows.length - 1] ?? null;
                const bodyStyle = window.getComputedStyle(document.body);
                const createMmProbe = () => {
                    const probe = document.createElement('div');
                    probe.style.position = 'absolute';
                    probe.style.visibility = 'hidden';
                    probe.style.height = '100mm';
                    probe.style.width = '1mm';
                    document.body.appendChild(probe);
                    const pxPerMm = probe.getBoundingClientRect().height / 100;
                    probe.remove();
                    return pxPerMm || 3.78;
                };
                const pxPerMm = createMmProbe();
                const pageHeightPx = Math.max(1, 297 * pxPerMm);
                const marginTopPx = (parseFloat(bodyStyle.getPropertyValue('--page-margin-top') || '0') || 0) * pxPerMm;
                const marginBottomPx = (parseFloat(bodyStyle.getPropertyValue('--page-margin-bottom') || '0') || 0) * pxPerMm;
                const printableHeightPx = Math.max(1, pageHeightPx - marginTopPx - marginBottomPx);
                const headerSpaceHeight = headerSpace?.getBoundingClientRect().height || 0;
                const footerSpaceHeight = footerSpace?.getBoundingClientRect().height || 0;
                const columnHeaderHeight = columnHeaderRow?.getBoundingClientRect().height || 0;
                const paginationSafetyPx = Math.ceil(pxPerMm * 2);
                const availableBodyHeight = Math.max(24, printableHeightPx -
                    headerSpaceHeight -
                    footerSpaceHeight -
                    columnHeaderHeight -
                    paginationSafetyPx);
                const rows = Array.from(table.querySelectorAll('tbody tr')).filter((row) => row.getAttribute('data-repeat') !== '1');
                if (rows.length === 0)
                    return;
                const chunks = [];
                let currentRows = [];
                let currentHeight = 0;
                let lastDept = { row: null, height: 0 };
                let lastCat = { row: null, height: 0 };
                const cloneRepeatRow = (row) => {
                    if (!row)
                        return null;
                    const clone = row.cloneNode(true);
                    clone.setAttribute('data-repeat', '1');
                    return clone;
                };
                const pushChunk = () => {
                    if (currentRows.length === 0)
                        return;
                    chunks.push({ rows: currentRows, comments: false });
                    currentRows = [];
                    currentHeight = 0;
                };
                for (const row of rows) {
                    const rowHeight = Math.ceil(row.getBoundingClientRect().height || 0);
                    const isDeptRow = row.classList.contains('dept-row');
                    const isCatRow = row.classList.contains('cat-row');
                    if (currentRows.length > 0 && currentHeight + rowHeight > availableBodyHeight) {
                        pushChunk();
                        if (!isDeptRow && !isCatRow) {
                            if (lastDept.row) {
                                const deptClone = cloneRepeatRow(lastDept.row);
                                if (deptClone) {
                                    currentRows.push(deptClone);
                                    currentHeight += lastDept.height;
                                }
                            }
                            if (lastCat.row) {
                                const catClone = cloneRepeatRow(lastCat.row);
                                if (catClone) {
                                    currentRows.push(catClone);
                                    currentHeight += lastCat.height;
                                }
                            }
                        }
                        else if (isCatRow && lastDept.row) {
                            const deptClone = cloneRepeatRow(lastDept.row);
                            if (deptClone) {
                                currentRows.push(deptClone);
                                currentHeight += lastDept.height;
                            }
                        }
                    }
                    currentRows.push(row.cloneNode(true));
                    currentHeight += rowHeight;
                    if (isDeptRow) {
                        lastDept = { row, height: rowHeight };
                        lastCat = { row: null, height: 0 };
                    }
                    else if (isCatRow) {
                        lastCat = { row, height: rowHeight };
                    }
                }
                pushChunk();
                if (chunks.length === 0)
                    return;
                chunks[chunks.length - 1].comments = Boolean(pageComments);
                const createPage = (chunk) => {
                    const pageEl = document.createElement('div');
                    pageEl.className = 'page regular-results-page';
                    const contentEl = document.createElement('div');
                    contentEl.className = 'content';
                    const nextTable = document.createElement('table');
                    nextTable.className = table.className;
                    if (tableColGroup) {
                        nextTable.appendChild(tableColGroup.cloneNode(true));
                    }
                    nextTable.appendChild(tableHead.cloneNode(true));
                    const tbody = document.createElement('tbody');
                    tbody.className = 'regular-dept-block';
                    for (const row of chunk.rows) {
                        tbody.appendChild(row);
                    }
                    nextTable.appendChild(tbody);
                    nextTable.appendChild(tableFoot.cloneNode(true));
                    contentEl.appendChild(nextTable);
                    if (chunk.comments && pageComments) {
                        contentEl.appendChild(pageComments.cloneNode(true));
                    }
                    pageEl.appendChild(contentEl);
                    return pageEl;
                };
                const parent = sourcePage.parentElement;
                if (!parent)
                    return;
                const newPages = chunks.map((chunk) => createPage(chunk));
                parent.insertBefore(newPages[0], sourcePage);
                for (let i = 1; i < newPages.length; i += 1) {
                    parent.insertBefore(newPages[i], sourcePage);
                }
                sourcePage.remove();
            });
            const pdf = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '0', bottom: '0', left: '0', right: '0' },
                preferCSSPageSize: true,
            });
            return Buffer.from(pdf);
        }
        finally {
            await page.close().catch(() => { });
        }
    }
    async onModuleDestroy() {
        const browserPromise = this.browserPromise;
        this.browserPromise = null;
        this.pdfCache.clear();
        this.pdfInFlight.clear();
        if (!browserPromise)
            return;
        try {
            const browser = await browserPromise;
            await browser.close();
        }
        catch {
        }
    }
    buildReportPdfCacheKey(input) {
        const reportableFingerprint = input.reportableOrderTests
            .map((ot) => {
            const updatedAtMs = ot.updatedAt ? new Date(ot.updatedAt).getTime() : 0;
            const resultValue = ot.resultValue == null ? '' : String(ot.resultValue);
            const resultText = ot.resultText?.trim() ?? '';
            return `${ot.id}:${updatedAtMs}:${ot.status}:${ot.flag ?? ''}:${resultValue}:${resultText}`;
        })
            .sort()
            .join('|');
        const reportDesignFingerprint = buildLabReportDesignFingerprint(input.order.lab);
        const rawKey = [
            ReportsService_1.REPORT_PDF_LAYOUT_VERSION,
            input.labId,
            input.order.id,
            input.order.paymentStatus,
            input.order.updatedAt ? new Date(input.order.updatedAt).toISOString() : '-',
            input.order.lab?.updatedAt ? new Date(input.order.lab.updatedAt).toISOString() : '-',
            reportDesignFingerprint,
            input.latestVerifiedAt ? new Date(input.latestVerifiedAt).toISOString() : '-',
            input.bypassPaymentCheck ? 'bypass' : 'strict',
            input.cultureOnly ? 'culture-only' : 'full',
            input.orderQrValue,
            String(input.reportableOrderTests.length),
            reportableFingerprint,
        ].join('::');
        return (0, crypto_1.createHash)('sha1').update(rawKey).digest('hex');
    }
    normalizeAbsoluteUrlBase(value) {
        const raw = String(value ?? '').trim();
        if (!raw) {
            return null;
        }
        const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) ? raw : `https://${raw}`;
        try {
            const parsed = new URL(withProtocol);
            return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
        }
        catch {
            return null;
        }
    }
    resolvePublicResultsBaseUrl() {
        const directCandidates = [
            process.env.PUBLIC_RESULTS_BASE_URL,
            process.env.API_PUBLIC_BASE_URL,
            process.env.PUBLIC_API_BASE_URL,
            process.env.APP_API_URL,
            process.env.VITE_API_URL,
        ];
        for (const candidate of directCandidates) {
            const normalized = this.normalizeAbsoluteUrlBase(candidate);
            if (normalized) {
                return normalized;
            }
        }
        const apiHost = String(process.env.APP_API_HOST ?? '').trim();
        const normalizedApiHost = this.normalizeAbsoluteUrlBase(apiHost);
        if (normalizedApiHost) {
            return normalizedApiHost;
        }
        const adminHost = String(process.env.APP_ADMIN_HOST ?? '').trim().toLowerCase();
        if (adminHost.startsWith('admin.')) {
            const normalizedDerived = this.normalizeAbsoluteUrlBase(`api.${adminHost.slice('admin.'.length)}`);
            if (normalizedDerived) {
                return normalizedDerived;
            }
        }
        const normalizedAdminHost = this.normalizeAbsoluteUrlBase(adminHost);
        if (normalizedAdminHost) {
            return normalizedAdminHost;
        }
        const baseDomain = String(process.env.APP_BASE_DOMAIN ?? '').trim().toLowerCase();
        if (baseDomain) {
            const normalizedDerived = this.normalizeAbsoluteUrlBase(`api.${baseDomain}`);
            if (normalizedDerived) {
                return normalizedDerived;
            }
        }
        const port = String(process.env.PORT ?? '3000').trim() || '3000';
        return `http://localhost:${port}`;
    }
    isValidLabSubdomain(value) {
        return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
    }
    resolvePublicResultsLabBaseDomain() {
        const raw = String(process.env.PUBLIC_RESULTS_LAB_BASE_DOMAIN ?? 'medilis.net')
            .trim()
            .toLowerCase();
        if (!raw)
            return null;
        const normalized = raw
            .replace(/^https?:\/\//, '')
            .replace(/\/.*$/, '')
            .trim()
            .toLowerCase();
        if (!normalized)
            return null;
        if (normalized.includes('..'))
            return null;
        if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized))
            return null;
        return normalized;
    }
    resolveOrderQrValue(order) {
        const orderId = encodeURIComponent(order.id);
        const labSubdomain = String(order.lab?.subdomain ?? '').trim().toLowerCase();
        const labBaseDomain = this.resolvePublicResultsLabBaseDomain();
        if (labBaseDomain && this.isValidLabSubdomain(labSubdomain)) {
            return `https://${labSubdomain}.${labBaseDomain}/public/results/${orderId}`;
        }
        const baseUrl = this.resolvePublicResultsBaseUrl();
        return `${baseUrl}/public/results/${orderId}`;
    }
    async generateOrderQrDataUrl(order) {
        const qrValue = this.resolveOrderQrValue(order);
        if (!qrValue) {
            return null;
        }
        try {
            return await QRCode.toDataURL(qrValue, {
                errorCorrectionLevel: 'M',
                margin: 1,
                width: 160,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Failed to generate order QR for order ${order.id}: ${message}`);
            return null;
        }
    }
    getCachedPdf(cacheKey) {
        if (this.pdfCacheTtlMs <= 0)
            return null;
        const now = Date.now();
        const entry = this.pdfCache.get(cacheKey);
        if (!entry)
            return null;
        if (entry.expiresAt <= now) {
            this.pdfCache.delete(cacheKey);
            return null;
        }
        entry.lastAccessedAt = now;
        return Buffer.from(entry.buffer);
    }
    setCachedPdf(cacheKey, pdf) {
        if (this.pdfCacheTtlMs <= 0)
            return;
        const now = Date.now();
        this.pdfCache.set(cacheKey, {
            buffer: Buffer.from(pdf),
            expiresAt: now + this.pdfCacheTtlMs,
            lastAccessedAt: now,
        });
        for (const [key, entry] of this.pdfCache) {
            if (entry.expiresAt <= now)
                this.pdfCache.delete(key);
        }
        if (this.pdfCache.size <= this.pdfCacheMaxEntries)
            return;
        const oldest = [...this.pdfCache.entries()]
            .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
            .slice(0, this.pdfCache.size - this.pdfCacheMaxEntries);
        for (const [key] of oldest) {
            this.pdfCache.delete(key);
        }
    }
    logResultsPdfPerformance(input) {
        if (input.totalMs < this.pdfPerfLogThresholdMs)
            return;
        this.logger.log(JSON.stringify({
            event: 'reports.results_pdf.performance',
            orderId: input.orderId,
            labId: input.labId,
            totalMs: input.totalMs,
            snapshotMs: input.snapshotMs,
            verifierLookupMs: input.verifierLookupMs ?? 0,
            assetsMs: input.assetsMs ?? 0,
            htmlMs: input.htmlMs ?? 0,
            renderMs: input.renderMs ?? 0,
            fallbackMs: input.fallbackMs ?? 0,
            cacheHit: input.cacheHit,
            inFlightJoin: input.inFlightJoin,
        }));
    }
    async ensureOrderBelongsToLab(orderId, labId) {
        const exists = await this.orderRepo.exist({ where: { id: orderId, labId } });
        if (!exists) {
            throw new common_1.NotFoundException('Order not found');
        }
    }
    async getOrderActionFlags(labId, orderIds) {
        const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
        if (uniqueOrderIds.length === 0) {
            return {};
        }
        const orders = await this.orderRepo.find({
            where: uniqueOrderIds.map((id) => ({ id, labId })),
            select: ['id'],
        });
        const scopedOrderIds = orders.map((order) => order.id);
        if (scopedOrderIds.length === 0) {
            return {};
        }
        const result = Object.fromEntries(scopedOrderIds.map((orderId) => [
            orderId,
            {
                pdf: false,
                print: false,
                whatsapp: false,
                viber: false,
                timestamps: {
                    pdf: null,
                    print: null,
                    whatsapp: null,
                    viber: null,
                },
            },
        ]));
        const logs = await this.auditLogRepo.find({
            where: {
                labId,
                entityType: 'order',
                entityId: (0, typeorm_2.In)(scopedOrderIds),
                action: audit_log_entity_1.AuditAction.REPORT_PRINT,
            },
            order: { createdAt: 'ASC' },
            select: ['entityId', 'newValues', 'createdAt'],
        });
        for (const log of logs) {
            const orderId = log.entityId;
            if (!orderId || !result[orderId]) {
                continue;
            }
            const actionKind = this.resolveReportActionKindFromAudit(log.newValues);
            if (!actionKind) {
                continue;
            }
            const createdAtIso = log.createdAt?.toISOString?.() ?? null;
            if (actionKind === 'PDF') {
                result[orderId].pdf = true;
                result[orderId].timestamps.pdf = createdAtIso;
            }
            else if (actionKind === 'PRINT') {
                result[orderId].print = true;
                result[orderId].timestamps.print = createdAtIso;
            }
            else if (actionKind === 'WHATSAPP') {
                result[orderId].whatsapp = true;
                result[orderId].timestamps.whatsapp = createdAtIso;
            }
            else if (actionKind === 'VIBER') {
                result[orderId].viber = true;
                result[orderId].timestamps.viber = createdAtIso;
            }
        }
        return result;
    }
    resolveReportActionKindFromAudit(newValues) {
        if (!newValues || typeof newValues !== 'object') {
            return null;
        }
        const actionKindRaw = newValues.actionKind;
        const actionKind = String(actionKindRaw ?? '')
            .trim()
            .toUpperCase();
        if (actionKind === 'PDF')
            return 'PDF';
        if (actionKind === 'PRINT')
            return 'PRINT';
        if (actionKind === 'WHATSAPP')
            return 'WHATSAPP';
        if (actionKind === 'VIBER')
            return 'VIBER';
        const channel = String(newValues.channel ?? '')
            .trim()
            .toUpperCase();
        if (channel === 'WHATSAPP')
            return 'WHATSAPP';
        if (channel === 'VIBER')
            return 'VIBER';
        return null;
    }
    decodeImageDataUrl(value) {
        if (typeof value !== 'string')
            return null;
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        const match = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
        if (!match?.[1])
            return null;
        try {
            return Buffer.from(match[1], 'base64');
        }
        catch {
            return null;
        }
    }
    applyReportDesignOverride(order, override) {
        if (!override) {
            return order;
        }
        const currentLab = (order.lab ?? {});
        const nextLab = {
            ...currentLab,
        };
        if (override.reportBranding) {
            if ('bannerDataUrl' in override.reportBranding) {
                nextLab.reportBannerDataUrl = override.reportBranding.bannerDataUrl ?? null;
            }
            if ('footerDataUrl' in override.reportBranding) {
                nextLab.reportFooterDataUrl = override.reportBranding.footerDataUrl ?? null;
            }
            if ('logoDataUrl' in override.reportBranding) {
                nextLab.reportLogoDataUrl = override.reportBranding.logoDataUrl ?? null;
            }
            if ('watermarkDataUrl' in override.reportBranding) {
                nextLab.reportWatermarkDataUrl = override.reportBranding.watermarkDataUrl ?? null;
            }
        }
        if (override.reportStyle !== undefined) {
            nextLab.reportStyle = override.reportStyle;
        }
        return {
            ...order,
            lab: nextLab,
        };
    }
    applyFallbackPageBranding(doc, opts) {
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const marginLeft = doc.page.margins.left;
        const marginRight = doc.page.margins.right;
        if (opts.watermarkImage) {
            const watermarkSize = Math.min(320, pageWidth - marginLeft - marginRight - 40);
            const watermarkX = (pageWidth - watermarkSize) / 2;
            const watermarkY = (pageHeight - watermarkSize) / 2;
            doc.save();
            doc.opacity(0.08);
            try {
                doc.image(opts.watermarkImage, watermarkX, watermarkY, {
                    fit: [watermarkSize, watermarkSize],
                    align: 'center',
                    valign: 'center',
                });
            }
            catch {
            }
            doc.restore();
        }
        if (opts.footerImage) {
            const footerWidth = pageWidth - marginLeft - marginRight;
            const footerHeight = Math.max(16, Math.round((footerWidth * REPORT_BANNER_HEIGHT) / REPORT_BANNER_WIDTH));
            const footerY = pageHeight - footerHeight - 2;
            try {
                doc.image(opts.footerImage, marginLeft, footerY, {
                    fit: [footerWidth, footerHeight],
                    align: 'center',
                    valign: 'center',
                });
            }
            catch {
            }
        }
    }
    getReportableOrderTests(orderTests) {
        const panelParentIdsWithChildren = new Set(orderTests
            .filter((ot) => !!ot.parentOrderTestId)
            .map((ot) => ot.parentOrderTestId));
        return orderTests.filter((ot) => {
            const t = ot.test;
            if (!t)
                return false;
            if (t.type === test_entity_1.TestType.PANEL) {
                if (ot.parentOrderTestId)
                    return true;
                const hasParams = Array.isArray(t.parameterDefinitions) && t.parameterDefinitions.length > 0;
                const hasChildren = panelParentIdsWithChildren.has(ot.id);
                return hasParams || hasChildren;
            }
            return true;
        });
    }
    classifyOrderTestsForReport(orderTests) {
        const sortKey = (ot) => {
            const test = ot.test;
            const sortOrder = Number(test?.sortOrder ?? 0);
            const code = (test?.code || '').toUpperCase();
            return `${String(sortOrder).padStart(6, '0')}_${code}`;
        };
        const panelParents = orderTests
            .filter((ot) => !ot.parentOrderTestId && ot.test?.type === test_entity_1.TestType.PANEL)
            .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
        const panelParentIds = new Set(panelParents.map((ot) => ot.id));
        const panelChildrenByParent = new Map();
        for (const parent of panelParents) {
            panelChildrenByParent.set(parent.id, []);
        }
        for (const ot of orderTests) {
            if (!ot.parentOrderTestId || !panelParentIds.has(ot.parentOrderTestId))
                continue;
            const list = panelChildrenByParent.get(ot.parentOrderTestId);
            if (list)
                list.push(ot);
        }
        for (const [, children] of panelChildrenByParent) {
            children.sort((a, b) => {
                const aOrder = a.panelSortOrder ?? 9999;
                const bOrder = b.panelSortOrder ?? 9999;
                if (aOrder !== bOrder)
                    return aOrder - bOrder;
                const aCode = (a.test?.code || '').toUpperCase();
                const bCode = (b.test?.code || '').toUpperCase();
                return aCode.localeCompare(bCode);
            });
        }
        const regularTests = orderTests
            .filter((ot) => !panelParentIds.has(ot.id) &&
            (!ot.parentOrderTestId || !panelParentIds.has(ot.parentOrderTestId)))
            .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
        return { regularTests, panelParents, panelChildrenByParent };
    }
    isOrderTestResultEntered(orderTest, childOrderTestParentIds) {
        const test = orderTest.test;
        if (!test)
            return false;
        const hasDirectResult = (0, order_test_result_util_1.hasMeaningfulOrderTestResult)(orderTest);
        if (test.type === test_entity_1.TestType.PANEL && !orderTest.parentOrderTestId) {
            if (childOrderTestParentIds.has(orderTest.id)) {
                return true;
            }
            return hasDirectResult;
        }
        return hasDirectResult;
    }
    assertAllResultsEnteredForReport(orderTests) {
        if (orderTests.length === 0) {
            throw new common_1.BadRequestException('No reportable tests found for this order.');
        }
        const childOrderTestParentIds = new Set(orderTests
            .filter((orderTest) => Boolean(orderTest.parentOrderTestId))
            .map((orderTest) => orderTest.parentOrderTestId));
        const pendingTests = orderTests.filter((orderTest) => !this.isOrderTestResultEntered(orderTest, childOrderTestParentIds));
        if (pendingTests.length === 0) {
            return;
        }
        const labels = pendingTests
            .slice(0, 5)
            .map((orderTest) => {
            const test = orderTest.test;
            return test?.code || test?.name || orderTest.id;
        })
            .join(', ');
        const extraCount = pendingTests.length - Math.min(pendingTests.length, 5);
        const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';
        throw new common_1.BadRequestException(`Cannot print/download results while some tests are pending: ${labels}${suffix}. Enter all results first.`);
    }
    assertAllResultsVerifiedForReport(reportableOrderTests, verifiedTests) {
        if (reportableOrderTests.length === 0) {
            throw new common_1.BadRequestException('No reportable tests found for this order.');
        }
        if (verifiedTests.length === reportableOrderTests.length) {
            return;
        }
        const verifiedIds = new Set(verifiedTests.map((orderTest) => orderTest.id));
        const unverifiedTests = reportableOrderTests.filter((orderTest) => !verifiedIds.has(orderTest.id));
        const labels = unverifiedTests
            .slice(0, 5)
            .map((orderTest) => {
            const test = orderTest.test;
            return test?.code || test?.name || orderTest.id;
        })
            .join(', ');
        const extraCount = unverifiedTests.length - Math.min(unverifiedTests.length, 5);
        const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';
        throw new common_1.BadRequestException(`Cannot print/download results while some tests are still unverified: ${labels}${suffix}. Verify all results first.`);
    }
    async loadOrderResultsSnapshot(orderId, labId) {
        const where = labId ? { id: orderId, labId } : { id: orderId };
        const order = await this.orderRepo.findOne({
            where,
            relations: [
                'patient',
                'lab',
                'shift',
            ],
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        const orderTests = await this.orderTestRepo
            .createQueryBuilder('orderTest')
            .innerJoin('orderTest.sample', 'sample')
            .leftJoinAndSelect('orderTest.test', 'test')
            .leftJoinAndSelect('test.department', 'department')
            .where('sample.orderId = :orderId', { orderId: order.id })
            .orderBy('COALESCE(test.sortOrder, 0)', 'ASC')
            .addOrderBy('test.code', 'ASC')
            .getMany();
        const reportableOrderTests = this.getReportableOrderTests(orderTests);
        const verifiedTests = reportableOrderTests.filter((ot) => ot.status === 'VERIFIED');
        const latestVerifiedAt = verifiedTests
            .map((ot) => (ot.verifiedAt ? new Date(ot.verifiedAt) : null))
            .filter((d) => d !== null)
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        return {
            order,
            reportableOrderTests,
            verifiedTests,
            latestVerifiedAt,
        };
    }
    async getPublicResultStatus(orderId) {
        const { order, reportableOrderTests, verifiedTests, latestVerifiedAt } = await this.loadOrderResultsSnapshot(orderId);
        if (order.lab?.enableOnlineResults === false) {
            throw new common_1.ForbiddenException('Online results are disabled by laboratory settings.');
        }
        const ready = order.paymentStatus === 'paid' &&
            reportableOrderTests.length > 0 &&
            verifiedTests.length === reportableOrderTests.length;
        const progressPercent = reportableOrderTests.length > 0
            ? Math.round((verifiedTests.length / reportableOrderTests.length) * 100)
            : 0;
        const tests = reportableOrderTests
            .map((ot) => {
            const test = ot.test;
            const departmentName = test?.department?.name ||
                'General Department';
            const rawExpectedCompletionMinutes = Number(test?.expectedCompletionMinutes ?? 0);
            const expectedCompletionMinutes = Number.isFinite(rawExpectedCompletionMinutes) && rawExpectedCompletionMinutes > 0
                ? Math.round(rawExpectedCompletionMinutes)
                : null;
            const formattedValue = formatResultValue(ot);
            const resultValue = formattedValue === 'Pending' ? null : formattedValue;
            return {
                orderTestId: ot.id,
                testCode: test?.code || '-',
                testName: test?.name || 'Unknown test',
                departmentName,
                expectedCompletionMinutes,
                status: ot.status,
                isVerified: ot.status === 'VERIFIED',
                hasResult: resultValue !== null,
                resultValue,
                unit: test?.unit || null,
                verifiedAt: ot.verifiedAt ? ot.verifiedAt.toISOString() : null,
            };
        })
            .sort((a, b) => {
            const dept = a.departmentName.localeCompare(b.departmentName);
            if (dept !== 0)
                return dept;
            const code = a.testCode.localeCompare(b.testCode);
            if (code !== 0)
                return code;
            return a.testName.localeCompare(b.testName);
        });
        return {
            orderId: order.id,
            orderNumber: order.orderNumber || order.id.substring(0, 8),
            patientName: order.patient?.fullName || '-',
            labName: order.lab?.name || 'Laboratory',
            onlineResultWatermarkDataUrl: order.lab?.onlineResultWatermarkDataUrl ?? null,
            onlineResultWatermarkText: order.lab?.onlineResultWatermarkText ?? null,
            registeredAt: order.registeredAt.toISOString(),
            paymentStatus: order.paymentStatus || 'unpaid',
            reportableCount: reportableOrderTests.length,
            verifiedCount: verifiedTests.length,
            progressPercent,
            ready,
            verifiedAt: latestVerifiedAt ? latestVerifiedAt.toISOString() : null,
            tests,
        };
    }
    async generatePublicTestResultsPDF(orderId) {
        const { order, reportableOrderTests, verifiedTests } = await this.loadOrderResultsSnapshot(orderId);
        if (order.lab?.enableOnlineResults === false) {
            throw new common_1.ForbiddenException('Online results are disabled by laboratory settings.');
        }
        const ready = order.paymentStatus === 'paid' &&
            reportableOrderTests.length > 0 &&
            verifiedTests.length === reportableOrderTests.length;
        if (!ready) {
            throw new common_1.ForbiddenException('Results are not completed yet. Please check again later.');
        }
        return this.generateTestResultsPDF(orderId, order.labId);
    }
    async generateDraftTestResultsPreviewPDF(input) {
        return this.generateTestResultsPDF(input.orderId, input.labId, {
            bypassPaymentCheck: true,
            bypassResultCompletionCheck: true,
            disableCache: true,
            cultureOnly: input.previewMode === 'culture_only',
            reportDesignOverride: {
                reportBranding: input.reportBranding,
                reportStyle: input.reportStyle,
            },
        });
    }
    async generateOrderReceiptPDF(orderId, labId) {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, labId },
            relations: [
                'patient',
                'lab',
                'shift',
                'samples',
                'samples.orderTests',
                'samples.orderTests.test',
            ],
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: [400, 595], margin: 20 });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            doc.fontSize(18).font('Helvetica-Bold');
            doc.text(order.lab?.name || 'Laboratory', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            doc.text('Laboratory Information System', { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text(`Order #: ${order.orderNumber || order.id.substring(0, 8)}`, { align: 'left' });
            doc.fontSize(10).font('Helvetica');
            const orderDate = new Date(order.registeredAt).toLocaleString();
            doc.text(`Date: ${orderDate}`, { align: 'left' });
            if (order.shift) {
                doc.text(`Shift: ${order.shift.name || order.shift.code}`, { align: 'left' });
            }
            doc.moveDown(1);
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('Patient Information', { align: 'left' });
            doc.fontSize(10).font('Helvetica');
            const patientName = order.patient.fullName || '-';
            const patientAgeDisplay = (0, patient_age_util_1.formatPatientAgeDisplay)(order.patient.dateOfBirth, order.registeredAt);
            doc.text(`Name: ${patientName}`, { align: 'left' });
            doc.text(`Age: ${patientAgeDisplay || '-'}`, { align: 'left' });
            if (order.patient.sex) {
                doc.text(`Gender: ${order.patient.sex}`, { align: 'left' });
            }
            if (order.patient.phone) {
                doc.text(`Phone: ${order.patient.phone}`, { align: 'left' });
            }
            doc.text(`Type: ${order.patientType.replace('_', ' ')}`, { align: 'left' });
            doc.moveDown(1);
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('Tests Ordered', { align: 'left' });
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            const allTests = order.samples.flatMap((sample) => sample.orderTests.map((ot) => ({
                code: ot.test.code,
                name: ot.test.name,
                price: ot.price,
            })));
            let yPos = doc.y;
            const startX = doc.x;
            const testWidth = 200;
            const priceWidth = 80;
            doc.font('Helvetica-Bold');
            doc.text('Test', startX, yPos);
            doc.text('Price', startX + testWidth, yPos, { width: priceWidth, align: 'right' });
            yPos += 15;
            doc.moveTo(startX, yPos - 5).lineTo(startX + testWidth + priceWidth, yPos - 5).stroke();
            doc.font('Helvetica');
            allTests.forEach((test) => {
                if (yPos > doc.page.height - 50) {
                    doc.addPage();
                    yPos = doc.page.margins.top;
                }
                doc.text(`${test.code} - ${test.name}`, startX, yPos, { width: testWidth });
                doc.text(test.price !== null ? `${parseFloat(test.price.toString()).toFixed(0)} IQD` : '-', startX + testWidth, yPos, { width: priceWidth, align: 'right' });
                yPos += 15;
            });
            doc.moveDown(1);
            doc.font('Helvetica');
            doc.text(`Subtotal: ${parseFloat(order.totalAmount.toString()).toFixed(0)} IQD`, {
                align: 'right',
            });
            if (order.discountPercent != null && Number(order.discountPercent) > 0) {
                const discountAmount = parseFloat(order.totalAmount.toString()) -
                    parseFloat((order.finalAmount ?? order.totalAmount).toString());
                doc.text(`Discount (${order.discountPercent}%): -${discountAmount.toFixed(0)} IQD`, {
                    align: 'right',
                });
            }
            doc.fontSize(12).font('Helvetica-Bold');
            const finalAmount = order.finalAmount != null
                ? parseFloat(order.finalAmount.toString())
                : parseFloat(order.totalAmount.toString());
            doc.text(`TOTAL: ${finalAmount.toFixed(0)} IQD`, { align: 'right' });
            doc.moveDown(1);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Samples: ${order.samples.length} sample(s)`, { align: 'left' });
            order.samples.forEach((sample) => {
                doc.text(`  - ${sample.tubeType?.replace('_', ' ') || 'Unknown'} tube`, {
                    align: 'left',
                });
            });
            doc.moveDown(1);
            doc.fontSize(8).font('Helvetica');
            doc.text('Thank you for choosing our laboratory', { align: 'center' });
            doc.text(`Printed: ${new Date().toLocaleString()}`, { align: 'center' });
            doc.end();
        });
    }
    async generateTestResultsPDF(orderId, labId, options) {
        const startMs = Date.now();
        const snapshotStartMs = Date.now();
        const { order, reportableOrderTests, verifiedTests, latestVerifiedAt } = await this.loadOrderResultsSnapshot(orderId, labId);
        const snapshotMs = Date.now() - snapshotStartMs;
        const bypassPaymentCheck = !!options?.bypassPaymentCheck;
        const bypassResultCompletionCheck = !!options?.bypassResultCompletionCheck;
        const disableCache = !!options?.disableCache;
        const cultureOnly = !!options?.cultureOnly;
        const orderForRender = this.applyReportDesignOverride(order, options?.reportDesignOverride);
        const renderedOrderTests = cultureOnly
            ? reportableOrderTests.filter((ot) => String(ot.test?.resultEntryType ?? '')
                .toUpperCase() === 'CULTURE_SENSITIVITY')
            : reportableOrderTests;
        const renderedVerifiedTests = cultureOnly
            ? verifiedTests.filter((ot) => renderedOrderTests.some((candidate) => candidate.id === ot.id))
            : verifiedTests;
        if (!bypassResultCompletionCheck) {
            this.assertAllResultsEnteredForReport(reportableOrderTests);
            this.assertAllResultsVerifiedForReport(reportableOrderTests, verifiedTests);
        }
        if (!bypassPaymentCheck && order.paymentStatus !== 'paid') {
            throw new common_1.ForbiddenException('Order is unpaid or partially paid. Complete payment to download or print results.');
        }
        const orderQrValue = this.resolveOrderQrValue(orderForRender);
        const cacheKey = this.buildReportPdfCacheKey({
            labId,
            order: orderForRender,
            reportableOrderTests: renderedOrderTests,
            latestVerifiedAt,
            bypassPaymentCheck,
            orderQrValue,
            cultureOnly,
        });
        let verifierLookupMs = 0;
        let assetsMs = 0;
        let htmlMs = 0;
        let renderMs = 0;
        let fallbackMs = 0;
        const generatePdf = async () => {
            const verifierLookupStartMs = Date.now();
            const verifierIds = [
                ...new Set(renderedOrderTests
                    .map((ot) => ot.verifiedBy)
                    .filter((id) => Boolean(id))),
            ];
            const verifiers = verifierIds.length === 0
                ? []
                : await this.userRepo.find({
                    where: verifierIds.map((id) => ({ id })),
                });
            verifierLookupMs = Date.now() - verifierLookupStartMs;
            const verifierNameMap = new Map(verifiers.map((u) => [u.id, u.fullName || u.username || u.id.substring(0, 8)]));
            const verifierNames = [
                ...new Set(renderedVerifiedTests
                    .map((ot) => (ot.verifiedBy ? verifierNameMap.get(ot.verifiedBy) || ot.verifiedBy : null))
                    .filter((name) => Boolean(name))),
            ];
            const comments = [
                ...new Set(renderedOrderTests
                    .map((ot) => ot.comments?.trim())
                    .filter((value) => Boolean(value))),
            ];
            const assetsStartMs = Date.now();
            let kurdishFontBase64;
            const kurdishFontPath = resolveReadablePath([
                (0, path_1.join)(__dirname, 'fonts', 'NotoNaskhArabic-Regular.ttf'),
                (0, path_1.join)(process.cwd(), 'dist', 'src', 'reports', 'fonts', 'NotoNaskhArabic-Regular.ttf'),
                (0, path_1.join)(process.cwd(), 'src', 'reports', 'fonts', 'NotoNaskhArabic-Regular.ttf'),
            ]);
            if (kurdishFontPath) {
                try {
                    if (!ReportsService_1.cachedFont || ReportsService_1.cachedFont.path !== kurdishFontPath) {
                        const fontBuf = (0, fs_1.readFileSync)(kurdishFontPath);
                        ReportsService_1.cachedFont = { path: kurdishFontPath, base64: `data:font/ttf;base64,${fontBuf.toString('base64')}` };
                    }
                    kurdishFontBase64 = ReportsService_1.cachedFont.base64;
                }
                catch {
                }
            }
            assetsMs = Date.now() - assetsStartMs;
            const orderQrDataUrl = await this.generateOrderQrDataUrl(orderForRender);
            const htmlStartMs = Date.now();
            const html = (0, results_report_template_1.buildResultsReportHtml)({
                order: orderForRender,
                orderTests: renderedOrderTests,
                verifiedCount: renderedVerifiedTests.length,
                reportableCount: renderedOrderTests.length,
                verifiers: verifierNames,
                latestVerifiedAt: latestVerifiedAt ?? null,
                comments,
                kurdishFontBase64,
                orderQrDataUrl,
            });
            htmlMs = Date.now() - htmlStartMs;
            try {
                const renderStartMs = Date.now();
                const pdf = await this.renderPdfFromHtml(html);
                renderMs = Date.now() - renderStartMs;
                return pdf;
            }
            catch (error) {
                const allowFallback = process.env.REPORTS_PDF_FALLBACK !== 'false';
                if (!allowFallback) {
                    throw error;
                }
                this.logger.warn(`Playwright PDF rendering failed; using fallback renderer for order ${orderForRender.id}.`);
                const fallbackStartMs = Date.now();
                const fallbackPdf = await this.renderTestResultsFallbackPDF({
                    order: orderForRender,
                    orderTests: renderedOrderTests,
                    verifiers: verifierNames,
                    latestVerifiedAt: latestVerifiedAt ?? null,
                    comments,
                });
                fallbackMs = Date.now() - fallbackStartMs;
                return fallbackPdf;
            }
        };
        if (disableCache) {
            const pdf = await generatePdf();
            this.logResultsPdfPerformance({
                orderId,
                labId,
                totalMs: Date.now() - startMs,
                snapshotMs,
                verifierLookupMs,
                assetsMs,
                htmlMs,
                renderMs,
                fallbackMs,
                cacheHit: false,
                inFlightJoin: false,
            });
            return Buffer.from(pdf);
        }
        const cachedPdf = this.getCachedPdf(cacheKey);
        if (cachedPdf) {
            this.logResultsPdfPerformance({
                orderId,
                labId,
                totalMs: Date.now() - startMs,
                snapshotMs,
                cacheHit: true,
                inFlightJoin: false,
            });
            return cachedPdf;
        }
        const existingInFlight = this.pdfInFlight.get(cacheKey);
        if (existingInFlight) {
            const pdf = await existingInFlight;
            this.logResultsPdfPerformance({
                orderId,
                labId,
                totalMs: Date.now() - startMs,
                snapshotMs,
                cacheHit: false,
                inFlightJoin: true,
            });
            return Buffer.from(pdf);
        }
        const generatePromise = generatePdf();
        this.pdfInFlight.set(cacheKey, generatePromise);
        try {
            const pdf = await generatePromise;
            this.setCachedPdf(cacheKey, pdf);
            this.logResultsPdfPerformance({
                orderId,
                labId,
                totalMs: Date.now() - startMs,
                snapshotMs,
                verifierLookupMs,
                assetsMs,
                htmlMs,
                renderMs,
                fallbackMs,
                cacheHit: false,
                inFlightJoin: false,
            });
            return Buffer.from(pdf);
        }
        finally {
            this.pdfInFlight.delete(cacheKey);
        }
    }
    async renderTestResultsFallbackPDF(input) {
        const { order, orderTests, verifiers, latestVerifiedAt, comments } = input;
        const patient = order.patient;
        const patientAgeForRanges = (0, patient_age_util_1.getPatientAgeSnapshot)(patient?.dateOfBirth ?? null, order.registeredAt);
        const patientAgeDisplay = (0, patient_age_util_1.formatPatientAgeDisplay)(patient?.dateOfBirth ?? null, order.registeredAt);
        const labBranding = order.lab;
        const bannerImage = this.decodeImageDataUrl(labBranding?.reportBannerDataUrl);
        const footerImage = this.decodeImageDataUrl(labBranding?.reportFooterDataUrl);
        const logoImage = this.decodeImageDataUrl(labBranding?.reportLogoDataUrl);
        const watermarkImage = this.decodeImageDataUrl(labBranding?.reportWatermarkDataUrl);
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: footerImage
                    ? { top: 10, right: 10, bottom: 30, left: 10 }
                    : { top: 10, right: 10, bottom: 10, left: 10 },
            });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            const applyPageBranding = () => this.applyFallbackPageBranding(doc, { watermarkImage, footerImage });
            doc.on('pageAdded', applyPageBranding);
            applyPageBranding();
            if (bannerImage) {
                const marginLeft = doc.page.margins.left;
                const marginRight = doc.page.margins.right;
                const maxWidth = doc.page.width - marginLeft - marginRight;
                const bannerTop = doc.page.margins.top;
                try {
                    const openedBanner = doc.openImage(bannerImage);
                    const bannerHeight = Math.max(24, Math.round((openedBanner.height / openedBanner.width) * maxWidth));
                    doc.image(openedBanner, marginLeft, bannerTop, { width: maxWidth });
                    doc.y = bannerTop + bannerHeight + 8;
                }
                catch {
                    drawHeaderBar(doc, {
                        title: 'Laboratory Test Results',
                        labName: order.lab?.name || 'Laboratory',
                        subtitle: order.orderNumber || order.id.substring(0, 8),
                        logoImage,
                    });
                }
            }
            else {
                drawHeaderBar(doc, {
                    title: 'Laboratory Test Results',
                    labName: order.lab?.name || 'Laboratory',
                    subtitle: order.orderNumber || order.id.substring(0, 8),
                    logoImage,
                });
            }
            drawTwoColumnInfo(doc, [
                ['Patient Name', patient?.fullName || '-'],
                ['Patient ID', patient?.patientNumber || '-'],
                ['Age', patientAgeDisplay || '-'],
                ['Sex', patient?.sex || '-'],
            ], [
                ['Order Number', order.orderNumber || order.id.substring(0, 8)],
                ['Collected At', formatDateTime(order.registeredAt)],
                ['Verified At', formatDateTime(latestVerifiedAt)],
                ['Verified By', verifiers.join(', ') || '-'],
            ]);
            const { regularTests, panelParents, panelChildrenByParent } = this.classifyOrderTestsForReport(orderTests);
            const cultureRegularTests = regularTests.filter((ot) => isCultureSensitivityOrderTest(ot));
            const nonCultureRegularTests = regularTests.filter((ot) => !isCultureSensitivityOrderTest(ot));
            const leftX = doc.page.margins.left;
            const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
            const widths = {
                test: Math.round(usableWidth * 0.46),
                result: Math.round(usableWidth * 0.14),
                unit: Math.round(usableWidth * 0.10),
                range: 0,
            };
            widths.range = usableWidth - widths.test - widths.result - widths.unit;
            const tableWidth = widths.test + widths.result + widths.unit + widths.range;
            const drawTableHeader = () => {
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827');
                doc.text('Test', leftX, doc.y, { width: widths.test });
                doc.text('Result', leftX + widths.test, doc.y, { width: widths.result });
                doc.text('Unit', leftX + widths.test + widths.result, doc.y, { width: widths.unit });
                doc.text('Reference', leftX + widths.test + widths.result + widths.unit, doc.y, { width: widths.range });
                doc.moveDown(0.6);
                doc
                    .strokeColor('#CBD5E1')
                    .lineWidth(1)
                    .moveTo(leftX, doc.y)
                    .lineTo(leftX + tableWidth, doc.y)
                    .stroke();
                doc.moveDown(0.5);
            };
            const drawResultRow = (row) => {
                const extraParams = row.extraParams ?? [];
                ensureSpace(doc, extraParams.length > 0 ? 48 : 28, drawTableHeader);
                const rowY = doc.y;
                doc.font('Helvetica').fontSize(9).fillColor('#111827');
                doc.text(row.testLabel, leftX, rowY, { width: widths.test });
                doc.text(row.result, leftX + widths.test, rowY, { width: widths.result });
                doc.text(row.unit, leftX + widths.test + widths.result, rowY, { width: widths.unit });
                doc.text(row.reference, leftX + widths.test + widths.result + widths.unit, rowY, { width: widths.range });
                let bottomY = Math.max(doc.y, doc.heightOfString(row.testLabel, { width: widths.test }) + rowY, doc.heightOfString(row.result, { width: widths.result }) + rowY, doc.heightOfString(row.reference, { width: widths.range }) + rowY);
                if (extraParams.length > 0) {
                    const paramText = extraParams.slice(0, 6).join(' | ');
                    doc
                        .font('Helvetica-Oblique')
                        .fontSize(8)
                        .fillColor('#475569')
                        .text(paramText, leftX + 8, bottomY + 2, { width: tableWidth - 16 });
                    bottomY = doc.y;
                    doc.font('Helvetica').fontSize(9).fillColor('#111827');
                }
                doc
                    .strokeColor('#E2E8F0')
                    .lineWidth(0.8)
                    .moveTo(leftX, bottomY + 4)
                    .lineTo(leftX + tableWidth, bottomY + 4)
                    .stroke();
                doc.y = bottomY + 8;
            };
            const drawOrderTestRow = (ot) => {
                const t = ot.test;
                const testName = t?.name || 'Unknown test';
                const testCode = t?.code ? ` (${t.code})` : '';
                drawResultRow({
                    testLabel: `${testName}${testCode}`,
                    result: formatResultValue(ot),
                    unit: t?.unit || '-',
                    reference: t ? getNormalRange(t, patient?.sex ?? null, patientAgeForRanges) : '-',
                    extraParams: formatResultParameters(ot.resultParameters),
                });
            };
            const cultureColumnGap = 6;
            const drawCultureColumns = (columns) => {
                const columnDefs = [
                    {
                        title: 'Sensitive',
                        values: columns.sensitive,
                        backgroundColor: '#F8FFFB',
                        borderColor: '#BBF7D0',
                    },
                    {
                        title: 'Intermediate',
                        values: columns.intermediate,
                        backgroundColor: '#FFFDF5',
                        borderColor: '#FDE68A',
                    },
                    {
                        title: 'Resistance',
                        values: columns.resistancePrimary,
                        backgroundColor: '#FFF8F8',
                        borderColor: '#FECACA',
                    },
                ];
                if (columns.resistanceSecondary.length > 0) {
                    columnDefs.push({
                        title: 'Resistance',
                        values: columns.resistanceSecondary,
                        backgroundColor: '#FFF8F8',
                        borderColor: '#FECACA',
                    });
                }
                const cultureColumnWidth = (tableWidth - cultureColumnGap * (columnDefs.length - 1)) /
                    columnDefs.length;
                const headerHeight = 12;
                const bodyHeights = columnDefs.map((column) => {
                    const listText = column.values.length ? column.values.join('\n') : '-';
                    doc.font('Helvetica').fontSize(8.5);
                    return doc.heightOfString(listText, {
                        width: cultureColumnWidth - 10,
                        lineGap: 1,
                    });
                });
                const contentHeight = Math.max(...bodyHeights, 12);
                const minimumColumnHeight = headerHeight + contentHeight + 14;
                ensureSpace(doc, minimumColumnHeight + 10);
                const startY = doc.y;
                const pageBottomY = doc.page.height - doc.page.margins.bottom - 2;
                const remainingHeight = Math.max(120, pageBottomY - startY - 4);
                const columnHeight = Math.max(minimumColumnHeight, remainingHeight);
                columnDefs.forEach((column, index) => {
                    const x = leftX + index * (cultureColumnWidth + cultureColumnGap);
                    const listText = column.values.length ? column.values.join('\n') : '-';
                    doc.save();
                    doc
                        .roundedRect(x, startY, cultureColumnWidth, columnHeight, 4)
                        .fillAndStroke(column.backgroundColor, column.borderColor);
                    doc.restore();
                    doc
                        .font('Helvetica-Bold')
                        .fontSize(9)
                        .fillColor('#111827')
                        .text(column.title, x + 5, startY + 4, { width: cultureColumnWidth - 10 });
                    doc
                        .strokeColor('#CBD5E1')
                        .lineWidth(0.7)
                        .moveTo(x + 4, startY + headerHeight + 1)
                        .lineTo(x + cultureColumnWidth - 4, startY + headerHeight + 1)
                        .stroke();
                    doc
                        .font('Helvetica')
                        .fontSize(8.5)
                        .fillColor(column.values.length ? '#0F172A' : '#64748B')
                        .text(listText, x + 5, startY + headerHeight + 4, {
                        width: cultureColumnWidth - 10,
                        lineGap: 1,
                    });
                });
                doc.y = startY + columnHeight + 8;
            };
            const drawCultureSectionTitle = (testName) => {
                ensureSpace(doc, 24);
                doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(testName);
                doc.moveDown(0.25);
            };
            const drawCultureMessage = (message) => {
                ensureSpace(doc, 26);
                const boxHeight = 22;
                const startY = doc.y;
                doc
                    .roundedRect(leftX, startY, tableWidth, boxHeight, 4)
                    .fillAndStroke('#ECFDF5', '#86EFAC');
                doc
                    .font('Helvetica-Bold')
                    .fontSize(10)
                    .fillColor('#166534')
                    .text(message, leftX + 8, startY + 6, { width: tableWidth - 16 });
                doc.y = startY + boxHeight + 8;
            };
            const drawCultureNotes = (notes) => {
                if (!notes)
                    return;
                ensureSpace(doc, 30);
                doc
                    .strokeColor('#CBD5E1')
                    .lineWidth(0.7)
                    .moveTo(leftX, doc.y)
                    .lineTo(leftX + tableWidth, doc.y)
                    .stroke();
                doc.moveDown(0.2);
                doc
                    .font('Helvetica-Bold')
                    .fontSize(9)
                    .fillColor('#111827')
                    .text('Notes:', leftX, doc.y, { continued: true })
                    .font('Helvetica')
                    .text(` ${notes}`, { width: tableWidth });
                doc.moveDown(0.3);
            };
            if (nonCultureRegularTests.length > 0) {
                drawTableHeader();
                for (const ot of nonCultureRegularTests) {
                    drawOrderTestRow(ot);
                }
            }
            let renderedCulturePageCount = 0;
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
                const notes = typeof cultureResult?.notes === 'string' && cultureResult.notes.trim().length > 0
                    ? cultureResult.notes.trim()
                    : '';
                const isolates = Array.isArray(cultureResult?.isolates)
                    ? cultureResult.isolates
                    : [];
                if (!noGrowth && isolates.length === 0) {
                    const shouldStartNewPage = nonCultureRegularTests.length > 0 || renderedCulturePageCount > 0;
                    if (shouldStartNewPage) {
                        doc.addPage();
                    }
                    drawCultureSectionTitle(testName);
                    drawCultureMessage('No isolate data');
                    drawCultureNotes(notes);
                    renderedCulturePageCount += 1;
                    continue;
                }
                const isolatesForRender = noGrowth && isolates.length === 0 ? [null] : isolates;
                isolatesForRender.forEach((isolate, isolateIndex) => {
                    const shouldStartNewPage = nonCultureRegularTests.length > 0 || renderedCulturePageCount > 0;
                    if (shouldStartNewPage) {
                        doc.addPage();
                    }
                    const isolateObj = isolate && typeof isolate === 'object'
                        ? isolate
                        : {};
                    const organism = String(isolateObj.organism ?? '').trim() || `Isolate ${isolateIndex + 1}`;
                    const isolateSource = typeof isolateObj.source === 'string' && isolateObj.source.trim().length > 0
                        ? isolateObj.source.trim()
                        : '';
                    const isolateCondition = typeof isolateObj.condition === 'string' &&
                        isolateObj.condition.trim().length > 0
                        ? isolateObj.condition.trim()
                        : '';
                    const isolateColonyCount = typeof isolateObj.colonyCount === 'string' &&
                        isolateObj.colonyCount.trim().length > 0
                        ? isolateObj.colonyCount.trim()
                        : '';
                    const isolateComment = typeof isolateObj.comment === 'string' && isolateObj.comment.trim().length > 0
                        ? isolateObj.comment.trim()
                        : '';
                    drawCultureSectionTitle(testName);
                    ensureSpace(doc, 22);
                    if (noGrowth) {
                        doc
                            .font('Helvetica')
                            .fontSize(9)
                            .fillColor('#334155')
                            .text(`Result: ${noGrowthResult}`);
                        if (isolateSource) {
                            doc
                                .font('Helvetica')
                                .fontSize(9)
                                .fillColor('#334155')
                                .text(`Source: ${isolateSource}`);
                        }
                        if (isolateComment) {
                            doc
                                .font('Helvetica')
                                .fontSize(9)
                                .fillColor('#475569')
                                .text(`Comment: ${isolateComment}`);
                        }
                        drawCultureNotes('');
                        renderedCulturePageCount += 1;
                        return;
                    }
                    doc
                        .font('Helvetica-Bold')
                        .fontSize(10)
                        .fillColor('#111827')
                        .text('Microorganism:', leftX, doc.y, { continued: true })
                        .font('Helvetica-Oblique')
                        .fontSize(10)
                        .text(` ${organism}`);
                    if (isolateSource) {
                        doc
                            .font('Helvetica')
                            .fontSize(9)
                            .fillColor('#334155')
                            .text(`Source: ${isolateSource}`);
                    }
                    if (isolateCondition) {
                        doc
                            .font('Helvetica')
                            .fontSize(9)
                            .fillColor('#334155')
                            .text(`Condition: ${isolateCondition}`);
                    }
                    if (isolateColonyCount) {
                        doc
                            .font('Helvetica')
                            .fontSize(9)
                            .fillColor('#334155')
                            .text(`Colony count: ${isolateColonyCount}`);
                    }
                    if (isolateComment) {
                        doc
                            .font('Helvetica')
                            .fontSize(9)
                            .fillColor('#475569')
                            .text(isolateComment);
                    }
                    doc.moveDown(0.25);
                    drawCultureColumns(buildCultureAstColumns(isolate ?? null));
                    drawCultureNotes(isolateIndex === 0 ? notes : '');
                    renderedCulturePageCount += 1;
                });
            }
            for (let panelIndex = 0; panelIndex < panelParents.length; panelIndex++) {
                const panelParent = panelParents[panelIndex];
                const shouldStartNewPage = nonCultureRegularTests.length > 0 || renderedCulturePageCount > 0 || panelIndex > 0;
                if (shouldStartNewPage) {
                    doc.addPage();
                }
                ensureSpace(doc, 36);
                const panelTest = panelParent.test;
                const panelTitle = panelTest?.name || panelTest?.code || `Panel ${panelIndex + 1}`;
                doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(panelTitle);
                doc.moveDown(0.4);
                drawTableHeader();
                const panelChildren = panelChildrenByParent.get(panelParent.id) ?? [];
                const panelResultParams = panelParent.resultParameters ?? {};
                const parameterDefinitions = Array.isArray(panelTest?.parameterDefinitions)
                    ? panelTest.parameterDefinitions
                    : [];
                if (parameterDefinitions.length > 0 || Object.keys(panelResultParams).length > 0) {
                    const renderedCodes = new Set();
                    for (const def of parameterDefinitions) {
                        const code = (def?.code ?? '').trim();
                        if (code)
                            renderedCodes.add(code);
                        const rawValue = code ? panelResultParams[code] : undefined;
                        const normalizedValue = rawValue != null && String(rawValue).trim() ? String(rawValue).trim() : '-';
                        const reference = Array.isArray(def?.normalOptions) && def.normalOptions.length > 0
                            ? def.normalOptions.join(', ')
                            : '-';
                        drawResultRow({
                            testLabel: def?.label || code || 'Parameter',
                            result: normalizedValue,
                            unit: '-',
                            reference,
                        });
                    }
                    for (const [code, value] of Object.entries(panelResultParams)) {
                        if (renderedCodes.has(code))
                            continue;
                        drawResultRow({
                            testLabel: code,
                            result: value != null && String(value).trim() ? String(value).trim() : '-',
                            unit: '-',
                            reference: '-',
                        });
                    }
                }
                else if (panelChildren.length > 0) {
                    for (const child of panelChildren) {
                        drawOrderTestRow(child);
                    }
                }
                else {
                    drawResultRow({
                        testLabel: 'No data',
                        result: '-',
                        unit: '-',
                        reference: '-',
                    });
                }
            }
            if (comments.length > 0) {
                ensureSpace(doc, 60);
                doc.moveDown(0.4);
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Comments');
                doc.moveDown(0.2);
                doc
                    .font('Helvetica')
                    .fontSize(9)
                    .fillColor('#334155')
                    .text(comments.join(' | '), { width: tableWidth });
            }
            doc.end();
        });
    }
};
exports.ReportsService = ReportsService;
ReportsService.REPORT_PDF_LAYOUT_VERSION = 'results-report-layout-2026-03-15c';
ReportsService.cachedFont = null;
exports.ReportsService = ReportsService = ReportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(2, (0, typeorm_1.InjectRepository)(patient_entity_1.Patient)),
    __param(3, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(4, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(5, (0, typeorm_1.InjectRepository)(audit_log_entity_1.AuditLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ReportsService);
//# sourceMappingURL=reports.service.js.map