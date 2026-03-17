import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
// require() for CommonJS interop (pdfkit has no default export in some builds)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('qrcode') as {
  toDataURL(
    value: string,
    options?: { errorCorrectionLevel?: string; margin?: number; width?: number },
  ): Promise<string>;
};
import { Order } from '../entities/order.entity';
import { OrderTest, type OrderTestResultDocumentSummary } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { User } from '../entities/user.entity';
import { AuditAction, AuditLog } from '../entities/audit-log.entity';
import { TestType, type Test } from '../entities/test.entity';
import { TestComponent } from '../entities/test-component.entity';
import { buildResultsReportHtml } from './html/results-report.template';
import { buildReportDesignFingerprint } from './report-design-fingerprint.util';
import type { ReportStyleConfig } from './report-style.config';
import type { Browser } from 'playwright';
import { resolveNormalText, resolveNumericRange } from '../tests/normal-range.util';
import { formatPatientAgeDisplay, getPatientAgeSnapshot } from '../patients/patient-age.util';
import { hasMeaningfulOrderTestResult } from '../order-tests/order-test-result.util';
import { ResultDocumentsService } from '../result-documents/result-documents.service';
import { FileStorageService } from '../storage/file-storage.service';

type PdfKitDocument = InstanceType<typeof PDFDocument>;
const REPORT_BANNER_WIDTH = 2480;
const REPORT_BANNER_HEIGHT = 220;

export interface PublicResultTestItem {
  orderTestId: string;
  testCode: string;
  testName: string;
  departmentName: string;
  expectedCompletionMinutes: number | null;
  status: string;
  isVerified: boolean;
  hasResult: boolean;
  resultValue: string | null;
  unit: string | null;
  verifiedAt: string | null;
  resultEntryType: string;
  resultDocument: OrderTestResultDocumentSummary | null;
}

export interface PublicResultStatus {
  orderId: string;
  orderNumber: string;
  patientName: string;
  labName: string;
  onlineResultWatermarkDataUrl: string | null;
  onlineResultWatermarkText: string | null;
  registeredAt: string;
  paymentStatus: string;
  reportableCount: number;
  verifiedCount: number;
  progressPercent: number;
  ready: boolean;
  verifiedAt: string | null;
  tests: PublicResultTestItem[];
}

export type ReportActionKind = 'PDF' | 'PRINT' | 'WHATSAPP' | 'VIBER';

export type ReportActionFlags = {
  pdf: boolean;
  print: boolean;
  whatsapp: boolean;
  viber: boolean;
  timestamps: {
    pdf: string | null;
    print: string | null;
    whatsapp: string | null;
    viber: string | null;
  };
};

export type ReportBrandingOverride = {
  bannerDataUrl?: string | null;
  footerDataUrl?: string | null;
  logoDataUrl?: string | null;
  watermarkDataUrl?: string | null;
};

type ResultsPdfPerformanceMetrics = {
  orderId: string;
  labId: string;
  correlationId?: string | null;
  totalMs: number;
  snapshotMs: number;
  verifierLookupMs?: number;
  assetsMs?: number;
  htmlMs?: number;
  renderMs?: number;
  fallbackMs?: number;
  cacheHit: boolean;
  inFlightJoin: boolean;
};

type GenerateTestResultsPdfOptions = {
  bypassPaymentCheck?: boolean;
  bypassResultCompletionCheck?: boolean;
  disableCache?: boolean;
  cultureOnly?: boolean;
  correlationId?: string | null;
  reportDesignOverride?: {
    reportBranding?: ReportBrandingOverride;
    reportStyle?: ReportStyleConfig | null;
  };
};

type GenerateTestResultsPdfResult = {
  pdf: Buffer;
  performance: ResultsPdfPerformanceMetrics;
};

type PanelSectionLookup = {
  byPanelAndChildTest: Map<string, string | null>;
  fingerprint: string;
};

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function getNormalRange(
  test: Test,
  sex: string | null,
  patientAge: ReturnType<typeof getPatientAgeSnapshot>,
): string {
  const { normalMin: min, normalMax: max } = resolveNumericRange(
    test,
    sex,
    patientAge,
  );
  const resolvedText = resolveNormalText(test, sex);
  if (resolvedText !== null) return resolvedText;
  if (min != null && max != null) return `${min}-${max}`;
  if (min != null) return `>= ${min}`;
  if (max != null) return `<= ${max}`;
  return '-';
}

function formatResultValue(ot: OrderTest): string {
  const resultEntryType = String(
    (ot.test as { resultEntryType?: unknown } | undefined)?.resultEntryType ?? '',
  ).toUpperCase();
  if (
    resultEntryType === 'PDF_UPLOAD' &&
    String((ot as { resultDocumentStorageKey?: unknown }).resultDocumentStorageKey ?? '').trim()
  ) {
    return 'Attached PDF';
  }

  const cultureResult = (ot as { cultureResult?: unknown }).cultureResult as
    | {
      noGrowth?: unknown;
      noGrowthResult?: unknown;
      isolates?: unknown;
    }
    | null
    | undefined;
  if (cultureResult && typeof cultureResult === 'object') {
    if (cultureResult.noGrowth === true) {
      const noGrowthResult =
        typeof cultureResult.noGrowthResult === 'string' &&
          cultureResult.noGrowthResult.trim().length > 0
          ? cultureResult.noGrowthResult.trim()
          : 'No growth';
      return noGrowthResult;
    }
    if (Array.isArray(cultureResult.isolates) && cultureResult.isolates.length > 0) {
      const antibioticRows = cultureResult.isolates.reduce((sum, isolate) => {
        if (!isolate || typeof isolate !== 'object') return sum;
        const rows = Array.isArray((isolate as { antibiotics?: unknown }).antibiotics)
          ? ((isolate as { antibiotics?: unknown[] }).antibiotics?.length ?? 0)
          : 0;
        return sum + rows;
      }, 0);
      return `${cultureResult.isolates.length} isolate${cultureResult.isolates.length === 1 ? '' : 's'} • ${antibioticRows} row${antibioticRows === 1 ? '' : 's'}`;
    }
  }
  if (ot.resultText?.trim()) return ot.resultText.trim();
  if (ot.resultValue !== null && ot.resultValue !== undefined) return String(ot.resultValue);
  return 'Pending';
}

type CultureAstColumns = {
  sensitive: string[];
  intermediate: string[];
  resistancePrimary: string[];
  resistanceSecondary: string[];
};

const CULTURE_PRIMARY_RESISTANCE_CAPACITY = 24;

function isCultureSensitivityOrderTest(ot: OrderTest): boolean {
  return (
    String((ot.test as { resultEntryType?: unknown } | undefined)?.resultEntryType ?? '').toUpperCase() ===
    'CULTURE_SENSITIVITY'
  );
}

function getCultureAntibioticName(row: unknown): string {
  if (!row || typeof row !== 'object') return '-';
  const rowObj = row as { antibioticName?: unknown; antibioticCode?: unknown };
  const antibioticName = String(rowObj.antibioticName ?? '').trim();
  if (antibioticName) return antibioticName;
  const antibioticCode = String(rowObj.antibioticCode ?? '').trim();
  return antibioticCode || '-';
}

