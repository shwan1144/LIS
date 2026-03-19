import { ReportsService } from './reports.service';
import { OrderStatus } from '../entities/order.entity';
import { OrderTestStatus } from '../entities/order-test.entity';
import { TestType } from '../entities/test.entity';

describe('ReportsService cancelled order guards', () => {
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
      status: OrderStatus.CANCELLED,
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
      department: { name: 'General Department' },
      resultEntryType: 'NUMERIC',
      ...overrides,
    } as any;
  }

  function buildOrderTest(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ot-1',
      status: OrderTestStatus.VERIFIED,
      parentOrderTestId: null,
      resultValue: '5.1',
      resultText: '5.1',
      resultParameters: null,
      cultureResult: null,
      verifiedAt: new Date('2026-03-19T08:30:00.000Z'),
      resultDocumentStorageKey: 'doc-key',
      resultDocumentFileName: 'result.pdf',
      resultDocumentMimeType: 'application/pdf',
      resultDocumentSizeBytes: 1024,
      test: buildTest(),
      ...overrides,
    } as any;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects internal results PDF generation for cancelled orders', async () => {
    const { service } = createService();
    const reportableOrderTests = [buildOrderTest()];

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-19T08:30:00.000Z'),
    });

    await expect(
      service.generateTestResultsPDFWithProfile('order-1', 'lab-1'),
    ).rejects.toThrow('Cancelled orders cannot release results.');
  });

  it('rejects public result status for cancelled orders', async () => {
    const { service } = createService();
    const reportableOrderTests = [buildOrderTest()];

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-19T08:30:00.000Z'),
    });

    await expect(service.getPublicResultStatus('order-1')).rejects.toThrow(
      'Cancelled orders cannot release results.',
    );
  });

  it('rejects public results PDF for cancelled orders', async () => {
    const { service } = createService();
    const reportableOrderTests = [buildOrderTest()];

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-19T08:30:00.000Z'),
    });
    const generateSpy = jest.spyOn(service, 'generateTestResultsPDF');

    await expect(service.generatePublicTestResultsPDF('order-1')).rejects.toThrow(
      'Cancelled orders cannot release results.',
    );
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('rejects public result document access for cancelled orders', async () => {
    const { service, resultDocumentsService } = createService();
    const reportableOrderTests = [buildOrderTest()];

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-19T08:30:00.000Z'),
    });

    await expect(
      service.getPublicResultDocument('order-1', 'ot-1'),
    ).rejects.toThrow('Cancelled orders cannot release results.');
    expect(resultDocumentsService.readDocument).not.toHaveBeenCalled();
  });
});
