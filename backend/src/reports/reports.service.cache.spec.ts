import { ReportsService } from './reports.service';

describe('ReportsService cache behavior', () => {
  function createFileStorageMock() {
    return {
      isConfigured: jest.fn().mockReturnValue(true),
      uploadFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getFile: jest.fn(),
    };
  }

  function createService(overrides?: {
    orderRepo?: { update: jest.Mock };
    fileStorageService?: ReturnType<typeof createFileStorageMock>;
  }): ReportsService {
    return new ReportsService(
      (overrides?.orderRepo ?? { update: jest.fn().mockResolvedValue(undefined) }) as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      (overrides?.fileStorageService ?? createFileStorageMock()) as any,
    );
  }

  function buildOrder(overrides?: Record<string, unknown>) {
    return {
      id: 'order-1',
      orderNumber: '260317001',
      paymentStatus: 'paid',
      reportS3Key: null,
      reportGeneratedAt: null,
      registeredAt: new Date('2026-03-17T08:00:00.000Z'),
      updatedAt: new Date('2026-03-17T08:00:00.000Z'),
      patient: {
        id: 'patient-1',
        updatedAt: new Date('2026-03-17T08:00:00.000Z'),
        fullName: 'Patient One',
        sex: 'male',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      },
      lab: {
        updatedAt: new Date('2026-03-17T08:00:00.000Z'),
        reportStyle: null,
      },
      ...overrides,
    } as any;
  }

  function buildOrderTest(overrides?: Record<string, unknown>) {
    return {
      id: 'ot-1',
      updatedAt: new Date('2026-03-17T08:30:00.000Z'),
      status: 'VERIFIED',
      flag: null,
      resultValue: '12.3',
      resultText: null,
      verifiedBy: 'user-1',
      comments: null,
      test: {},
      ...overrides,
    } as any;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the in-memory PDF cache before reading a stored report from S3', async () => {
    const fileStorageService = createFileStorageMock();
    const service = createService({ fileStorageService });
    const reportableOrderTests = [buildOrderTest()];
    const order = buildOrder({
      reportS3Key: 'reports/lab-1/order-1/stored.pdf',
      reportGeneratedAt: new Date('2026-03-17T09:00:00.000Z'),
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order,
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-17T08:45:00.000Z'),
    });
    jest.spyOn(service as any, 'loadPanelSectionLookup').mockResolvedValue({
      byPanelAndChildTest: new Map(),
      fingerprint: 'panel-fingerprint',
    });
    jest
      .spyOn(service as any, 'attachPanelSectionMetadata')
      .mockImplementation((tests: unknown[]) => tests);
    jest.spyOn(service as any, 'resolveOrderQrValue').mockReturnValue('qr-value');
    jest
      .spyOn(service as any, 'getCachedPdf')
      .mockReturnValue(Buffer.from('memory-cached-pdf'));

    const result = await service.generateTestResultsPDFWithProfile('order-1', 'lab-1', {
      bypassResultCompletionCheck: true,
    });

    expect(result.pdf.toString()).toBe('memory-cached-pdf');
    expect(fileStorageService.getFile).not.toHaveBeenCalled();
    expect(result.performance.cacheHit).toBe(true);
  });

  it('primes the in-memory PDF cache after syncing a stored report to S3', async () => {
    const fileStorageService = createFileStorageMock();
    const orderRepo = { update: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ fileStorageService, orderRepo });
    const reportableOrderTests = [buildOrderTest()];
    const order = buildOrder({ paymentStatus: 'unpaid' });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order,
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-17T08:45:00.000Z'),
    });
    jest.spyOn(service as any, 'loadPanelSectionLookup').mockResolvedValue({
      byPanelAndChildTest: new Map(),
      fingerprint: 'panel-fingerprint',
    });
    jest
      .spyOn(service as any, 'attachPanelSectionMetadata')
      .mockImplementation((tests: unknown[]) => tests);
    jest.spyOn(service as any, 'resolveOrderQrValue').mockReturnValue('qr-value');
    jest
      .spyOn(service as any, 'buildStoredReportPdfObjectKey')
      .mockReturnValue('reports/lab-1/order-1/stored.pdf');
    jest.spyOn(service as any, 'buildReportPdfCacheKey').mockReturnValue('report-cache-key');
    const setCachedPdfSpy = jest.spyOn(service as any, 'setCachedPdf');
    jest.spyOn(service, 'generateTestResultsPDFWithProfile').mockResolvedValue({
      pdf: Buffer.from('freshly-generated-pdf'),
      performance: {
        orderId: 'order-1',
        labId: 'lab-1',
        totalMs: 0,
        snapshotMs: 0,
        cacheHit: false,
        inFlightJoin: false,
      },
    });

    const storageKey = await service.syncReportToS3('order-1', 'lab-1');

    expect(storageKey).toBe('reports/lab-1/order-1/stored.pdf');
    expect(setCachedPdfSpy).toHaveBeenCalledWith(
      'report-cache-key',
      Buffer.from('freshly-generated-pdf'),
    );
    expect(fileStorageService.uploadFile).toHaveBeenCalledWith(
      'reports/lab-1/order-1/stored.pdf',
      Buffer.from('freshly-generated-pdf'),
      'application/pdf',
    );
    expect(orderRepo.update).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({
        reportS3Key: 'reports/lab-1/order-1/stored.pdf',
      }),
    );
  });
});
