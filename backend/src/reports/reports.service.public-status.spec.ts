import { ReportsService } from './reports.service';
import { OrderTestStatus } from '../entities/order-test.entity';
import { TestType } from '../entities/test.entity';

describe('ReportsService public status display rows', () => {
  function createService(): ReportsService {
    return new ReportsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  function buildOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      orderNumber: '260319001',
      paymentStatus: 'paid',
      registeredAt: new Date('2026-03-19T08:00:00.000Z'),
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
      expectedCompletionMinutes: null,
      resultEntryType: 'NUMERIC',
      department: { name: 'General Department' },
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
      resultDocumentFileName: null,
      resultDocumentStorageKey: null,
      resultDocumentMimeType: null,
      resultDocumentSizeBytes: null,
      test: buildTest(),
      ...overrides,
    } as any;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('collapses panel children into one visible row and counts the panel as one public item', async () => {
    const service = createService();
    const panelParent = buildOrderTest({
      id: 'panel-parent',
      status: OrderTestStatus.PENDING,
      test: buildTest({
        code: 'LIPID',
        name: 'Lipid Panel',
        type: TestType.PANEL,
        expectedCompletionMinutes: null,
        department: { name: 'Chemistry' },
      }),
    });
    const hdlChild = buildOrderTest({
      id: 'panel-child-hdl',
      parentOrderTestId: 'panel-parent',
      status: OrderTestStatus.IN_PROGRESS,
      test: buildTest({
        code: 'HDL',
        name: 'HDL Cholesterol',
        expectedCompletionMinutes: 45,
        department: { name: 'Chemistry' },
      }),
    });
    const ldlChild = buildOrderTest({
      id: 'panel-child-ldl',
      parentOrderTestId: 'panel-parent',
      status: OrderTestStatus.PENDING,
      test: buildTest({
        code: 'LDL',
        name: 'LDL Cholesterol',
        expectedCompletionMinutes: 60,
        department: { name: 'Chemistry' },
      }),
    });
    const regularVerified = buildOrderTest({
      id: 'regular-verified',
      status: OrderTestStatus.VERIFIED,
      verifiedAt: new Date('2026-03-19T08:30:00.000Z'),
      resultValue: 1.2,
      test: buildTest({
        code: 'TSH',
        name: 'TSH',
        expectedCompletionMinutes: 30,
        department: { name: 'Hormones' },
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests: [panelParent, hdlChild, ldlChild, regularVerified],
      verifiedTests: [regularVerified],
      latestVerifiedAt: new Date('2026-03-19T08:30:00.000Z'),
    });

    const status = await service.getPublicResultStatus('order-1');

    expect(status.ready).toBe(false);
    expect(status.reportableCount).toBe(2);
    expect(status.verifiedCount).toBe(1);
    expect(status.progressPercent).toBe(50);
    expect(status.tests).toHaveLength(2);

    const panelRow = status.tests.find((row) => row.orderTestId === 'panel-parent');
    expect(panelRow).toEqual(
      expect.objectContaining({
        testCode: 'LIPID',
        testName: 'Lipid Panel',
        departmentName: 'Chemistry',
        expectedCompletionMinutes: 60,
        status: OrderTestStatus.IN_PROGRESS,
        isVerified: false,
      }),
    );
    expect(status.tests.find((row) => row.orderTestId === 'panel-child-hdl')).toBeUndefined();
    expect(status.tests.find((row) => row.orderTestId === 'panel-child-ldl')).toBeUndefined();
  });

  it('marks a collapsed panel as rejected when any child is rejected', async () => {
    const service = createService();
    const panelParent = buildOrderTest({
      id: 'panel-parent',
      status: OrderTestStatus.PENDING,
      test: buildTest({
        code: 'CBC',
        name: 'CBC Panel',
        type: TestType.PANEL,
        expectedCompletionMinutes: 25,
        department: { name: 'Hematology' },
      }),
    });
    const rejectedChild = buildOrderTest({
      id: 'panel-child-rejected',
      parentOrderTestId: 'panel-parent',
      status: OrderTestStatus.REJECTED,
      test: buildTest({
        code: 'WBC',
        name: 'White Blood Cells',
        expectedCompletionMinutes: 15,
        department: { name: 'Hematology' },
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests: [panelParent, rejectedChild],
      verifiedTests: [],
      latestVerifiedAt: null,
    });

    const status = await service.getPublicResultStatus('order-1');

    expect(status.reportableCount).toBe(1);
    expect(status.verifiedCount).toBe(0);
    expect(status.progressPercent).toBe(0);
    expect(status.tests).toEqual([
      expect.objectContaining({
        orderTestId: 'panel-parent',
        status: OrderTestStatus.REJECTED,
        isVerified: false,
      }),
    ]);
  });

  it('keeps an unpaid uploaded PDF test visible but strips public document metadata', async () => {
    const service = createService();
    const uploadedPdfTest = buildOrderTest({
      id: 'pdf-single',
      status: OrderTestStatus.VERIFIED,
      verifiedAt: new Date('2026-03-19T09:10:00.000Z'),
      resultDocumentFileName: 'xray-result.pdf',
      resultDocumentStorageKey: 'doc-key-1',
      resultDocumentMimeType: 'application/pdf',
      resultDocumentSizeBytes: 1024,
      test: buildTest({
        code: 'XRAY',
        name: 'X-Ray',
        resultEntryType: 'PDF_UPLOAD',
        department: { name: 'Radiology' },
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder({ paymentStatus: 'unpaid' }),
      reportableOrderTests: [uploadedPdfTest],
      verifiedTests: [uploadedPdfTest],
      latestVerifiedAt: new Date('2026-03-19T09:10:00.000Z'),
    });

    const status = await service.getPublicResultStatus('order-1');

    expect(status.paymentStatus).toBe('unpaid');
    expect(status.ready).toBe(false);
    expect(status.tests).toEqual([
      expect.objectContaining({
        orderTestId: 'pdf-single',
        testCode: 'XRAY',
        testName: 'X-Ray',
        hasResult: true,
        resultDocument: null,
      }),
    ]);
  });

  it('treats partial payment the same as unpaid for uploaded PDF test metadata', async () => {
    const service = createService();
    const uploadedPdfTest = buildOrderTest({
      id: 'pdf-partial',
      status: OrderTestStatus.VERIFIED,
      verifiedAt: new Date('2026-03-19T09:15:00.000Z'),
      resultDocumentFileName: 'ultrasound.pdf',
      resultDocumentStorageKey: 'doc-key-2',
      resultDocumentMimeType: 'application/pdf',
      resultDocumentSizeBytes: 2048,
      test: buildTest({
        code: 'US',
        name: 'Ultrasound',
        resultEntryType: 'PDF_UPLOAD',
        department: { name: 'Radiology' },
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder({ paymentStatus: 'partial' }),
      reportableOrderTests: [uploadedPdfTest],
      verifiedTests: [uploadedPdfTest],
      latestVerifiedAt: new Date('2026-03-19T09:15:00.000Z'),
    });

    const status = await service.getPublicResultStatus('order-1');

    expect(status.paymentStatus).toBe('partial');
    expect(status.ready).toBe(false);
    expect(status.tests).toEqual([
      expect.objectContaining({
        orderTestId: 'pdf-partial',
        resultDocument: null,
      }),
    ]);
  });

  it('keeps an unpaid panel row visible without exposing uploaded PDF metadata from a child test', async () => {
    const service = createService();
    const panelParent = buildOrderTest({
      id: 'panel-parent',
      status: OrderTestStatus.PENDING,
      test: buildTest({
        code: 'RAD',
        name: 'Radiology Panel',
        type: TestType.PANEL,
        department: { name: 'Radiology' },
      }),
    });
    const uploadedPdfChild = buildOrderTest({
      id: 'panel-child-pdf',
      parentOrderTestId: 'panel-parent',
      status: OrderTestStatus.VERIFIED,
      verifiedAt: new Date('2026-03-19T09:30:00.000Z'),
      resultDocumentFileName: 'panel-child.pdf',
      resultDocumentStorageKey: 'doc-key-panel',
      resultDocumentMimeType: 'application/pdf',
      resultDocumentSizeBytes: 4096,
      test: buildTest({
        code: 'XR1',
        name: 'Radiology Child',
        resultEntryType: 'PDF_UPLOAD',
        department: { name: 'Radiology' },
      }),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder({ paymentStatus: 'unpaid' }),
      reportableOrderTests: [panelParent, uploadedPdfChild],
      verifiedTests: [uploadedPdfChild],
      latestVerifiedAt: new Date('2026-03-19T09:30:00.000Z'),
    });

    const status = await service.getPublicResultStatus('order-1');

    expect(status.tests).toHaveLength(1);
    expect(status.tests[0]).toEqual(
      expect.objectContaining({
        orderTestId: 'panel-parent',
        status: OrderTestStatus.IN_PROGRESS,
        resultDocument: null,
      }),
    );
  });
});
