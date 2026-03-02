import { Injectable, NotFoundException, ForbiddenException, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
// require() for CommonJS interop (pdfkit has no default export in some builds)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');
import { Order } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { User } from '../entities/user.entity';
import { AuditAction, AuditLog } from '../entities/audit-log.entity';
import { TestType, type Test } from '../entities/test.entity';
import { buildResultsReportHtml } from './html/results-report.template';
import type { Browser } from 'playwright';
import { resolveNumericRange } from '../tests/normal-range.util';

type PdfKitDocument = InstanceType<typeof PDFDocument>;
const REPORT_BANNER_WIDTH = 2480;
const REPORT_BANNER_HEIGHT = 220;

export interface PublicResultTestItem {
  orderTestId: string;
  testCode: string;
  testName: string;
  departmentName: string;
  status: string;
  isVerified: boolean;
  hasResult: boolean;
  resultValue: string | null;
  unit: string | null;
  verifiedAt: string | null;
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

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function computeAgeYears(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  return Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function getNormalRange(
  test: Test,
  sex: string | null,
  ageYears: number | null,
): string {
  const { normalMin: min, normalMax: max } = resolveNumericRange(
    test,
    sex,
    ageYears,
  );
  if (test.normalText?.trim()) return test.normalText.trim();
  if (min != null && max != null) return `${min}-${max}`;
  if (min != null) return `>= ${min}`;
  if (max != null) return `<= ${max}`;
  return '-';
}

function formatResultValue(ot: OrderTest): string {
  if (ot.resultValue !== null && ot.resultValue !== undefined) return String(ot.resultValue);
  if (ot.resultText?.trim()) return ot.resultText.trim();
  return 'Pending';
}

function formatResultParameters(params: Record<string, string> | null): string[] {
  if (!params) return [];
  return Object.entries(params)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${String(v).trim()}`);
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

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private browserPromise: Promise<Browser> | null = null;
  private readonly pdfCache = new Map<string, { buffer: Buffer; expiresAt: number; lastAccessedAt: number }>();
  private readonly pdfInFlight = new Map<string, Promise<Buffer>>();
  private readonly pdfCacheTtlMs = this.parseEnvInt('REPORTS_PDF_CACHE_TTL_MS', 120_000, 0, 900_000);
  private readonly pdfCacheMaxEntries = this.parseEnvInt('REPORTS_PDF_CACHE_MAX_ENTRIES', 30, 1, 1000);
  private readonly pdfPerfLogThresholdMs = this.parseEnvInt(
    'REPORTS_PDF_PERF_LOG_THRESHOLD_MS',
    500,
    0,
    60_000,
  );

  // ── Static in-memory caches for files that never change at runtime ──
  private static cachedLogo: { path: string; base64: string } | null = null;
  private static cachedFont: { path: string; base64: string } | null = null;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
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
    const page = await browser.newPage({
      viewport: { width: 1240, height: 1754 },
    });
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
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

    const rawKey = [
      input.labId,
      input.order.id,
      input.order.paymentStatus,
      input.order.updatedAt ? new Date(input.order.updatedAt).toISOString() : '-',
      input.order.lab?.updatedAt ? new Date(input.order.lab.updatedAt).toISOString() : '-',
      input.latestVerifiedAt ? new Date(input.latestVerifiedAt).toISOString() : '-',
      input.bypassPaymentCheck ? 'bypass' : 'strict',
      String(input.reportableOrderTests.length),
      reportableFingerprint,
    ].join('::');

    return createHash('sha1').update(rawKey).digest('hex');
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

  private logResultsPdfPerformance(input: {
    orderId: string;
    labId: string;
    totalMs: number;
    snapshotMs: number;
    verifierLookupMs?: number;
    assetsMs?: number;
    htmlMs?: number;
    renderMs?: number;
    fallbackMs?: number;
    cacheHit: boolean;
    inFlightJoin: boolean;
  }): void {
    if (input.totalMs < this.pdfPerfLogThresholdMs) return;
    this.logger.log(
      JSON.stringify({
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
      (ot) => ot.status === 'VERIFIED' || !!ot.verifiedAt,
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
        const resultValue =
          ot.resultValue !== null && ot.resultValue !== undefined
            ? String(ot.resultValue)
            : ot.resultText?.trim() || null;
        return {
          orderTestId: ot.id,
          testCode: test?.code || '-',
          testName: test?.name || 'Unknown test',
          departmentName,
          status: ot.status,
          isVerified: ot.status === 'VERIFIED' || !!ot.verifiedAt,
          hasResult: resultValue !== null,
          resultValue,
          unit: test?.unit || null,
          verifiedAt: ot.verifiedAt ? ot.verifiedAt.toISOString() : null,
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
      doc.text(`Name: ${patientName}`, { align: 'left' });
      if (order.patient.dateOfBirth) {
        const age = Math.floor(
          (Date.now() - new Date(order.patient.dateOfBirth).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
        );
        doc.text(`Age: ${age} years`, { align: 'left' });
      }
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
    options?: { bypassPaymentCheck?: boolean },
  ): Promise<Buffer> {
    const startMs = Date.now();
    const snapshotStartMs = Date.now();
    const { order, reportableOrderTests, verifiedTests, latestVerifiedAt } =
      await this.loadOrderResultsSnapshot(orderId, labId);
    const snapshotMs = Date.now() - snapshotStartMs;
    const bypassPaymentCheck = !!options?.bypassPaymentCheck;

    if (!bypassPaymentCheck && order.paymentStatus !== 'paid') {
      throw new ForbiddenException(
        'Order is unpaid or partially paid. Complete payment to download or print results.',
      );
    }

    const cacheKey = this.buildReportPdfCacheKey({
      labId,
      order,
      reportableOrderTests,
      latestVerifiedAt,
      bypassPaymentCheck,
    });
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

    let verifierLookupMs = 0;
    let assetsMs = 0;
    let htmlMs = 0;
    let renderMs = 0;
    let fallbackMs = 0;

    const generatePromise = (async () => {
      const verifierLookupStartMs = Date.now();
      const verifierIds = [
        ...new Set(
          reportableOrderTests
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
          verifiedTests
            .map((ot) => (ot.verifiedBy ? verifierNameMap.get(ot.verifiedBy) || ot.verifiedBy : null))
            .filter((name): name is string => Boolean(name)),
        ),
      ];
      const comments = [
        ...new Set(
          reportableOrderTests
            .map((ot) => ot.comments?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ];

      // Optimization: logo and font files are immutable at runtime - serve
      // from in-memory cache after the first read to avoid repeated disk I/O.
      const assetsStartMs = Date.now();
      let defaultLogoBase64: string | undefined;
      const logoPath = resolveReadablePath([
        join(__dirname, 'logo.png'),
        join(process.cwd(), 'dist', 'src', 'reports', 'logo.png'),
        join(process.cwd(), 'src', 'reports', 'logo.png'),
      ]);
      if (logoPath) {
        try {
          if (!ReportsService.cachedLogo || ReportsService.cachedLogo.path !== logoPath) {
            const buf = readFileSync(logoPath);
            ReportsService.cachedLogo = { path: logoPath, base64: `data:image/png;base64,${buf.toString('base64')}` };
          }
          defaultLogoBase64 = ReportsService.cachedLogo.base64;
        } catch {
          // ignore
        }
      }

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

      const htmlStartMs = Date.now();
      const html = buildResultsReportHtml({
        order,
        orderTests: reportableOrderTests,
        verifiedCount: verifiedTests.length,
        reportableCount: reportableOrderTests.length,
        verifiers: verifierNames,
        latestVerifiedAt: latestVerifiedAt ?? null,
        comments,
        defaultLogoBase64,
        kurdishFontBase64,
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
          `Playwright PDF rendering failed; using fallback renderer for order ${order.id}.`,
        );
        const fallbackStartMs = Date.now();
        const fallbackPdf = await this.renderTestResultsFallbackPDF({
          order,
          orderTests: reportableOrderTests,
          verifiers: verifierNames,
          latestVerifiedAt: latestVerifiedAt ?? null,
          comments,
        });
        fallbackMs = Date.now() - fallbackStartMs;
        return fallbackPdf;
      }
    })();

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
    const patientAgeYears = computeAgeYears(patient?.dateOfBirth ?? null);
    const labBranding = order.lab as unknown as {
      reportBannerDataUrl?: string | null;
      reportFooterDataUrl?: string | null;
      reportLogoDataUrl?: string | null;
      reportWatermarkDataUrl?: string | null;
    };
    const bannerImage = this.decodeImageDataUrl(labBranding?.reportBannerDataUrl);
    const footerImage = this.decodeImageDataUrl(labBranding?.reportFooterDataUrl);
    const logoImage = this.decodeImageDataUrl(labBranding?.reportLogoDataUrl);
    const watermarkImage =
      this.decodeImageDataUrl(labBranding?.reportWatermarkDataUrl) || logoImage;

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
          ['Age', patientAgeYears?.toString() || '-'],
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

      const leftX = doc.page.margins.left;
      const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const widths = {
        test: Math.round(usableWidth * 0.42),
        result: Math.round(usableWidth * 0.20),
        unit: Math.round(usableWidth * 0.14),
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
          reference: t ? getNormalRange(t, patient?.sex ?? null, patientAgeYears) : '-',
          extraParams: formatResultParameters(ot.resultParameters),
        });
      };

      if (regularTests.length > 0) {
        drawTableHeader();
        for (const ot of regularTests) {
          drawOrderTestRow(ot);
        }
      }

      for (let panelIndex = 0; panelIndex < panelParents.length; panelIndex++) {
        const panelParent = panelParents[panelIndex];
        const shouldStartNewPage = regularTests.length > 0 || panelIndex > 0;
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
