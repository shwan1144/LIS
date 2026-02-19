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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const fs_1 = require("fs");
const path_1 = require("path");
const PDFDocument = require('pdfkit');
const order_entity_1 = require("../entities/order.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const patient_entity_1 = require("../entities/patient.entity");
const lab_entity_1 = require("../entities/lab.entity");
const user_entity_1 = require("../entities/user.entity");
const test_entity_1 = require("../entities/test.entity");
const results_report_template_1 = require("./html/results-report.template");
function formatDateTime(value) {
    if (!value)
        return '-';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return '-';
    return d.toLocaleString();
}
function computeAgeYears(dateOfBirth) {
    if (!dateOfBirth)
        return null;
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime()))
        return null;
    return Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}
function getNormalRange(test, sex) {
    const sexNorm = (sex || '').toUpperCase();
    let min = test.normalMin;
    let max = test.normalMax;
    if (sexNorm === 'M') {
        if (test.normalMinMale !== null)
            min = test.normalMinMale;
        if (test.normalMaxMale !== null)
            max = test.normalMaxMale;
    }
    else if (sexNorm === 'F') {
        if (test.normalMinFemale !== null)
            min = test.normalMinFemale;
        if (test.normalMaxFemale !== null)
            max = test.normalMaxFemale;
    }
    if (test.normalText?.trim())
        return test.normalText.trim();
    if (min != null && max != null)
        return `${min}-${max}`;
    if (min != null)
        return `>= ${min}`;
    if (max != null)
        return `<= ${max}`;
    return '-';
}
function formatResultValue(ot) {
    if (ot.resultValue !== null && ot.resultValue !== undefined)
        return String(ot.resultValue);
    if (ot.resultText?.trim())
        return ot.resultText.trim();
    return 'Pending';
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
let ReportsService = class ReportsService {
    constructor(orderRepo, orderTestRepo, patientRepo, labRepo, userRepo) {
        this.orderRepo = orderRepo;
        this.orderTestRepo = orderTestRepo;
        this.patientRepo = patientRepo;
        this.labRepo = labRepo;
        this.userRepo = userRepo;
        this.browserPromise = null;
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
        }
        finally {
            await page.close().catch(() => { });
        }
    }
    async onModuleDestroy() {
        if (!this.browserPromise)
            return;
        try {
            const browser = await this.browserPromise;
            await browser.close();
        }
        catch {
        }
        finally {
            this.browserPromise = null;
        }
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
            doc.text(`Name: ${patientName}`, { align: 'left' });
            if (order.patient.dateOfBirth) {
                const age = Math.floor((Date.now() - new Date(order.patient.dateOfBirth).getTime()) /
                    (365.25 * 24 * 60 * 60 * 1000));
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
                doc.text(test.price !== null ? `$${parseFloat(test.price.toString()).toFixed(2)}` : '-', startX + testWidth, yPos, { width: priceWidth, align: 'right' });
                yPos += 15;
            });
            doc.moveDown(1);
            doc.font('Helvetica');
            doc.text(`Subtotal: $${parseFloat(order.totalAmount.toString()).toFixed(2)}`, {
                align: 'right',
            });
            if (order.discountPercent != null && Number(order.discountPercent) > 0) {
                const discountAmount = parseFloat(order.totalAmount.toString()) -
                    parseFloat((order.finalAmount ?? order.totalAmount).toString());
                doc.text(`Discount (${order.discountPercent}%): -$${discountAmount.toFixed(2)}`, {
                    align: 'right',
                });
            }
            doc.fontSize(12).font('Helvetica-Bold');
            const finalAmount = order.finalAmount != null
                ? parseFloat(order.finalAmount.toString())
                : parseFloat(order.totalAmount.toString());
            doc.text(`TOTAL: $${finalAmount.toFixed(2)}`, { align: 'right' });
            doc.moveDown(1);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Samples: ${order.samples.length} sample(s)`, { align: 'left' });
            order.samples.forEach((sample) => {
                doc.text(`  - ${sample.tubeType?.replace('_', ' ') || 'Unknown'} tube${sample.sampleId ? ` (${sample.sampleId})` : ''}`, { align: 'left' });
            });
            doc.moveDown(1);
            doc.fontSize(8).font('Helvetica');
            doc.text('Thank you for choosing our laboratory', { align: 'center' });
            doc.text(`Printed: ${new Date().toLocaleString()}`, { align: 'center' });
            doc.end();
        });
    }
    async generateTestResultsPDF(orderId, labId) {
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
            throw new common_1.NotFoundException('Order not found');
        }
        if (order.paymentStatus !== 'paid') {
            throw new common_1.ForbiddenException('Order is unpaid or partially paid. Complete payment to download or print results.');
        }
        const sampleIds = order.samples?.map((s) => s.id) ?? [];
        const orderTests = sampleIds.length === 0
            ? []
            : await this.orderTestRepo.find({
                where: { sampleId: (0, typeorm_2.In)(sampleIds) },
                relations: ['test', 'sample'],
                order: { test: { code: 'ASC' } },
            });
        const reportableOrderTests = orderTests.filter((ot) => {
            const t = ot.test;
            if (!t)
                return false;
            if (t.type === test_entity_1.TestType.PANEL) {
                if (ot.parentOrderTestId)
                    return true;
                const hasParams = Array.isArray(t.parameterDefinitions) && t.parameterDefinitions.length > 0;
                if (hasParams)
                    return true;
                return false;
            }
            return true;
        });
        const verifierIds = [
            ...new Set(reportableOrderTests
                .map((ot) => ot.verifiedBy)
                .filter((id) => Boolean(id))),
        ];
        const verifiers = verifierIds.length === 0
            ? []
            : await this.userRepo.find({
                where: verifierIds.map((id) => ({ id })),
            });
        const verifierNameMap = new Map(verifiers.map((u) => [u.id, u.fullName || u.username || u.id.substring(0, 8)]));
        const verifiedTests = reportableOrderTests.filter((ot) => ot.status === 'VERIFIED' || !!ot.verifiedAt);
        const latestVerifiedAt = verifiedTests
            .map((ot) => (ot.verifiedAt ? new Date(ot.verifiedAt) : null))
            .filter((d) => d !== null)
            .sort((a, b) => b.getTime() - a.getTime())[0];
        const verifierNames = [
            ...new Set(verifiedTests
                .map((ot) => (ot.verifiedBy ? verifierNameMap.get(ot.verifiedBy) || ot.verifiedBy : null))
                .filter((name) => Boolean(name))),
        ];
        const comments = [
            ...new Set(reportableOrderTests
                .map((ot) => ot.comments?.trim())
                .filter((value) => Boolean(value))),
        ];
        let defaultLogoBase64;
        const logoPath = (0, path_1.join)(__dirname, 'logo.png');
        if ((0, fs_1.existsSync)(logoPath)) {
            try {
                const buf = (0, fs_1.readFileSync)(logoPath);
                defaultLogoBase64 = `data:image/png;base64,${buf.toString('base64')}`;
            }
            catch {
            }
        }
        const html = (0, results_report_template_1.buildResultsReportHtml)({
            order,
            orderTests: reportableOrderTests,
            verifiedCount: verifiedTests.length,
            reportableCount: reportableOrderTests.length,
            verifiers: verifierNames,
            latestVerifiedAt: latestVerifiedAt ?? null,
            comments,
            defaultLogoBase64,
        });
        try {
            return await this.renderPdfFromHtml(html);
        }
        catch (error) {
            console.error('Playwright PDF rendering failed; falling back to PDFKit renderer.', error);
            return this.renderTestResultsFallbackPDF({
                order,
                orderTests: reportableOrderTests,
                verifiers: verifierNames,
                latestVerifiedAt: latestVerifiedAt ?? null,
                comments,
            });
        }
    }
    async renderTestResultsFallbackPDF(input) {
        const { order, orderTests, verifiers, latestVerifiedAt, comments } = input;
        const patient = order.patient;
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 32 });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            drawHeaderBar(doc, {
                title: 'Laboratory Test Results',
                labName: order.lab?.name || 'Laboratory',
                subtitle: order.orderNumber || order.id.substring(0, 8),
            });
            drawTwoColumnInfo(doc, [
                ['Patient Name', patient?.fullName || '-'],
                ['Patient ID', patient?.patientNumber || '-'],
                ['Age', computeAgeYears(patient?.dateOfBirth ?? null)?.toString() || '-'],
                ['Sex', patient?.sex || '-'],
            ], [
                ['Order Number', order.orderNumber || order.id.substring(0, 8)],
                ['Collected At', formatDateTime(order.registeredAt)],
                ['Verified At', formatDateTime(latestVerifiedAt)],
                ['Verified By', verifiers.join(', ') || '-'],
            ]);
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
            drawTableHeader();
            doc.font('Helvetica').fontSize(9).fillColor('#111827');
            for (const ot of orderTests) {
                const t = ot.test;
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
                doc.text(reference, leftX + widths.test + widths.result + widths.unit, rowY, { width: widths.range });
                let bottomY = Math.max(doc.y, doc.heightOfString(`${testName}${testCode}`, { width: widths.test }) + rowY, doc.heightOfString(result, { width: widths.result }) + rowY, doc.heightOfString(reference, { width: widths.range }) + rowY);
                if (params.length > 0) {
                    const paramText = params.slice(0, 6).join(' | ');
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
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(2, (0, typeorm_1.InjectRepository)(patient_entity_1.Patient)),
    __param(3, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(4, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ReportsService);
//# sourceMappingURL=reports.service.js.map