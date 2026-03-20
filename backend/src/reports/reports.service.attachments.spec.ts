import { NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { ReportsService } from './reports.service';
import { OrderTestStatus } from '../entities/order-test.entity';
import { TestType } from '../entities/test.entity';

describe('ReportsService uploaded result PDF attachments', () => {
  function createResultDocumentsMock() {
    return {
      readDocument: jest.fn(),
    };
  }

  function createService(
    resultDocumentsService = createResultDocumentsMock(),
  ): { service: ReportsService; resultDocumentsService: ReturnType<typeof createResultDocumentsMock> } {
    const service = new ReportsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      resultDocumentsService as any,
      { isConfigured: jest.fn().mockReturnValue(false) } as any,
    );

    return { service, resultDocumentsService };
  }

  function buildOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      labId: 'lab-1',
      orderNumber: '260320001',
      paymentStatus: 'paid',
      registeredAt: new Date('2026-03-20T08:00:00.000Z'),
      patient: {
        id: 'patient-1',
        fullName: 'Patient One',
        patientNumber: 'P-000001',
        sex: 'male',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      },
      lab: {
        id: 'lab-1',
        name: 'Main Lab',
        code: 'LAB01',
        reportStyle: null,
      },
      ...overrides,
    } as any;
  }

  function buildTest(overrides: Record<string, unknown> = {}) {
    return {
      code: 'TEST',
      name: 'Test Name',
      type: TestType.SINGLE,
      unit: null,
      sortOrder: 0,
      resultEntryType: 'NUMERIC',
      department: { name: 'General Department' },
      ...overrides,
    } as any;
  }

  function buildOrderTest(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ot-1',
      updatedAt: new Date('2026-03-20T08:30:00.000Z'),
      status: OrderTestStatus.VERIFIED,
      parentOrderTestId: null,
      resultValue: 5.2,
      resultText: null,
      resultParameters: null,
      cultureResult: null,
      flag: null,
      comments: null,
      verifiedAt: new Date('2026-03-20T08:40:00.000Z'),
      verifiedBy: 'user-1',
      resultDocumentStorageKey: null,
      resultDocumentFileName: null,
      resultDocumentMimeType: null,
      resultDocumentSizeBytes: null,
      test: buildTest(),
      ...overrides,
    } as any;
  }

  async function createPdf(pageSizes: Array<[number, number]>): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pageSizes.forEach(([width, height]) => {
      pdf.addPage([width, height]);
    });
    return Buffer.from(await pdf.save());
  }

  async function getPageSizes(buffer: Buffer): Promise<Array<[number, number]>> {
    const pdf = await PDFDocument.load(buffer);
    return pdf
      .getPages()
      .map((page) => [Math.round(page.getWidth()), Math.round(page.getHeight())] as [number, number]);
  }

  function mockReportGeneration(
    service: ReportsService,
    reportableOrderTests: any[],
    basePdf: Buffer,
  ): void {
    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-20T08:45:00.000Z'),
    });
    jest.spyOn(service as any, 'loadPanelSectionLookup').mockResolvedValue({
      byPanelAndChildTest: new Map(),
      fingerprint: '-',
    });
    jest
      .spyOn(service as any, 'attachPanelSectionMetadata')
      .mockImplementation((tests: unknown[]) => tests);
    jest.spyOn(service as any, 'generateOrderQrDataUrl').mockResolvedValue(null);
    jest.spyOn(service as any, 'renderPdfFromHtml').mockResolvedValue(basePdf);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('appends a single uploaded result PDF after the base report pages', async () => {
    const { service, resultDocumentsService } = createService();
    const basePdf = await createPdf([[101, 101]]);
    const uploadedPdf = await createPdf([
      [202, 202],
      [203, 203],
    ]);
    const reportableOrderTests = [
      buildOrderTest({
        id: 'ot-pdf',
        resultValue: null,
        resultDocumentStorageKey: 'doc-key-1',
        resultDocumentFileName: 'result-1.pdf',
        resultDocumentMimeType: 'application/pdf',
        resultDocumentSizeBytes: uploadedPdf.length,
        test: buildTest({
          code: 'XRAY',
          name: 'X-Ray Report',
          resultEntryType: 'PDF_UPLOAD',
        }),
      }),
    ];

    mockReportGeneration(service, reportableOrderTests, basePdf);
    resultDocumentsService.readDocument.mockResolvedValue(uploadedPdf);

    const result = await service.generateTestResultsPDFWithProfile('order-1', 'lab-1', {
      disableCache: true,
    });

    expect(await getPageSizes(result.pdf)).toEqual([
      [101, 101],
      [202, 202],
      [203, 203],
    ]);
    expect(resultDocumentsService.readDocument).toHaveBeenCalledWith('doc-key-1');
  });

  it('appends multiple uploaded result PDFs in report order', async () => {
    const { service, resultDocumentsService } = createService();
    const basePdf = await createPdf([[111, 111]]);
    const uploadedPdfA = await createPdf([[210, 210]]);
    const uploadedPdfB = await createPdf([
      [310, 310],
      [311, 311],
    ]);
    const reportableOrderTests = [
      buildOrderTest({
        id: 'ot-pdf-a',
        resultValue: null,
        resultDocumentStorageKey: 'doc-key-a',
        resultDocumentFileName: 'result-a.pdf',
        resultDocumentMimeType: 'application/pdf',
        resultDocumentSizeBytes: uploadedPdfA.length,
        test: buildTest({
          code: 'PDF-A',
          name: 'PDF Result A',
          resultEntryType: 'PDF_UPLOAD',
          sortOrder: 1,
        }),
      }),
      buildOrderTest({
        id: 'ot-numeric',
        resultValue: 4.5,
        test: buildTest({
          code: 'HB',
          name: 'Hemoglobin',
          resultEntryType: 'NUMERIC',
          sortOrder: 2,
        }),
      }),
      buildOrderTest({
        id: 'ot-pdf-b',
        resultValue: null,
        resultDocumentStorageKey: 'doc-key-b',
        resultDocumentFileName: 'result-b.pdf',
        resultDocumentMimeType: 'application/pdf',
        resultDocumentSizeBytes: uploadedPdfB.length,
        test: buildTest({
          code: 'PDF-B',
          name: 'PDF Result B',
          resultEntryType: 'PDF_UPLOAD',
          sortOrder: 3,
        }),
      }),
    ];

    mockReportGeneration(service, reportableOrderTests, basePdf);
    resultDocumentsService.readDocument.mockImplementation(async (storageKey: string) => {
      if (storageKey === 'doc-key-a') {
        return uploadedPdfA;
      }
      if (storageKey === 'doc-key-b') {
        return uploadedPdfB;
      }
      throw new Error(`Unexpected storage key: ${storageKey}`);
    });

    const result = await service.generateTestResultsPDFWithProfile('order-1', 'lab-1', {
      disableCache: true,
    });

    expect(await getPageSizes(result.pdf)).toEqual([
      [111, 111],
      [210, 210],
      [310, 310],
      [311, 311],
    ]);
    expect(resultDocumentsService.readDocument.mock.calls).toEqual([
      ['doc-key-a'],
      ['doc-key-b'],
    ]);
  });

  it('leaves the base report unchanged when there are no uploaded result PDFs', async () => {
    const { service, resultDocumentsService } = createService();
    const basePdf = await createPdf([
      [120, 120],
      [121, 121],
    ]);
    const reportableOrderTests = [
      buildOrderTest({
        id: 'ot-numeric',
        resultValue: 7.1,
        test: buildTest({
          code: 'GLU',
          name: 'Glucose',
          resultEntryType: 'NUMERIC',
        }),
      }),
    ];

    mockReportGeneration(service, reportableOrderTests, basePdf);

    const result = await service.generateTestResultsPDFWithProfile('order-1', 'lab-1', {
      disableCache: true,
    });

    expect(await getPageSizes(result.pdf)).toEqual([
      [120, 120],
      [121, 121],
    ]);
    expect(resultDocumentsService.readDocument).not.toHaveBeenCalled();
  });

  it('fails report generation when an uploaded result PDF is missing', async () => {
    const { service, resultDocumentsService } = createService();
    const basePdf = await createPdf([[130, 130]]);
    const reportableOrderTests = [
      buildOrderTest({
        id: 'ot-pdf-missing',
        resultValue: null,
        resultDocumentStorageKey: 'missing-doc',
        resultDocumentFileName: 'missing-result.pdf',
        resultDocumentMimeType: 'application/pdf',
        test: buildTest({
          code: 'PDF-MISS',
          name: 'Missing PDF Result',
          resultEntryType: 'PDF_UPLOAD',
        }),
      }),
    ];

    mockReportGeneration(service, reportableOrderTests, basePdf);
    resultDocumentsService.readDocument.mockRejectedValue(
      new NotFoundException('Result document file is missing'),
    );

    await expect(
      service.generateTestResultsPDFWithProfile('order-1', 'lab-1', {
        disableCache: true,
      }),
    ).rejects.toThrow('Uploaded result PDF "missing-result.pdf" for test PDF-MISS could not be read.');
  });

  it('fails report generation when an uploaded result PDF is invalid', async () => {
    const { service, resultDocumentsService } = createService();
    const basePdf = await createPdf([[140, 140]]);
    const reportableOrderTests = [
      buildOrderTest({
        id: 'ot-pdf-invalid',
        resultValue: null,
        resultDocumentStorageKey: 'invalid-doc',
        resultDocumentFileName: 'broken-result.pdf',
        resultDocumentMimeType: 'application/pdf',
        test: buildTest({
          code: 'PDF-INV',
          name: 'Invalid PDF Result',
          resultEntryType: 'PDF_UPLOAD',
        }),
      }),
    ];

    mockReportGeneration(service, reportableOrderTests, basePdf);
    resultDocumentsService.readDocument.mockResolvedValue(Buffer.from('not-a-valid-pdf'));

    await expect(
      service.generateTestResultsPDFWithProfile('order-1', 'lab-1', {
        disableCache: true,
      }),
    ).rejects.toThrow(
      'Uploaded result PDF "broken-result.pdf" for test PDF-INV is invalid and could not be appended.',
    );
  });

  it('returns printable HTML when the report has no attached PDF result pages', async () => {
    const { service } = createService();
    const basePdf = await createPdf([[150, 150]]);
    const reportableOrderTests = [
      buildOrderTest({
        id: 'ot-html',
        resultValue: 8.3,
        test: buildTest({
          code: 'HTML',
          name: 'HTML Printable Result',
          resultEntryType: 'NUMERIC',
        }),
      }),
    ];

    mockReportGeneration(service, reportableOrderTests, basePdf);

    const html = await service.generateTestResultsPrintHtml('order-1', 'lab-1');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('__lisResultsPrintReady');
    expect(html).toContain('HTML Printable Result');
  });

  it('requires the standard PDF flow when uploaded result PDF pages are attached', async () => {
    const { service } = createService();
    const basePdf = await createPdf([[160, 160]]);
    const reportableOrderTests = [
      buildOrderTest({
        id: 'ot-html-pdf',
        resultValue: null,
        resultDocumentStorageKey: 'doc-key-html',
        resultDocumentFileName: 'attached-result.pdf',
        resultDocumentMimeType: 'application/pdf',
        test: buildTest({
          code: 'PDF-HTML',
          name: 'PDF Attachment Result',
          resultEntryType: 'PDF_UPLOAD',
        }),
      }),
    ];

    mockReportGeneration(service, reportableOrderTests, basePdf);

    await expect(
      service.generateTestResultsPrintHtml('order-1', 'lab-1'),
    ).rejects.toMatchObject({
      response: {
        code: 'REPORT_HTML_PRINT_REQUIRES_PDF',
      },
    });
  });
});
