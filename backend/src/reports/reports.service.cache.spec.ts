import { ReportsService } from './reports.service';

describe('ReportsService stored report behavior', () => {
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

  it('reads a matching stored report from S3 before generating a new PDF', async () => {
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
      .spyOn(service as any, 'buildStoredReportPdfObjectKey')
      .mockReturnValue('reports/lab-1/order-1/stored.pdf');
    fileStorageService.getFile.mockResolvedValue(Buffer.from('stored-pdf'));
    const syncSpy = jest.spyOn(service, 'syncReportToS3');
    const renderSpy = jest.spyOn(service as any, 'renderPdfFromHtml');

    const result = await service.generateTestResultsPDFWithProfile('order-1', 'lab-1');

    expect(result.pdf.toString()).toBe('stored-pdf');
    expect(fileStorageService.getFile).toHaveBeenCalledWith('reports/lab-1/order-1/stored.pdf');
    expect(syncSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(result.performance.cacheHit).toBe(true);
  });

  it('regenerates and uploads when stored metadata matches but the S3 object is missing', async () => {
    const fileStorageService = createFileStorageMock();
    const orderRepo = { update: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ fileStorageService, orderRepo });
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
      .spyOn(service as any, 'buildStoredReportPdfObjectKey')
      .mockReturnValue('reports/lab-1/order-1/stored.pdf');
    fileStorageService.getFile.mockRejectedValue(new Error('missing'));
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
    expect(fileStorageService.getFile).toHaveBeenCalledWith('reports/lab-1/order-1/stored.pdf');
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

  it('tries sync and then reads the stored report when the current S3 object is missing', async () => {
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
      .spyOn(service as any, 'buildStoredReportPdfObjectKey')
      .mockReturnValue('reports/lab-1/order-1/stored.pdf');
    fileStorageService.getFile
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce(Buffer.from('synced-pdf'));
    const syncSpy = jest
      .spyOn(service, 'syncReportToS3')
      .mockResolvedValue('reports/lab-1/order-1/stored.pdf');
    const renderSpy = jest.spyOn(service as any, 'renderPdfFromHtml');

    const result = await service.generateTestResultsPDFWithProfile('order-1', 'lab-1');

    expect(syncSpy).toHaveBeenCalledWith('order-1', 'lab-1');
    expect(fileStorageService.getFile).toHaveBeenNthCalledWith(
      1,
      'reports/lab-1/order-1/stored.pdf',
    );
    expect(fileStorageService.getFile).toHaveBeenNthCalledWith(
      2,
      'reports/lab-1/order-1/stored.pdf',
    );
    expect(renderSpy).not.toHaveBeenCalled();
    expect(result.pdf.toString()).toBe('synced-pdf');
    expect(result.performance.cacheHit).toBe(true);
  });

  it('reads an override-backed stored report directly when override cache is enabled', async () => {
    const fileStorageService = createFileStorageMock();
    const service = createService({ fileStorageService });
    const reportableOrderTests = [buildOrderTest()];
    const order = buildOrder({
      reportS3Key: 'reports/lab-1/order-1/default.pdf',
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
      .spyOn(service as any, 'buildStoredReportPdfObjectKey')
      .mockReturnValue('reports/lab-1/order-1/public-watermark.pdf');
    fileStorageService.getFile.mockResolvedValue(Buffer.from('override-cached-pdf'));
    const syncSpy = jest.spyOn(service, 'syncReportToS3');
    const renderSpy = jest.spyOn(service as any, 'renderPdfFromHtml');

    const result = await service.generateTestResultsPDFWithProfile('order-1', 'lab-1', {
      allowCacheWithReportDesignOverride: true,
      reportDesignOverride: {
        reportBranding: {
          watermarkDataUrl: 'data:image/png;base64,b25saW5l',
        },
      },
    });

    expect(result.pdf.toString()).toBe('override-cached-pdf');
    expect(fileStorageService.getFile).toHaveBeenCalledWith('reports/lab-1/order-1/public-watermark.pdf');
    expect(syncSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(result.performance.cacheHit).toBe(true);
  });

  it('uploads an override-backed stored report when the override cache misses', async () => {
    const fileStorageService = createFileStorageMock();
    const service = createService({ fileStorageService });
    const reportableOrderTests = [buildOrderTest()];
    const order = buildOrder({
      reportS3Key: 'reports/lab-1/order-1/default.pdf',
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
      .spyOn(service as any, 'buildStoredReportPdfObjectKey')
      .mockReturnValue('reports/lab-1/order-1/public-watermark.pdf');
    fileStorageService.getFile.mockRejectedValue(new Error('missing'));
    jest.spyOn(service as any, 'buildResultsReportHtmlDocument').mockResolvedValue({
      html: '<html><body>report</body></html>',
      verifiers: [],
      comments: [],
      verifierLookupMs: 0,
      assetsMs: 0,
      htmlMs: 0,
    });
    jest.spyOn(service as any, 'renderPdfFromHtml').mockResolvedValue(Buffer.from('generated-override-pdf'));
    const syncSpy = jest.spyOn(service, 'syncReportToS3');

    const result = await service.generateTestResultsPDFWithProfile('order-1', 'lab-1', {
      allowCacheWithReportDesignOverride: true,
      reportDesignOverride: {
        reportBranding: {
          watermarkDataUrl: 'data:image/png;base64,b25saW5l',
        },
      },
    });

    expect(result.pdf.toString()).toBe('generated-override-pdf');
    expect(fileStorageService.uploadFile).toHaveBeenCalledWith(
      'reports/lab-1/order-1/public-watermark.pdf',
      Buffer.from('generated-override-pdf'),
      'application/pdf',
    );
    expect(syncSpy).not.toHaveBeenCalled();
    expect(result.performance.cacheHit).toBe(false);
  });
});
