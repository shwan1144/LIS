import { Injectable, NotFoundException, ForbiddenException, type OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
// require() for CommonJS interop (pdfkit has no default export in some builds)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');
import { Order } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { User } from '../entities/user.entity';
import { TestType, type Test } from '../entities/test.entity';
import { buildResultsReportHtml } from './html/results-report.template';
import type { Browser } from 'playwright';

type PdfKitDocument = InstanceType<typeof PDFDocument>;

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

function getNormalRange(test: Test, sex: string | null): string {
  const sexNorm = (sex || '').toUpperCase();
  let min = test.normalMin;
  let max = test.normalMax;
  if (sexNorm === 'M') {
    if (test.normalMinMale !== null) min = test.normalMinMale;
    if (test.normalMaxMale !== null) max = test.normalMaxMale;
  } else if (sexNorm === 'F') {
    if (test.normalMinFemale !== null) min = test.normalMinFemale;
    if (test.normalMaxFemale !== null) max = test.normalMaxFemale;
  }

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

function drawHeaderBar(doc: PdfKitDocument, opts: { title: string; labName: string; subtitle?: string }) {
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
export class ReportsService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

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
  ) {}

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
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        preferCSSPageSize: true,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch {
      // ignore
    } finally {
      this.browserPromise = null;
    }
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
          test.price !== null ? `$${parseFloat(test.price.toString()).toFixed(2)}` : '-',
          startX + testWidth,
          yPos,
          { width: priceWidth, align: 'right' },
        );
        yPos += 15;
      });

      doc.moveDown(1);

      // Totals
      doc.font('Helvetica');
      doc.text(`Subtotal: $${parseFloat(order.totalAmount.toString()).toFixed(2)}`, {
        align: 'right',
      });
      if (order.discountPercent != null && Number(order.discountPercent) > 0) {
        const discountAmount =
          parseFloat(order.totalAmount.toString()) -
          parseFloat((order.finalAmount ?? order.totalAmount).toString());
        doc.text(`Discount (${order.discountPercent}%): -$${discountAmount.toFixed(2)}`, {
          align: 'right',
        });
      }
      doc.fontSize(12).font('Helvetica-Bold');
      const finalAmount =
        order.finalAmount != null
          ? parseFloat(order.finalAmount.toString())
          : parseFloat(order.totalAmount.toString());
      doc.text(`TOTAL: $${finalAmount.toFixed(2)}`, { align: 'right' });
      doc.moveDown(1);

      // Samples
      doc.fontSize(10).font('Helvetica');
      doc.text(`Samples: ${order.samples.length} sample(s)`, { align: 'left' });
      order.samples.forEach((sample) => {
        doc.text(
          `  - ${sample.tubeType?.replace('_', ' ') || 'Unknown'} tube${
            sample.sampleId ? ` (${sample.sampleId})` : ''
          }`,
          { align: 'left' },
        );
      });

      doc.moveDown(1);

      // Footer
      doc.fontSize(8).font('Helvetica');
      doc.text('Thank you for choosing our laboratory', { align: 'center' });
      doc.text(`Printed: ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();
    });
  }

  async generateTestResultsPDF(orderId: string, labId: string): Promise<Buffer> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, labId },
      relations: [
        'patient',
        'lab',
        'shift',
        'samples',
        'samples.orderTests',
        'samples.orderTests.test',
        'samples.orderTests.test.department',
      ],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== 'paid') {
      throw new ForbiddenException(
        'Order is unpaid or partially paid. Complete payment to download or print results.',
      );
    }

    const sampleIds = order.samples?.map((s) => s.id) ?? [];
    const orderTests =
      sampleIds.length === 0
        ? []
        : await this.orderTestRepo.find({
            where: { sampleId: In(sampleIds) },
            relations: ['test', 'sample'],
            order: { test: { code: 'ASC' } },
          });

    const reportableOrderTests = orderTests.filter((ot) => {
      const t = ot.test as Test | undefined;
      if (!t) return false;
      if (t.type === TestType.PANEL) {
        if (ot.parentOrderTestId) return true;
        const hasParams =
          Array.isArray(t.parameterDefinitions) && t.parameterDefinitions.length > 0;
        if (hasParams) return true;
        return false;
      }
      return true;
    });

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
    const verifierNameMap = new Map(
      verifiers.map((u) => [u.id, u.fullName || u.username || u.id.substring(0, 8)]),
    );

    const verifiedTests = reportableOrderTests.filter(
      (ot) => ot.status === 'VERIFIED' || !!ot.verifiedAt,
    );
    const latestVerifiedAt = verifiedTests
      .map((ot) => (ot.verifiedAt ? new Date(ot.verifiedAt) : null))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
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

    let defaultLogoBase64: string | undefined;
    const logoPath = resolveReadablePath([
      join(__dirname, 'logo.png'),
      join(process.cwd(), 'dist', 'src', 'reports', 'logo.png'),
      join(process.cwd(), 'src', 'reports', 'logo.png'),
    ]);
    if (logoPath) {
      try {
        const buf = readFileSync(logoPath);
        defaultLogoBase64 = `data:image/png;base64,${buf.toString('base64')}`;
      } catch {
        // ignore
      }
    }

    let kurdishFontBase64: string | undefined;
    const kurdishFontPath = resolveReadablePath([
      join(__dirname, 'fonts', 'NotoNaskhArabic-Regular.ttf'),
      join(
        process.cwd(),
        'dist',
        'src',
        'reports',
        'fonts',
        'NotoNaskhArabic-Regular.ttf',
      ),
      join(
        process.cwd(),
        'src',
        'reports',
        'fonts',
        'NotoNaskhArabic-Regular.ttf',
      ),
    ]);
    if (kurdishFontPath) {
      try {
        const fontBuf = readFileSync(kurdishFontPath);
        kurdishFontBase64 = `data:font/ttf;base64,${fontBuf.toString('base64')}`;
      } catch {
        // ignore
      }
    }

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

    try {
      return await this.renderPdfFromHtml(html);
    } catch (error) {
      const allowFallback = process.env.REPORTS_PDF_FALLBACK !== 'false';
      if (!allowFallback) {
        throw error;
      }
      console.error(
        'Playwright PDF rendering failed; falling back to PDFKit renderer.',
        error,
      );
      return this.renderTestResultsFallbackPDF({
        order,
        orderTests: reportableOrderTests,
        verifiers: verifierNames,
        latestVerifiedAt: latestVerifiedAt ?? null,
        comments,
      });
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

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 32 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeaderBar(doc, {
        title: 'Laboratory Test Results',
        labName: order.lab?.name || 'Laboratory',
        subtitle: order.orderNumber || order.id.substring(0, 8),
      });

      drawTwoColumnInfo(
        doc,
        [
          ['Patient Name', patient?.fullName || '-'],
          ['Patient ID', patient?.patientNumber || '-'],
          ['Age', computeAgeYears(patient?.dateOfBirth ?? null)?.toString() || '-'],
          ['Sex', patient?.sex || '-'],
        ],
        [
          ['Order Number', order.orderNumber || order.id.substring(0, 8)],
          ['Collected At', formatDateTime(order.registeredAt)],
          ['Verified At', formatDateTime(latestVerifiedAt)],
          ['Verified By', verifiers.join(', ') || '-'],
        ],
      );

      const leftX = doc.page.margins.left;
      const widths = {
        test: 210,
        result: 120,
        unit: 60,
        range: 110,
      };
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

      drawTableHeader();

      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      for (const ot of orderTests) {
        const t = ot.test as Test | undefined;
        const testName = t?.name || 'Unknown test';
        const testCode = t?.code ? ` (${t.code})` : '';
        const result = formatResultValue(ot);
        const unit = t?.unit || '-';
        const reference = t ? getNormalRange(t, patient?.sex ?? null) : '-';
        const params = formatResultParameters(ot.resultParameters);

        ensureSpace(doc, params.length > 0 ? 48 : 28, drawTableHeader);
        const rowY = doc.y;

        doc.text(`${testName}${testCode}`, leftX, rowY, { width: widths.test });
        doc.text(result, leftX + widths.test, rowY, { width: widths.result });
        doc.text(unit, leftX + widths.test + widths.result, rowY, { width: widths.unit });
        doc.text(
          reference,
          leftX + widths.test + widths.result + widths.unit,
          rowY,
          { width: widths.range },
        );

        let bottomY = Math.max(
          doc.y,
          doc.heightOfString(`${testName}${testCode}`, { width: widths.test }) + rowY,
          doc.heightOfString(result, { width: widths.result }) + rowY,
          doc.heightOfString(reference, { width: widths.range }) + rowY,
        );

        if (params.length > 0) {
          const paramText = params.slice(0, 6).join(' | ');
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
