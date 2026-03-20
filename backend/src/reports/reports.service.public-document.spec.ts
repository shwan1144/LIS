import { ReportsService } from './reports.service';
import { OrderTestStatus } from '../entities/order-test.entity';
import { TestType } from '../entities/test.entity';

describe('ReportsService public result document access', () => {
  function createService() {
    const resultDocumentsService = {
      readDocument: jest.fn(),
    };
    const service = new ReportsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      resultDocumentsService as any,
      {} as any,
    );

    return { service, resultDocumentsService };
  }

  function buildOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      labId: 'lab-1',
      status: 'COMPLETED',
      paymentStatus: 'paid',
      orderNumber: '260320001',
      registeredAt: new Date('2026-03-20T08:00:00.000Z'),
      patient: {
        fullName: 'Patient One',
      },
      lab: {
        name: 'Main Lab',
        enableOnlineResults: true,
        onlineResultWatermarkDataUrl: null,
        onlineResultWatermarkText: null,
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
      department: { name: 'General Department' },
      resultEntryType: 'NUMERIC',
      ...overrides,
    } as any;
  }

  function buildOrderTest(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ot-1',
      status: OrderTestStatus.PENDING,
      parentOrderTestId: null,
      resultValue: null,
      resultText: null,
      resultParameters: null,
      cultureResult: null,
      verifiedAt: null,
      resultDocumentStorageKey: null,
      resultDocumentFileName: null,
      resultDocumentMimeType: null,
      resultDocumentSizeBytes: null,
      test: buildTest(),
      ...overrides,
    } as any;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows public access to a verified uploaded PDF test even when another test is still pending', async () => {
    const { service, resultDocumentsService } = createService();
    const uploadedBuffer = Buffer.from('pdf-binary');
    const pdfUploadTest = buildOrderTest({
      id: 'ot-pdf',
      status: OrderTestStatus.VERIFIED,
      verifiedAt: new Date('2026-03-20T09:00:00.000Z'),
      resultDocumentStorageKey: 'doc-key-1',
      resultDocumentFileName: 'uploaded-result.pdf',
      resultDocumentMimeType: 'application/pdf',
      resultDocumentSizeBytes: uploadedBuffer.length,
      test: buildTest({
        code: 'XRAY',
        name: 'X-Ray Report',
        resultEntryType: 'PDF_UPLOAD',
      }),
    });
    const pendingNumericTest = buildOrderTest({
      id: 'ot-cbc',
      status: OrderTestStatus.PENDING,
      test: buildTest({
        code: 'CBC',
        name: 'Complete Blood Count',
        resultEntryType: 'NUMERIC',
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests: [pdfUploadTest, pendingNumericTest],
      verifiedTests: [pdfUploadTest],
      latestVerifiedAt: new Date('2026-03-20T09:00:00.000Z'),
    });
    resultDocumentsService.readDocument.mockResolvedValue(uploadedBuffer);

    const result = await service.getPublicResultDocument('order-1', 'ot-pdf');

    expect(result.fileName).toBe('uploaded-result.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.buffer).toBe(uploadedBuffer);
    expect(resultDocumentsService.readDocument).toHaveBeenCalledWith('doc-key-1');
  });

  it('rejects public document access for an unpaid uploaded PDF test', async () => {
    const { service, resultDocumentsService } = createService();
    const pdfUploadTest = buildOrderTest({
      id: 'ot-pdf',
      status: OrderTestStatus.VERIFIED,
      verifiedAt: new Date('2026-03-20T09:00:00.000Z'),
      resultDocumentStorageKey: 'doc-key-unpaid',
      resultDocumentFileName: 'unpaid-result.pdf',
      resultDocumentMimeType: 'application/pdf',
      resultDocumentSizeBytes: 64,
      test: buildTest({
        code: 'XRAY',
        name: 'X-Ray Report',
        resultEntryType: 'PDF_UPLOAD',
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder({ paymentStatus: 'unpaid' }),
      reportableOrderTests: [pdfUploadTest],
      verifiedTests: [pdfUploadTest],
      latestVerifiedAt: new Date('2026-03-20T09:00:00.000Z'),
    });

    await expect(service.getPublicResultDocument('order-1', 'ot-pdf')).rejects.toThrow(
      'Order is unpaid or partially paid. Complete payment to access uploaded PDF results.',
    );
    expect(resultDocumentsService.readDocument).not.toHaveBeenCalled();
  });

  it('rejects public document access for a partially paid uploaded PDF test', async () => {
    const { service, resultDocumentsService } = createService();
    const pdfUploadTest = buildOrderTest({
      id: 'ot-pdf-partial',
      status: OrderTestStatus.VERIFIED,
      verifiedAt: new Date('2026-03-20T09:10:00.000Z'),
      resultDocumentStorageKey: 'doc-key-partial',
      resultDocumentFileName: 'partial-result.pdf',
      resultDocumentMimeType: 'application/pdf',
      resultDocumentSizeBytes: 64,
      test: buildTest({
        code: 'US',
        name: 'Ultrasound Report',
        resultEntryType: 'PDF_UPLOAD',
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder({ paymentStatus: 'partial' }),
      reportableOrderTests: [pdfUploadTest],
      verifiedTests: [pdfUploadTest],
      latestVerifiedAt: new Date('2026-03-20T09:10:00.000Z'),
    });

    await expect(service.getPublicResultDocument('order-1', 'ot-pdf-partial')).rejects.toThrow(
      'Order is unpaid or partially paid. Complete payment to access uploaded PDF results.',
    );
    expect(resultDocumentsService.readDocument).not.toHaveBeenCalled();
  });

  it('rejects guessed panel-child document URLs when the order is unpaid', async () => {
    const { service, resultDocumentsService } = createService();
    const panelParent = buildOrderTest({
      id: 'ot-panel',
      status: OrderTestStatus.PENDING,
      test: buildTest({
        code: 'RAD',
        name: 'Radiology Panel',
        type: TestType.PANEL,
      }),
    });
    const panelChildPdf = buildOrderTest({
      id: 'ot-panel-child-pdf',
      parentOrderTestId: 'ot-panel',
      status: OrderTestStatus.VERIFIED,
      verifiedAt: new Date('2026-03-20T09:20:00.000Z'),
      resultDocumentStorageKey: 'doc-key-panel-child',
      resultDocumentFileName: 'panel-child-result.pdf',
      resultDocumentMimeType: 'application/pdf',
      resultDocumentSizeBytes: 64,
      test: buildTest({
        code: 'XR2',
        name: 'Panel Child Report',
        resultEntryType: 'PDF_UPLOAD',
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder({ paymentStatus: 'unpaid' }),
      reportableOrderTests: [panelParent, panelChildPdf],
      verifiedTests: [panelChildPdf],
      latestVerifiedAt: new Date('2026-03-20T09:20:00.000Z'),
    });

    await expect(
      service.getPublicResultDocument('order-1', 'ot-panel-child-pdf'),
    ).rejects.toThrow('Order is unpaid or partially paid. Complete payment to access uploaded PDF results.');
    expect(resultDocumentsService.readDocument).not.toHaveBeenCalled();
  });
});
