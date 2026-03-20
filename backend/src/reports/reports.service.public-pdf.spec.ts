import { ReportsService } from './reports.service';
import { OrderStatus } from '../entities/order.entity';
import { OrderTestStatus } from '../entities/order-test.entity';

describe('ReportsService public PDF watermark behavior', () => {
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
      labId: 'lab-1',
      status: OrderStatus.COMPLETED,
      orderNumber: '260320010',
      paymentStatus: 'paid',
      registeredAt: new Date('2026-03-20T08:00:00.000Z'),
      patient: {
        fullName: 'Patient One',
      },
      lab: {
        name: 'Main Lab',
        enableOnlineResults: true,
        onlineResultWatermarkDataUrl: null,
        onlineResultWatermarkText: 'ONLINE VERSION',
        reportWatermarkDataUrl: 'data:image/png;base64,cmVwb3J0',
      },
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
      verifiedAt: new Date('2026-03-20T08:30:00.000Z'),
      test: {
        code: 'CBC',
        name: 'CBC',
        resultEntryType: 'NUMERIC',
      },
      ...overrides,
    } as any;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the online watermark image override for the public PDF when configured', async () => {
    const service = createService();
    const reportableOrderTests = [buildOrderTest()];
    const order = buildOrder({
      lab: {
        name: 'Main Lab',
        enableOnlineResults: true,
        onlineResultWatermarkDataUrl: 'data:image/png;base64,b25saW5l',
        onlineResultWatermarkText: 'ONLINE VERSION',
        reportWatermarkDataUrl: 'data:image/png;base64,cmVwb3J0',
      },
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order,
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-20T08:30:00.000Z'),
    });
    const generateSpy = jest.spyOn(service, 'generateTestResultsPDF').mockResolvedValue(Buffer.from('pdf'));

    await service.generatePublicTestResultsPDF('order-1');

    expect(generateSpy).toHaveBeenCalledWith('order-1', 'lab-1', {
      allowCacheWithReportDesignOverride: true,
      reportDesignOverride: {
        reportBranding: {
          watermarkDataUrl: 'data:image/png;base64,b25saW5l',
        },
      },
    });
  });

  it('falls back to the current report watermark path when no online watermark image is configured', async () => {
    const service = createService();
    const reportableOrderTests = [buildOrderTest()];

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-20T08:30:00.000Z'),
    });
    const generateSpy = jest.spyOn(service, 'generateTestResultsPDF').mockResolvedValue(Buffer.from('pdf'));

    await service.generatePublicTestResultsPDF('order-1');

    expect(generateSpy).toHaveBeenCalledWith('order-1', 'lab-1', undefined);
  });

  it('keeps the unpaid public PDF rejection unchanged', async () => {
    const service = createService();
    const reportableOrderTests = [buildOrderTest()];

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder({ paymentStatus: 'unpaid' }),
      reportableOrderTests,
      verifiedTests: reportableOrderTests,
      latestVerifiedAt: new Date('2026-03-20T08:30:00.000Z'),
    });
    const generateSpy = jest.spyOn(service, 'generateTestResultsPDF');

    await expect(service.generatePublicTestResultsPDF('order-1')).rejects.toThrow(
      'Results are not completed yet. Please check again later.',
    );
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('keeps the incomplete public PDF rejection unchanged', async () => {
    const service = createService();
    const verifiedTest = buildOrderTest();
    const pendingTest = buildOrderTest({
      id: 'ot-2',
      status: OrderTestStatus.PENDING,
      verifiedAt: null,
      resultValue: null,
      resultText: null,
      test: {
        code: 'TSH',
        name: 'TSH',
        resultEntryType: 'NUMERIC',
      },
    });

    jest.spyOn(service as any, 'loadOrderResultsSnapshot').mockResolvedValue({
      order: buildOrder(),
      reportableOrderTests: [verifiedTest, pendingTest],
      verifiedTests: [verifiedTest],
      latestVerifiedAt: new Date('2026-03-20T08:30:00.000Z'),
    });
    const generateSpy = jest.spyOn(service, 'generateTestResultsPDF');

    await expect(service.generatePublicTestResultsPDF('order-1')).rejects.toThrow(
      'Results are not completed yet. Please check again later.',
    );
    expect(generateSpy).not.toHaveBeenCalled();
  });
});