function buildCultureAstColumns(isolate: unknown): CultureAstColumns {
  const sensitive: string[] = [];
  const intermediate: string[] = [];
  const resistance: string[] = [];

  const isolateObj =
    isolate && typeof isolate === 'object'
      ? (isolate as { antibiotics?: unknown })
      : null;
  const antibiotics = Array.isArray(isolateObj?.antibiotics)
    ? isolateObj.antibiotics
    : [];

  for (const row of antibiotics) {
    if (!row || typeof row !== 'object') continue;
    const interpretation = String((row as { interpretation?: unknown }).interpretation ?? '').trim();
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

  const sortNames = (list: string[]) =>
    list
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

function hasNonEmptyResultParameters(params: Record<string, string> | null | undefined): boolean {
  if (!params || typeof params !== 'object') {
    return false;
  }
  return Object.values(params).some((value) => String(value ?? '').trim() !== '');
}

function formatResultParameters(params: Record<string, string> | null): string[] {
  if (!params) return [];
  return Object.entries(params)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${String(v).trim()}`);
}

function buildPanelComponentLookupKey(panelTestId: string, childTestId: string): string {
  return `${panelTestId}::${childTestId}`;
}

function drawHeaderBar(
  doc: PdfKitDocument,
  opts: { title: string; labName: string; subtitle?: string; logoImage?: Buffer | null },
) {
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
      doc.image(
        opts.logoImage,
        pageWidth - margin - logoSize,
        10,
        { fit: [logoSize, logoSize], align: 'center', valign: 'center' },
      );
    } catch {
      // Ignore invalid custom logo and continue rendering.
    }
  }
  doc.restore();

  doc.y = barHeight + 18;
}

function drawTwoColumnInfo(
  doc: PdfKitDocument,
  left: Array<[string, string]>,
  right: Array<[string, string]>,
) {
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

  const drawColumn = (items: Array<[string, string]>, x: number) => {
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

  // Divider line
  doc.save();
  doc.strokeColor('#E5E7EB').lineWidth(1);
  doc.moveTo(startX, doc.y).lineTo(startX + usableWidth, doc.y).stroke();
  doc.restore();
  doc.moveDown(1);
}

function ensureSpace(doc: PdfKitDocument, neededHeight: number, onNewPage?: () => void) {
  const bottomY = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight <= bottomY) return;
  doc.addPage();
  onNewPage?.();
}

function resolveReadablePath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function buildLabReportDesignFingerprint(lab: unknown): string {
  const reportLab = (lab ?? {}) as {
    reportBannerDataUrl?: string | null;
    reportFooterDataUrl?: string | null;
    reportLogoDataUrl?: string | null;
    reportWatermarkDataUrl?: string | null;
    reportStyle?: unknown;
  };
  return buildReportDesignFingerprint({
    reportBranding: {
      bannerDataUrl: reportLab.reportBannerDataUrl ?? null,
      footerDataUrl: reportLab.reportFooterDataUrl ?? null,
      logoDataUrl: reportLab.reportLogoDataUrl ?? null,
      watermarkDataUrl: reportLab.reportWatermarkDataUrl ?? null,
    },
    reportStyle: reportLab.reportStyle ?? null,
  });
}

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private static readonly REPORT_PDF_LAYOUT_VERSION = 'results-report-layout-2026-03-16-panel-sections';
  private readonly logger = new Logger(ReportsService.name);
  private browserPromise: Promise<Browser> | null = null;
  private readonly pdfCache = new Map<string, { buffer: Buffer; expiresAt: number; lastAccessedAt: number }>();
  private readonly pdfInFlight = new Map<string, Promise<Buffer>>();
  private readonly reportStorageSyncInFlight = new Map<string, Promise<string | null>>();
  private readonly pdfCacheTtlMs = this.parseEnvInt('REPORTS_PDF_CACHE_TTL_MS', 120_000, 0, 900_000);
  private readonly pdfCacheMaxEntries = this.parseEnvInt('REPORTS_PDF_CACHE_MAX_ENTRIES', 30, 1, 1000);
  private readonly pdfPerfLogThresholdMs = this.parseEnvInt(
    'REPORTS_PDF_PERF_LOG_THRESHOLD_MS',
    500,
    0,
    60_000,
  );

  // ── Static in-memory caches for files that never change at runtime ──
  private static cachedFont: { path: string; base64: string } | null = null;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    @InjectRepository(TestComponent)
    private readonly testComponentRepo: Repository<TestComponent>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly resultDocumentsService: ResultDocumentsService,
    private readonly fileStorageService: FileStorageService,
  ) { }

  private parseEnvInt(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }

  private mapResultDocumentSummary(
    orderTest: OrderTest,
  ): OrderTestResultDocumentSummary | null {
    const fileName = String(orderTest.resultDocumentFileName ?? '').trim();
    const storageKey = String(orderTest.resultDocumentStorageKey ?? '').trim();
    if (!fileName || !storageKey) {
      return null;
    }

    return {
      fileName,
      mimeType: orderTest.resultDocumentMimeType ?? 'application/pdf',
      sizeBytes: Number(orderTest.resultDocumentSizeBytes ?? 0) || 0,
      uploadedAt: orderTest.resultDocumentUploadedAt
        ? orderTest.resultDocumentUploadedAt.toISOString()
        : null,
      uploadedBy: orderTest.resultDocumentUploadedBy ?? null,
    };
  }

  onModuleInit(): void {
    // Pre-warm the browser so the first PDF request isn't slow.
    this.getBrowser().catch(() => { /* ignore – will retry on next call */ });
  }


  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = (async () => {
        // Lazy import so the app can still boot even if Playwright isn't installed yet.
        const { chromium } = await import('playwright');
        return chromium.launch({
          headless: true,
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
          // Container-safe flags for Railway/Linux + Windows-safe fallback.
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

  private async renderPdfFromHtml(html: string): Promise<Buffer> {
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
      } catch {
        // ignore emulate failures and continue with defaults
      }

      await page.evaluate(async () => {
        const fontReady = (document as any).fonts?.ready;
        if (fontReady) {
          try {
            await fontReady;
          } catch {
            // ignore font loading failures
          }
        }
        const images = Array.from(document.images || []);
        await Promise.all(
          images
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise<void>((resolve) => {
                  const done = () => {
                    img.removeEventListener('load', done);
                    img.removeEventListener('error', done);
                    resolve();
                  };
                  img.addEventListener('load', done);
                  img.addEventListener('error', done);
                }),
            ),
        );
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
        const toMm = (px: number) => (pxPerMm > 0 ? px / pxPerMm : px);
        const header = document.querySelector('.report-header') as any;
        if (header) {
          const prevHeight = header.style.height;
          const prevMinHeight = header.style.minHeight;
          header.style.height = 'auto';
          header.style.minHeight = '0';
          const headerRect = header.getBoundingClientRect();
          let contentBottom = headerRect.top;
          const title = header.querySelector('.report-title') as HTMLElement | null;
          if (title) {
            const rect = title.getBoundingClientRect();
            let marginBottom = 0;
            try {
              const style = window.getComputedStyle(title);
              marginBottom = parseFloat(style.marginBottom || '0') || 0;
            } catch {
              marginBottom = 0;
            }
            contentBottom = rect.bottom + marginBottom;
          } else {
            const headerChildren = Array.from(header.children || []);
            for (const child of headerChildren) {
              const rect = (child as HTMLElement).getBoundingClientRect();
              if (rect.bottom > contentBottom) {
                contentBottom = rect.bottom;
              }
            }
            const lastChild = header.lastElementChild as HTMLElement | null;
            if (lastChild) {
              try {
                const style = window.getComputedStyle(lastChild);
                const marginBottom = parseFloat(style.marginBottom || '0') || 0;
                if (marginBottom > 0) {
                  contentBottom += marginBottom;
                }
              } catch {
                // ignore
              }
            }
          }
          const measuredHeight =
            contentBottom > headerRect.top
              ? contentBottom - headerRect.top + 4
              : Math.max(header.scrollHeight, headerRect.height);
          let cloneHeight = 0;
          try {
            const clone = header.cloneNode(true) as HTMLElement;
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
          } catch {
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
        const footer = document.querySelector('.report-footer') as any;
        if (footer) {
          const prevHeight = footer.style.height;
          const prevMinHeight = footer.style.minHeight;
          footer.style.height = 'auto';
          footer.style.minHeight = '0';
          const footerRect = footer.getBoundingClientRect();
          const footerStyle = window.getComputedStyle(footer);
          const footerPaddingBottom =
            parseFloat(footerStyle.paddingBottom || '0') || 0;
          let contentBottom = footerRect.top;
          const footerChildren = Array.from(footer.children || []);
          for (const child of footerChildren) {
            const rect = (child as HTMLElement).getBoundingClientRect();
            if (rect.bottom > contentBottom) {
              contentBottom = rect.bottom;
            }
          }
          const measuredHeight =
            contentBottom > footerRect.top
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
        const table = document.querySelector('table.regular-results-table') as HTMLTableElement | null;
        if (!table) return;

        const sourcePage = table.closest('.page') as HTMLElement | null;
        const sourceContent = table.closest('.content') as HTMLElement | null;
        if (!sourcePage || !sourceContent) return;

        const tableHead = table.querySelector('thead');
        const tableFoot = table.querySelector('tfoot');
        const tableColGroup = table.querySelector('colgroup');
        if (!tableHead || !tableFoot) return;

        const pageComments = sourceContent.querySelector('.comments') as HTMLElement | null;
        const headerSpace = table.querySelector('thead .page-header-space') as HTMLElement | null;
        const footerSpace = table.querySelector('tfoot .page-footer-space') as HTMLElement | null;
        const headerRows = Array.from(table.querySelectorAll('thead tr')) as HTMLElement[];
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
        const marginTopPx =
          (parseFloat(bodyStyle.getPropertyValue('--page-margin-top') || '0') || 0) * pxPerMm;
        const marginBottomPx =
          (parseFloat(bodyStyle.getPropertyValue('--page-margin-bottom') || '0') || 0) * pxPerMm;
        const printableHeightPx = Math.max(1, pageHeightPx - marginTopPx - marginBottomPx);
        const headerSpaceHeight = headerSpace?.getBoundingClientRect().height || 0;
        const footerSpaceHeight = footerSpace?.getBoundingClientRect().height || 0;
        const columnHeaderHeight = columnHeaderRow?.getBoundingClientRect().height || 0;
        const paginationSafetyPx = Math.ceil(pxPerMm * 2);
        const availableBodyHeight = Math.max(
          24,
          printableHeightPx -
            headerSpaceHeight -
            footerSpaceHeight -
            columnHeaderHeight -
            paginationSafetyPx,
        );

        const rows = Array.from(table.querySelectorAll('tbody tr')).filter(
          (row) => row.getAttribute('data-repeat') !== '1',
        ) as HTMLElement[];
        if (rows.length === 0) return;

        type PageChunk = { rows: HTMLElement[]; comments: boolean };
        type RepeatContext = {
          row: HTMLElement | null;
          height: number;
        };

        const chunks: PageChunk[] = [];
        let currentRows: HTMLElement[] = [];
        let currentHeight = 0;
        let lastDept: RepeatContext = { row: null, height: 0 };
        let lastCat: RepeatContext = { row: null, height: 0 };

        const cloneRepeatRow = (row: HTMLElement | null) => {
          if (!row) return null;
          const clone = row.cloneNode(true) as HTMLElement;
          clone.setAttribute('data-repeat', '1');
          return clone;
        };

        const pushChunk = () => {
          if (currentRows.length === 0) return;
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
            } else if (isCatRow && lastDept.row) {
              const deptClone = cloneRepeatRow(lastDept.row);
              if (deptClone) {
                currentRows.push(deptClone);
                currentHeight += lastDept.height;
              }
            }
          }

          currentRows.push(row.cloneNode(true) as HTMLElement);
          currentHeight += rowHeight;

          if (isDeptRow) {
            lastDept = { row, height: rowHeight };
            lastCat = { row: null, height: 0 };
          } else if (isCatRow) {
            lastCat = { row, height: rowHeight };
          }
        }

        pushChunk();
        if (chunks.length === 0) return;
        chunks[chunks.length - 1].comments = Boolean(pageComments);

        const createPage = (chunk: PageChunk) => {
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
        if (!parent) return;

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
    } finally {
      await page.close().catch(() => { });
    }
  }

  async onModuleDestroy(): Promise<void> {
    const browserPromise = this.browserPromise;
    this.browserPromise = null;
    this.pdfCache.clear();
    this.pdfInFlight.clear();
    this.reportStorageSyncInFlight.clear();
    if (!browserPromise) return;
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {
      // ignore
    }
  }

  private buildReportPdfCacheKey(input: {
    labId: string;
    order: Order;
    reportableOrderTests: OrderTest[];
    latestVerifiedAt: Date | null;
    bypassPaymentCheck: boolean;
    orderQrValue: string;
    panelSectionFingerprint?: string;
    cultureOnly?: boolean;
  }): string {
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
      ReportsService.REPORT_PDF_LAYOUT_VERSION,
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
      input.panelSectionFingerprint ?? '-',
      String(input.reportableOrderTests.length),
      reportableFingerprint,
    ].join('::');

    return createHash('sha1').update(rawKey).digest('hex');
  }

  private buildStoredReportPdfObjectKey(input: {
    labId: string;
    order: Order;
    reportableOrderTests: OrderTest[];
    latestVerifiedAt: Date | null;
    orderQrValue: string;
    panelSectionFingerprint?: string;
  }): string {
    const patient = input.order.patient;
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
      ReportsService.REPORT_PDF_LAYOUT_VERSION,
      input.labId,
      input.order.id,
      input.order.orderNumber ?? '-',
      input.order.registeredAt ? new Date(input.order.registeredAt).toISOString() : '-',
      patient?.id ?? '-',
      patient?.updatedAt ? new Date(patient.updatedAt).toISOString() : '-',
      patient?.fullName ?? '-',
      patient?.sex ?? '-',
      patient?.dateOfBirth ? new Date(patient.dateOfBirth).toISOString() : '-',
      input.order.lab?.updatedAt ? new Date(input.order.lab.updatedAt).toISOString() : '-',
      reportDesignFingerprint,
      input.latestVerifiedAt ? new Date(input.latestVerifiedAt).toISOString() : '-',
      input.orderQrValue,
      input.panelSectionFingerprint ?? '-',
      String(input.reportableOrderTests.length),
      reportableFingerprint,
    ].join('::');
    const fingerprint = createHash('sha1').update(rawKey).digest('hex');
    return `reports/${input.labId}/${input.order.id}/${fingerprint}.pdf`;
  }

  private isReportReadyForStorage(
    reportableOrderTests: OrderTest[],
    verifiedTests: OrderTest[],
  ): boolean {
    return reportableOrderTests.length > 0 && verifiedTests.length === reportableOrderTests.length;
  }

  private async clearStoredReportArtifact(
    orderId: string,
    existingKey: string | null | undefined,
  ): Promise<void> {
    if (existingKey && this.fileStorageService.isConfigured()) {
      await this.fileStorageService.deleteFile(existingKey);
    }
    await this.orderRepo.update(orderId, {
      reportS3Key: null,
      reportGeneratedAt: null,
    });
  }

  private async loadPanelSectionLookup(orderTests: OrderTest[]): Promise<PanelSectionLookup> {
    const panelTestIds = Array.from(
      new Set(
        orderTests
          .filter((ot) => !ot.parentOrderTestId && ot.test?.type === TestType.PANEL)
          .map((ot) => ot.testId)
          .filter((testId): testId is string => Boolean(testId)),
      ),
    );

    if (panelTestIds.length === 0) {
      return {
        byPanelAndChildTest: new Map<string, string | null>(),
        fingerprint: '-',
      };
    }

    const components = await this.testComponentRepo.find({
      where: panelTestIds.map((panelTestId) => ({ panelTestId })),
      select: ['panelTestId', 'childTestId', 'reportSection', 'updatedAt'],
      order: {
        panelTestId: 'ASC',
        sortOrder: 'ASC',
      },
    });

    const byPanelAndChildTest = new Map<string, string | null>();
    const fingerprint = components
      .map((component) => {
        const reportSection = component.reportSection?.trim() || null;
        byPanelAndChildTest.set(
          buildPanelComponentLookupKey(component.panelTestId, component.childTestId),
          reportSection,
        );
        return [
          component.panelTestId,
          component.childTestId,
          reportSection ?? '-',
          component.updatedAt ? new Date(component.updatedAt).getTime() : 0,
        ].join(':');
      })
      .sort()
      .join('|');

    return {
      byPanelAndChildTest,
      fingerprint: fingerprint || '-',
    };
  }

  private attachPanelSectionMetadata(
    orderTests: OrderTest[],
    lookup: Map<string, string | null>,
  ): OrderTest[] {
    if (!orderTests.length || lookup.size === 0) {
      return orderTests;
    }

    const panelTestIdByRootOrderTestId = new Map<string, string>();
    for (const orderTest of orderTests) {
      if (!orderTest.parentOrderTestId && orderTest.test?.type === TestType.PANEL && orderTest.testId) {
        panelTestIdByRootOrderTestId.set(orderTest.id, orderTest.testId);
      }
    }

    return orderTests.map((orderTest) => {
      if (!orderTest.parentOrderTestId) {
        return orderTest;
      }
      const parentPanelTestId = panelTestIdByRootOrderTestId.get(orderTest.parentOrderTestId);
      if (!parentPanelTestId) {
        return orderTest;
      }
      const reportSection =
        lookup.get(buildPanelComponentLookupKey(parentPanelTestId, orderTest.testId)) ?? null;
      return Object.assign({}, orderTest, {
        panelReportSection: reportSection,
      }) as OrderTest;
    });
  }

  private normalizeAbsoluteUrlBase(value: string | undefined): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(withProtocol);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return null;
    }
  }

  private resolvePublicResultsBaseUrl(): string {
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

  private isValidLabSubdomain(value: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
  }

  private resolvePublicResultsLabBaseDomain(): string | null {
    const raw = String(process.env.PUBLIC_RESULTS_LAB_BASE_DOMAIN ?? 'medilis.net')
      .trim()
      .toLowerCase();
    if (!raw) return null;
    const normalized = raw
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('..')) return null;
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized)) return null;
    return normalized;
  }

  private resolveOrderQrValue(order: Order): string {
    const orderId = encodeURIComponent(order.id);
    const labSubdomain = String(order.lab?.subdomain ?? '').trim().toLowerCase();
    const labBaseDomain = this.resolvePublicResultsLabBaseDomain();
    if (labBaseDomain && this.isValidLabSubdomain(labSubdomain)) {
      return `https://${labSubdomain}.${labBaseDomain}/public/results/${orderId}`;
    }

    const baseUrl = this.resolvePublicResultsBaseUrl();
    return `${baseUrl}/public/results/${orderId}`;
  }

  private async generateOrderQrDataUrl(order: Order): Promise<string | null> {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to generate order QR for order ${order.id}: ${message}`);
      return null;
    }
  }

  private getCachedPdf(cacheKey: string): Buffer | null {
    if (this.pdfCacheTtlMs <= 0) return null;
    const now = Date.now();
    const entry = this.pdfCache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.pdfCache.delete(cacheKey);
      return null;
    }
    entry.lastAccessedAt = now;
    return Buffer.from(entry.buffer);
  }

  private setCachedPdf(cacheKey: string, pdf: Buffer): void {
    if (this.pdfCacheTtlMs <= 0) return;
    const now = Date.now();
    this.pdfCache.set(cacheKey, {
      buffer: Buffer.from(pdf),
      expiresAt: now + this.pdfCacheTtlMs,
      lastAccessedAt: now,
    });

    for (const [key, entry] of this.pdfCache) {
      if (entry.expiresAt <= now) this.pdfCache.delete(key);
    }

    if (this.pdfCache.size <= this.pdfCacheMaxEntries) return;
    const oldest = [...this.pdfCache.entries()]
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
      .slice(0, this.pdfCache.size - this.pdfCacheMaxEntries);
    for (const [key] of oldest) {
      this.pdfCache.delete(key);
    }
  }

  private logResultsPdfPerformance(input: ResultsPdfPerformanceMetrics): void {
    if (input.totalMs < this.pdfPerfLogThresholdMs && !input.correlationId) return;
    this.logger.log(
      JSON.stringify({
        event: 'reports.results_pdf.performance',
        correlationId: input.correlationId ?? null,
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
      }),
    );
  }

  async ensureOrderBelongsToLab(orderId: string, labId: string): Promise<void> {
    const exists = await this.orderRepo.exist({ where: { id: orderId, labId } });
    if (!exists) {
      throw new NotFoundException('Order not found');
    }
  }

  async getOrderActionFlags(
    labId: string,
    orderIds: string[],
  ): Promise<Record<string, ReportActionFlags>> {
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

    const result: Record<string, ReportActionFlags> = Object.fromEntries(
      scopedOrderIds.map((orderId) => [
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
        } satisfies ReportActionFlags,
      ]),
    );

    const logs = await this.auditLogRepo.find({
      where: {
        labId,
        entityType: 'order',
        entityId: In(scopedOrderIds),
        action: AuditAction.REPORT_PRINT,
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
      } else if (actionKind === 'PRINT') {
        result[orderId].print = true;
        result[orderId].timestamps.print = createdAtIso;
      } else if (actionKind === 'WHATSAPP') {
        result[orderId].whatsapp = true;
        result[orderId].timestamps.whatsapp = createdAtIso;
      } else if (actionKind === 'VIBER') {
        result[orderId].viber = true;
        result[orderId].timestamps.viber = createdAtIso;
      }
    }

    return result;
  }

  private resolveReportActionKindFromAudit(
    newValues: Record<string, unknown> | null,
  ): ReportActionKind | null {
    if (!newValues || typeof newValues !== 'object') {
      return null;
    }

    const actionKindRaw = newValues.actionKind;
    const actionKind = String(actionKindRaw ?? '')
      .trim()
      .toUpperCase();
    if (actionKind === 'PDF') return 'PDF';
    if (actionKind === 'PRINT') return 'PRINT';
    if (actionKind === 'WHATSAPP') return 'WHATSAPP';
    if (actionKind === 'VIBER') return 'VIBER';

    const channel = String((newValues as { channel?: unknown }).channel ?? '')
      .trim()
      .toUpperCase();
    if (channel === 'WHATSAPP') return 'WHATSAPP';
    if (channel === 'VIBER') return 'VIBER';

    return null;
  }

  private decodeImageDataUrl(value: unknown): Buffer | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!match?.[1]) return null;
    try {
      return Buffer.from(match[1], 'base64');
    } catch {
      return null;
    }
  }

  private applyReportDesignOverride(
    order: Order,
    override?: {
      reportBranding?: ReportBrandingOverride;
      reportStyle?: ReportStyleConfig | null;
    },
  ): Order {
    if (!override) {
      return order;
    }

    const currentLab = (order.lab ?? {}) as Lab & {
      reportBannerDataUrl?: string | null;
      reportFooterDataUrl?: string | null;
      reportLogoDataUrl?: string | null;
      reportWatermarkDataUrl?: string | null;
      reportStyle?: ReportStyleConfig | null;
    };

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
      lab: nextLab as unknown as Lab,
    };
  }

  private applyFallbackPageBranding(
    doc: PdfKitDocument,
    opts: { watermarkImage: Buffer | null; footerImage: Buffer | null },
  ): void {
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
      } catch {
        // Ignore invalid watermark and continue rendering.
      }
      doc.restore();
    }

    if (opts.footerImage) {
      const footerWidth = pageWidth - marginLeft - marginRight;
      const footerHeight = Math.max(
        16,
        Math.round((footerWidth * REPORT_BANNER_HEIGHT) / REPORT_BANNER_WIDTH),
      );
      const footerY = pageHeight - footerHeight - 2;
      try {
        doc.image(opts.footerImage, marginLeft, footerY, {
          fit: [footerWidth, footerHeight],
          align: 'center',
          valign: 'center',
        });
      } catch {
        // Ignore invalid footer image and continue rendering.
      }
    }
  }

  private getReportableOrderTests(orderTests: OrderTest[]): OrderTest[] {
    const panelParentIdsWithChildren = new Set(
      orderTests
        .filter((ot) => !!ot.parentOrderTestId)
        .map((ot) => ot.parentOrderTestId as string),
    );

    return orderTests.filter((ot) => {
      const t = ot.test as Test | undefined;
      if (!t) return false;
      if (t.type === TestType.PANEL) {
        if (ot.parentOrderTestId) return true;
        const hasParams = Array.isArray(t.parameterDefinitions) && t.parameterDefinitions.length > 0;
        const hasChildren = panelParentIdsWithChildren.has(ot.id);
        return hasParams || hasChildren;
      }
      return true;
    });
  }

  private classifyOrderTestsForReport(orderTests: OrderTest[]): {
    regularTests: OrderTest[];
    panelParents: OrderTest[];
    panelChildrenByParent: Map<string, OrderTest[]>;
  } {
    const sortKey = (ot: OrderTest): string => {
      const test = ot.test as (Test & { sortOrder?: number }) | undefined;
      const sortOrder = Number(test?.sortOrder ?? 0);
      const code = (test?.code || '').toUpperCase();
      return `${String(sortOrder).padStart(6, '0')}_${code}`;
    };

    const panelParents = orderTests
      .filter((ot) => !ot.parentOrderTestId && (ot.test as Test | undefined)?.type === TestType.PANEL)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    const panelParentIds = new Set(panelParents.map((ot) => ot.id));
    const panelChildrenByParent = new Map<string, OrderTest[]>();
    for (const parent of panelParents) {
      panelChildrenByParent.set(parent.id, []);
    }

    for (const ot of orderTests) {
      if (!ot.parentOrderTestId || !panelParentIds.has(ot.parentOrderTestId)) continue;
      const list = panelChildrenByParent.get(ot.parentOrderTestId);
      if (list) list.push(ot);
    }

    for (const [, children] of panelChildrenByParent) {
      children.sort((a, b) => {
        // Use panel-defined sort order if available; fall back to test code
        const aOrder = (a as any).panelSortOrder ?? 9999;
        const bOrder = (b as any).panelSortOrder ?? 9999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aCode = ((a.test as Test | undefined)?.code || '').toUpperCase();
        const bCode = ((b.test as Test | undefined)?.code || '').toUpperCase();
        return aCode.localeCompare(bCode);
      });
    }

    const regularTests = orderTests
      .filter(
        (ot) =>
          !panelParentIds.has(ot.id) &&
          (!ot.parentOrderTestId || !panelParentIds.has(ot.parentOrderTestId)),
      )
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    return { regularTests, panelParents, panelChildrenByParent };
  }

  private isOrderTestResultEntered(
    orderTest: OrderTest,
    childOrderTestParentIds: Set<string>,
  ): boolean {
    const test = orderTest.test as Test | undefined;
    if (!test) return false;
    const hasDirectResult = hasMeaningfulOrderTestResult(orderTest);

    // Panel parent rows with child tests represent a container; children carry actual results.
    if (test.type === TestType.PANEL && !orderTest.parentOrderTestId) {
      if (childOrderTestParentIds.has(orderTest.id)) {
        return true;
      }
      return hasDirectResult;
    }

    return hasDirectResult;
  }

  private assertAllResultsEnteredForReport(orderTests: OrderTest[]): void {
    if (orderTests.length === 0) {
      throw new BadRequestException('No reportable tests found for this order.');
    }

    const childOrderTestParentIds = new Set(
      orderTests
        .filter((orderTest) => Boolean(orderTest.parentOrderTestId))
        .map((orderTest) => orderTest.parentOrderTestId as string),
    );

    const pendingTests = orderTests.filter(
      (orderTest) => !this.isOrderTestResultEntered(orderTest, childOrderTestParentIds),
    );

    if (pendingTests.length === 0) {
      return;
    }

    const labels = pendingTests
      .slice(0, 5)
      .map((orderTest) => {
        const test = orderTest.test as Test | undefined;
        return test?.code || test?.name || orderTest.id;
      })
      .join(', ');
    const extraCount = pendingTests.length - Math.min(pendingTests.length, 5);
    const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';

    throw new BadRequestException(
      `Cannot print/download results while some tests are pending: ${labels}${suffix}. Enter all results first.`,
    );
  }

  private assertAllResultsVerifiedForReport(
    reportableOrderTests: OrderTest[],
    verifiedTests: OrderTest[],
  ): void {
    if (reportableOrderTests.length === 0) {
      throw new BadRequestException('No reportable tests found for this order.');
    }

    if (verifiedTests.length === reportableOrderTests.length) {
      return;
    }

    const verifiedIds = new Set(verifiedTests.map((orderTest) => orderTest.id));
    const unverifiedTests = reportableOrderTests.filter(
      (orderTest) => !verifiedIds.has(orderTest.id),
    );
    const labels = unverifiedTests
      .slice(0, 5)
      .map((orderTest) => {
        const test = orderTest.test as Test | undefined;
        return test?.code || test?.name || orderTest.id;
      })
      .join(', ');
    const extraCount = unverifiedTests.length - Math.min(unverifiedTests.length, 5);
    const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';

    throw new BadRequestException(
      `Cannot print/download results while some tests are still unverified: ${labels}${suffix}. Verify all results first.`,
    );
  }

  private async loadOrderResultsSnapshot(
    orderId: string,
    labId?: string,
  ): Promise<{
    order: Order;
    reportableOrderTests: OrderTest[];
    verifiedTests: OrderTest[];
    latestVerifiedAt: Date | null;
  }> {
    const where = labId ? { id: orderId, labId } : { id: orderId };

    // Keep order query lightweight; fetch tests separately by sample.orderId.
    const order = await this.orderRepo.findOne({
      where,
      relations: [
        'patient',
        'lab',
        'shift',
      ],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
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
    const verifiedTests = reportableOrderTests.filter(
      (ot) => ot.status === 'VERIFIED',
    );
    const latestVerifiedAt =
      verifiedTests
        .map((ot) => (ot.verifiedAt ? new Date(ot.verifiedAt) : null))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      order,
      reportableOrderTests,
      verifiedTests,
      latestVerifiedAt,
    };
  }

  async getPublicResultStatus(orderId: string): Promise<PublicResultStatus> {
    const { order, reportableOrderTests, verifiedTests, latestVerifiedAt } =
      await this.loadOrderResultsSnapshot(orderId);

    if (order.lab?.enableOnlineResults === false) {
      throw new ForbiddenException('Online results are disabled by laboratory settings.');
    }

    const ready =
      order.paymentStatus === 'paid' &&
      reportableOrderTests.length > 0 &&
      verifiedTests.length === reportableOrderTests.length;
    const progressPercent =
      reportableOrderTests.length > 0
        ? Math.round((verifiedTests.length / reportableOrderTests.length) * 100)
        : 0;
    const tests: PublicResultTestItem[] = reportableOrderTests
      .map((ot) => {
        const test = ot.test as Test | undefined;
        const departmentName =
          (test as unknown as { department?: { name?: string | null } })?.department?.name ||
          'General Department';
        const rawExpectedCompletionMinutes = Number(test?.expectedCompletionMinutes ?? 0);
        const expectedCompletionMinutes =
          Number.isFinite(rawExpectedCompletionMinutes) && rawExpectedCompletionMinutes > 0
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
          resultEntryType: String(test?.resultEntryType ?? 'NUMERIC'),
          resultDocument: this.mapResultDocumentSummary(ot),
        };
      })
      .sort((a, b) => {
        const dept = a.departmentName.localeCompare(b.departmentName);
        if (dept !== 0) return dept;
        const code = a.testCode.localeCompare(b.testCode);
        if (code !== 0) return code;
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

  async generatePublicTestResultsPDF(orderId: string): Promise<Buffer> {
    const { order, reportableOrderTests, verifiedTests } = await this.loadOrderResultsSnapshot(orderId);
    if (order.lab?.enableOnlineResults === false) {
      throw new ForbiddenException('Online results are disabled by laboratory settings.');
    }
    const ready =
      order.paymentStatus === 'paid' &&
      reportableOrderTests.length > 0 &&
      verifiedTests.length === reportableOrderTests.length;
    if (!ready) {
      throw new ForbiddenException('Results are not completed yet. Please check again later.');
    }
    return this.generateTestResultsPDF(orderId, order.labId);
  }

  async getPublicResultDocument(
    orderId: string,
    orderTestId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const { order, reportableOrderTests, verifiedTests } = await this.loadOrderResultsSnapshot(orderId);
    if (order.lab?.enableOnlineResults === false) {
      throw new ForbiddenException('Online results are disabled by laboratory settings.');
    }

    const ready =
      order.paymentStatus === 'paid' &&
      reportableOrderTests.length > 0 &&
      verifiedTests.length === reportableOrderTests.length;
    if (!ready) {
      throw new ForbiddenException('Results are not completed yet. Please check again later.');
    }

    const target = reportableOrderTests.find((item) => item.id === orderTestId);
    if (!target || target.status !== 'VERIFIED') {
      throw new NotFoundException('Result document not found');
    }

    return {
      buffer: await this.resultDocumentsService.readDocument(target.resultDocumentStorageKey),
      fileName: target.resultDocumentFileName ?? 'result.pdf',
      mimeType: target.resultDocumentMimeType ?? 'application/pdf',
    };
  }

  async generateDraftTestResultsPreviewPDF(input: {
    orderId: string;
    labId: string;
    previewMode?: 'full' | 'culture_only';
    reportBranding: ReportBrandingOverride;
    reportStyle: ReportStyleConfig;
  }): Promise<Buffer> {
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

  async generateOrderReceiptPDF(orderId: string, labId: string): Promise<Buffer> {
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
      throw new NotFoundException('Order not found');
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [400, 595], margin: 20 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).font('Helvetica-Bold');
      doc.text(order.lab?.name || 'Laboratory', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      doc.text('Laboratory Information System', { align: 'center' });
      doc.moveDown(1);

      // Order info
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`Order #: ${order.orderNumber || order.id.substring(0, 8)}`, { align: 'left' });
      doc.fontSize(10).font('Helvetica');
      const orderDate = new Date(order.registeredAt).toLocaleString();
      doc.text(`Date: ${orderDate}`, { align: 'left' });
      if (order.shift) {
        doc.text(`Shift: ${order.shift.name || order.shift.code}`, { align: 'left' });
      }
      doc.moveDown(1);

      // Patient info
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Patient Information', { align: 'left' });
      doc.fontSize(10).font('Helvetica');
      const patientName = order.patient.fullName || '-';
      const patientAgeDisplay = formatPatientAgeDisplay(
        order.patient.dateOfBirth,
        order.registeredAt,
      );
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

      // Tests table
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Tests Ordered', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');

      const allTests = order.samples.flatMap((sample) =>
        sample.orderTests.map((ot) => ({
          code: ot.test.code,
          name: ot.test.name,
          price: ot.price,
        })),
      );

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
        doc.text(
          test.price !== null ? `${parseFloat(test.price.toString()).toFixed(0)} IQD` : '-',
          startX + testWidth,
          yPos,
          { width: priceWidth, align: 'right' },
        );
        yPos += 15;
      });

      doc.moveDown(1);

      // Totals
      doc.font('Helvetica');
      doc.text(`Subtotal: ${parseFloat(order.totalAmount.toString()).toFixed(0)} IQD`, {
        align: 'right',
      });
      if (order.discountPercent != null && Number(order.discountPercent) > 0) {
        const discountAmount =
          parseFloat(order.totalAmount.toString()) -
          parseFloat((order.finalAmount ?? order.totalAmount).toString());
        doc.text(`Discount (${order.discountPercent}%): -${discountAmount.toFixed(0)} IQD`, {
          align: 'right',
        });
      }
      doc.fontSize(12).font('Helvetica-Bold');
      const finalAmount =
        order.finalAmount != null
          ? parseFloat(order.finalAmount.toString())
          : parseFloat(order.totalAmount.toString());
      doc.text(`TOTAL: ${finalAmount.toFixed(0)} IQD`, { align: 'right' });
      doc.moveDown(1);

      // Samples
      doc.fontSize(10).font('Helvetica');
      doc.text(`Samples: ${order.samples.length} sample(s)`, { align: 'left' });
      order.samples.forEach((sample) => {
        doc.text(`  - ${sample.tubeType?.replace('_', ' ') || 'Unknown'} tube`, {
          align: 'left',
        });
      });

      doc.moveDown(1);

      // Footer
      doc.fontSize(8).font('Helvetica');
      doc.text('Thank you for choosing our laboratory', { align: 'center' });
      doc.text(`Printed: ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();
    });
  }

  async generateTestResultsPDF(
    orderId: string,
    labId: string,
    options?: GenerateTestResultsPdfOptions,
  ): Promise<Buffer> {
    const result = await this.generateTestResultsPDFWithProfile(orderId, labId, options);
    return result.pdf;
  }

  /**
   * Generates the report PDF in the background and uploads it to Cloudflare R2 (S3).
   * Updates the Order record with the S3 key and timestamp.
   */
  async syncReportToS3(orderId: string, labId: string): Promise<string | null> {
    if (!this.fileStorageService.isConfigured()) {
      this.logger.debug(
        `Skipping report storage sync for order ${orderId}: S3/R2 storage is not configured.`,
      );
      return null;
    }

    const syncKey = `${labId}:${orderId}`;
    const existingSync = this.reportStorageSyncInFlight.get(syncKey);
    if (existingSync) {
      return existingSync;
    }

    const syncPromise = (async () => {
      try {
        const { order, reportableOrderTests, verifiedTests, latestVerifiedAt } =
          await this.loadOrderResultsSnapshot(orderId, labId);

        if (!this.isReportReadyForStorage(reportableOrderTests, verifiedTests)) {
          await this.clearStoredReportArtifact(orderId, order.reportS3Key);
          return null;
        }

        const panelSectionLookup = await this.loadPanelSectionLookup(reportableOrderTests);
        const reportableOrderTestsWithSections = this.attachPanelSectionMetadata(
          reportableOrderTests,
          panelSectionLookup.byPanelAndChildTest,
        );
        const orderQrValue = this.resolveOrderQrValue(order);
        const expectedKey = this.buildStoredReportPdfObjectKey({
          labId,
          order,
          reportableOrderTests: reportableOrderTestsWithSections,
          latestVerifiedAt,
          orderQrValue,
          panelSectionFingerprint: panelSectionLookup.fingerprint,
        });

        if (order.reportS3Key === expectedKey && order.reportGeneratedAt) {
          return expectedKey;
        }

        const result = await this.generateTestResultsPDFWithProfile(orderId, labId, {
          bypassPaymentCheck: true,
          disableCache: true,
        });

        await this.fileStorageService.uploadFile(expectedKey, result.pdf, 'application/pdf');
        await this.orderRepo.update(orderId, {
          reportS3Key: expectedKey,
          reportGeneratedAt: new Date(),
        });

        if (order.reportS3Key && order.reportS3Key !== expectedKey) {
          await this.fileStorageService.deleteFile(order.reportS3Key);
        }

        this.logger.log(`Successfully synced report to S3: ${expectedKey}`);
        return expectedKey;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`Failed to sync report to S3 for order ${orderId}: ${message}`, stack);
        return null;
      }
    })();

    this.reportStorageSyncInFlight.set(syncKey, syncPromise);
    try {
      return await syncPromise;
    } finally {
      this.reportStorageSyncInFlight.delete(syncKey);
    }
  }

  async generateTestResultsPDFWithProfile(
    orderId: string,
    labId: string,
    options?: GenerateTestResultsPdfOptions,
  ): Promise<GenerateTestResultsPdfResult> {
    const startMs = Date.now();
    const snapshotStartMs = Date.now();
    const { order, reportableOrderTests, verifiedTests, latestVerifiedAt } =
      await this.loadOrderResultsSnapshot(orderId, labId);
    const snapshotMs = Date.now() - snapshotStartMs;
    const bypassPaymentCheck = !!options?.bypassPaymentCheck;
    const bypassResultCompletionCheck = !!options?.bypassResultCompletionCheck;
    const disableCache = !!options?.disableCache;
    const cultureOnly = !!options?.cultureOnly;
    const orderForRender = this.applyReportDesignOverride(order, options?.reportDesignOverride);
    const renderedOrderTests = cultureOnly
      ? reportableOrderTests.filter((ot) =>
        String((ot.test as { resultEntryType?: unknown } | undefined)?.resultEntryType ?? '')
          .toUpperCase() === 'CULTURE_SENSITIVITY',
      )
      : reportableOrderTests;
    const panelSectionLookup = await this.loadPanelSectionLookup(renderedOrderTests);
    const renderedOrderTestsWithSections = this.attachPanelSectionMetadata(
      renderedOrderTests,
      panelSectionLookup.byPanelAndChildTest,
    );
    const renderedVerifiedTests = cultureOnly
      ? verifiedTests.filter((ot) => renderedOrderTests.some((candidate) => candidate.id === ot.id))
      : verifiedTests;

    if (!bypassResultCompletionCheck) {
      this.assertAllResultsEnteredForReport(reportableOrderTests);
      this.assertAllResultsVerifiedForReport(reportableOrderTests, verifiedTests);
    }

    if (!bypassPaymentCheck && order.paymentStatus !== 'paid') {
      throw new ForbiddenException(
        'Order is unpaid or partially paid. Complete payment to download or print results.',
      );
    }

    const orderQrValue = this.resolveOrderQrValue(orderForRender);
    const storedReportKey =
      !disableCache && !cultureOnly && !options?.reportDesignOverride
        ? this.buildStoredReportPdfObjectKey({
          labId,
          order: orderForRender,
          reportableOrderTests: renderedOrderTestsWithSections,
          latestVerifiedAt,
          orderQrValue,
          panelSectionFingerprint: panelSectionLookup.fingerprint,
        })
        : null;

    if (
      storedReportKey &&
      this.fileStorageService.isConfigured() &&
      order.reportS3Key === storedReportKey
    ) {
      try {
        const cachedPdf = await this.fileStorageService.getFile(storedReportKey);
        return {
          pdf: cachedPdf,
          performance: {
            orderId,
            labId,
            correlationId: options?.correlationId ?? null,
            totalMs: Date.now() - startMs,
            snapshotMs,
            cacheHit: true,
            inFlightJoin: false,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Stored report fetch failed for order ${orderId} (${storedReportKey}): ${message}`,
        );
      }
    }

    const cacheKey = this.buildReportPdfCacheKey({
      labId,
      order: orderForRender,
      reportableOrderTests: renderedOrderTestsWithSections,
      latestVerifiedAt,
      bypassPaymentCheck,
      orderQrValue,
      panelSectionFingerprint: panelSectionLookup.fingerprint,
      cultureOnly,
    });

    let verifierLookupMs = 0;
    let assetsMs = 0;
    let htmlMs = 0;
    let renderMs = 0;
    let fallbackMs = 0;
    const correlationId = options?.correlationId ?? null;
    const buildPerformance = (
      cacheHit: boolean,
      inFlightJoin: boolean,
    ): ResultsPdfPerformanceMetrics => ({
      orderId,
      labId,
      correlationId,
      totalMs: Date.now() - startMs,
      snapshotMs,
      verifierLookupMs,
      assetsMs,
      htmlMs,
      renderMs,
      fallbackMs,
      cacheHit,
      inFlightJoin,
    });

    const generatePdf = async () => {
      const verifierLookupStartMs = Date.now();
      const verifierIds = [
        ...new Set(
          renderedOrderTestsWithSections
            .map((ot) => ot.verifiedBy)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const verifiers =
        verifierIds.length === 0
          ? []
          : await this.userRepo.find({
            where: verifierIds.map((id) => ({ id })),
          });
      verifierLookupMs = Date.now() - verifierLookupStartMs;
      const verifierNameMap = new Map(
        verifiers.map((u) => [u.id, u.fullName || u.username || u.id.substring(0, 8)]),
      );

      const verifierNames = [
        ...new Set(
          renderedVerifiedTests
            .map((ot) => (ot.verifiedBy ? verifierNameMap.get(ot.verifiedBy) || ot.verifiedBy : null))
            .filter((name): name is string => Boolean(name)),
        ),
      ];
      const comments = [
        ...new Set(
          renderedOrderTestsWithSections
            .map((ot) => ot.comments?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ];

      // Optimization: font files are immutable at runtime - serve from
      // in-memory cache after the first read to avoid repeated disk I/O.
      const assetsStartMs = Date.now();
      let kurdishFontBase64: string | undefined;
      const kurdishFontPath = resolveReadablePath([
        join(__dirname, 'fonts', 'NotoNaskhArabic-Regular.ttf'),
        join(process.cwd(), 'dist', 'src', 'reports', 'fonts', 'NotoNaskhArabic-Regular.ttf'),
        join(process.cwd(), 'src', 'reports', 'fonts', 'NotoNaskhArabic-Regular.ttf'),
      ]);
      if (kurdishFontPath) {
        try {
          if (!ReportsService.cachedFont || ReportsService.cachedFont.path !== kurdishFontPath) {
            const fontBuf = readFileSync(kurdishFontPath);
            ReportsService.cachedFont = { path: kurdishFontPath, base64: `data:font/ttf;base64,${fontBuf.toString('base64')}` };
          }
          kurdishFontBase64 = ReportsService.cachedFont.base64;
        } catch {
          // ignore
        }
      }
      assetsMs = Date.now() - assetsStartMs;

      const orderQrDataUrl = await this.generateOrderQrDataUrl(orderForRender);

      const htmlStartMs = Date.now();
      const html = buildResultsReportHtml({
        order: orderForRender,
        orderTests: renderedOrderTestsWithSections,
        verifiedCount: renderedVerifiedTests.length,
        reportableCount: renderedOrderTestsWithSections.length,
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
      } catch (error) {
        const allowFallback = process.env.REPORTS_PDF_FALLBACK !== 'false';
        if (!allowFallback) {
          throw error;
        }
        this.logger.warn(
          `Playwright PDF rendering failed; using fallback renderer for order ${orderForRender.id}.`,
        );
        const fallbackStartMs = Date.now();
        const fallbackPdf = await this.renderTestResultsFallbackPDF({
          order: orderForRender,
          orderTests: renderedOrderTestsWithSections,
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
      const performance = buildPerformance(false, false);
      this.logResultsPdfPerformance(performance);
      return {
        pdf: Buffer.from(pdf),
        performance,
      };
    }

    const cachedPdf = this.getCachedPdf(cacheKey);
    if (cachedPdf) {
      const performance = buildPerformance(true, false);
      this.logResultsPdfPerformance(performance);
      return {
        pdf: cachedPdf,
        performance,
      };
    }

    const existingInFlight = this.pdfInFlight.get(cacheKey);
    if (existingInFlight) {
      const pdf = await existingInFlight;
      const performance = buildPerformance(false, true);
      this.logResultsPdfPerformance(performance);
      return {
        pdf: Buffer.from(pdf),
        performance,
      };
    }

    const generatePromise = generatePdf();

    this.pdfInFlight.set(cacheKey, generatePromise);
    try {
      const pdf = await generatePromise;
      this.setCachedPdf(cacheKey, pdf);
      const performance = buildPerformance(false, false);
      this.logResultsPdfPerformance(performance);
      return {
        pdf: Buffer.from(pdf),
        performance,
      };
    } finally {
      this.pdfInFlight.delete(cacheKey);
    }
  }

  private async renderTestResultsFallbackPDF(input: {
    order: Order;
    orderTests: OrderTest[];
    verifiers: string[];
    latestVerifiedAt: Date | null;
    comments: string[];
  }): Promise<Buffer> {
    const { order, orderTests, verifiers, latestVerifiedAt, comments } = input;
    const patient = order.patient;
    const patientAgeForRanges = getPatientAgeSnapshot(
      patient?.dateOfBirth ?? null,
      order.registeredAt,
    );
    const patientAgeDisplay = formatPatientAgeDisplay(
      patient?.dateOfBirth ?? null,
      order.registeredAt,
    );
    const labBranding = order.lab as unknown as {
      reportBannerDataUrl?: string | null;
      reportFooterDataUrl?: string | null;
      reportLogoDataUrl?: string | null;
      reportWatermarkDataUrl?: string | null;
    };
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
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const applyPageBranding = () =>
        this.applyFallbackPageBranding(doc, { watermarkImage, footerImage });
      doc.on('pageAdded', applyPageBranding);
      applyPageBranding();

      if (bannerImage) {
        const marginLeft = doc.page.margins.left;
        const marginRight = doc.page.margins.right;
        const maxWidth = doc.page.width - marginLeft - marginRight;
        const bannerTop = doc.page.margins.top;
        try {
          const openedBanner = doc.openImage(bannerImage);
          const bannerHeight = Math.max(
            24,
            Math.round((openedBanner.height / openedBanner.width) * maxWidth),
          );
          doc.image(openedBanner, marginLeft, bannerTop, { width: maxWidth });
          doc.y = bannerTop + bannerHeight + 8;
        } catch {
          drawHeaderBar(doc, {
            title: 'Laboratory Test Results',
            labName: order.lab?.name || 'Laboratory',
            subtitle: order.orderNumber || order.id.substring(0, 8),
            logoImage,
          });
        }
      } else {
        drawHeaderBar(doc, {
          title: 'Laboratory Test Results',
          labName: order.lab?.name || 'Laboratory',
          subtitle: order.orderNumber || order.id.substring(0, 8),
          logoImage,
        });
      }

      drawTwoColumnInfo(
        doc,
        [
          ['Patient Name', patient?.fullName || '-'],
          ['Patient ID', patient?.patientNumber || '-'],
          ['Age', patientAgeDisplay || '-'],
          ['Sex', patient?.sex || '-'],
        ],
        [
          ['Order Number', order.orderNumber || order.id.substring(0, 8)],
          ['Collected At', formatDateTime(order.registeredAt)],
          ['Verified At', formatDateTime(latestVerifiedAt)],
          ['Verified By', verifiers.join(', ') || '-'],
        ],
      );

      const { regularTests, panelParents, panelChildrenByParent } =
        this.classifyOrderTestsForReport(orderTests);
      const cultureRegularTests = regularTests.filter((ot) =>
        isCultureSensitivityOrderTest(ot),
      );
      const nonCultureRegularTests = regularTests.filter(
        (ot) => !isCultureSensitivityOrderTest(ot),
      );

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
        doc.text(
          'Reference',
          leftX + widths.test + widths.result + widths.unit,
          doc.y,
          { width: widths.range },
        );
        doc.moveDown(0.6);
        doc
          .strokeColor('#CBD5E1')
          .lineWidth(1)
          .moveTo(leftX, doc.y)
          .lineTo(leftX + tableWidth, doc.y)
          .stroke();
        doc.moveDown(0.5);
      };

      const drawResultRow = (row: {
        testLabel: string;
        result: string;
        unit: string;
        reference: string;
        extraParams?: string[];
      }) => {
        const extraParams = row.extraParams ?? [];
        ensureSpace(doc, extraParams.length > 0 ? 48 : 28, drawTableHeader);
        const rowY = doc.y;

        doc.font('Helvetica').fontSize(9).fillColor('#111827');
        doc.text(row.testLabel, leftX, rowY, { width: widths.test });
        doc.text(row.result, leftX + widths.test, rowY, { width: widths.result });
        doc.text(row.unit, leftX + widths.test + widths.result, rowY, { width: widths.unit });
        doc.text(
          row.reference,
          leftX + widths.test + widths.result + widths.unit,
          rowY,
          { width: widths.range },
        );

        let bottomY = Math.max(
          doc.y,
          doc.heightOfString(row.testLabel, { width: widths.test }) + rowY,
          doc.heightOfString(row.result, { width: widths.result }) + rowY,
          doc.heightOfString(row.reference, { width: widths.range }) + rowY,
        );

        if (extraParams.length > 0) {
          const paramText = extraParams.slice(0, 6).join(' | ');
          doc
            .font('Helvetica-Oblique')
            .fontSize(8)
            .fillColor('#475569')
            .text(
              paramText,
              leftX + 8,
              bottomY + 2,
              { width: tableWidth - 16 },
            );
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

      const drawOrderTestRow = (ot: OrderTest) => {
        const t = ot.test as Test | undefined;
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
      const drawCultureColumns = (columns: CultureAstColumns) => {
        const columnDefs: Array<{
          title: string;
          values: string[];
          backgroundColor: string;
          borderColor: string;
        }> = [
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
        const cultureColumnWidth =
          (tableWidth - cultureColumnGap * (columnDefs.length - 1)) /
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

      const drawCultureSectionTitle = (testName: string) => {
        ensureSpace(doc, 24);
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(testName);
        doc.moveDown(0.25);
      };

      const drawCultureMessage = (message: string) => {
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

      const drawCultureNotes = (notes: string) => {
        if (!notes) return;
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
        const test = ot.test as (Test & { name?: string; code?: string }) | undefined;
        const testName = test?.name || test?.code || 'Culture & Sensitivity';
        const cultureResult =
          ot.cultureResult && typeof ot.cultureResult === 'object'
            ? (ot.cultureResult as {
              noGrowth?: unknown;
              noGrowthResult?: unknown;
              notes?: unknown;
              isolates?: unknown;
            })
            : null;
        const noGrowth = cultureResult?.noGrowth === true;
        const noGrowthResult =
          typeof cultureResult?.noGrowthResult === 'string' &&
            cultureResult.noGrowthResult.trim().length > 0
            ? cultureResult.noGrowthResult.trim()
            : 'No growth';
        const notes =
          typeof cultureResult?.notes === 'string' && cultureResult.notes.trim().length > 0
            ? cultureResult.notes.trim()
            : '';
        const isolates = Array.isArray(cultureResult?.isolates)
          ? cultureResult.isolates
          : [];

        if (!noGrowth && isolates.length === 0) {
          const shouldStartNewPage =
            nonCultureRegularTests.length > 0 || renderedCulturePageCount > 0;
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
          const shouldStartNewPage =
            nonCultureRegularTests.length > 0 || renderedCulturePageCount > 0;
          if (shouldStartNewPage) {
            doc.addPage();
          }
          const isolateObj =
            isolate && typeof isolate === 'object'
              ? (isolate as {
                organism?: unknown;
                source?: unknown;
                condition?: unknown;
                colonyCount?: unknown;
                comment?: unknown;
              })
              : {};
          const organism =
            String(isolateObj.organism ?? '').trim() || `Isolate ${isolateIndex + 1}`;
          const isolateSource =
            typeof isolateObj.source === 'string' && isolateObj.source.trim().length > 0
              ? isolateObj.source.trim()
              : '';
          const isolateCondition =
            typeof isolateObj.condition === 'string' &&
              isolateObj.condition.trim().length > 0
              ? isolateObj.condition.trim()
              : '';
          const isolateColonyCount =
            typeof isolateObj.colonyCount === 'string' &&
              isolateObj.colonyCount.trim().length > 0
              ? isolateObj.colonyCount.trim()
              : '';
          const isolateComment =
            typeof isolateObj.comment === 'string' && isolateObj.comment.trim().length > 0
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
        const shouldStartNewPage =
          nonCultureRegularTests.length > 0 || renderedCulturePageCount > 0 || panelIndex > 0;
        if (shouldStartNewPage) {
          doc.addPage();
        }

        ensureSpace(doc, 36);
        const panelTest = panelParent.test as (Test & {
          parameterDefinitions?: Array<{ code?: string; label?: string; normalOptions?: string[] }>;
        }) | undefined;
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
          const renderedCodes = new Set<string>();

          for (const def of parameterDefinitions) {
            const code = (def?.code ?? '').trim();
            if (code) renderedCodes.add(code);
            const rawValue = code ? panelResultParams[code] : undefined;
            const normalizedValue =
              rawValue != null && String(rawValue).trim() ? String(rawValue).trim() : '-';
            const reference =
              Array.isArray(def?.normalOptions) && def.normalOptions.length > 0
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
            if (renderedCodes.has(code)) continue;
            drawResultRow({
              testLabel: code,
              result: value != null && String(value).trim() ? String(value).trim() : '-',
              unit: '-',
              reference: '-',
            });
          }
        } else if (panelChildren.length > 0) {
          for (const child of panelChildren) {
            drawOrderTestRow(child);
          }
        } else {
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
}
