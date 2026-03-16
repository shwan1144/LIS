import { ReportsService } from './reports.service';

describe('ReportsService public result link resolution', () => {
  const originalPublicResultsBaseUrl = process.env.PUBLIC_RESULTS_BASE_URL;
  const originalPublicResultsLabBaseDomain = process.env.PUBLIC_RESULTS_LAB_BASE_DOMAIN;

  afterEach(() => {
    process.env.PUBLIC_RESULTS_BASE_URL = originalPublicResultsBaseUrl;
    process.env.PUBLIC_RESULTS_LAB_BASE_DOMAIN = originalPublicResultsLabBaseDomain;
    jest.clearAllMocks();
  });

  function createService(): ReportsService {
    return new ReportsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('uses subdomain.medilis.net by default when subdomain is valid', () => {
    const service = createService();
    const url = (service as any).resolveOrderQrValue({
      id: 'order-1',
      lab: { subdomain: 'lab01' },
    });

    expect(url).toBe('https://lab01.medilis.net/public/results/order-1');
  });

  it('falls back to API base URL when subdomain is missing', () => {
    process.env.PUBLIC_RESULTS_BASE_URL = 'https://api.example.test';
    const service = createService();
    const url = (service as any).resolveOrderQrValue({
      id: 'order-2',
      lab: { subdomain: null },
    });

    expect(url).toBe('https://api.example.test/public/results/order-2');
  });

  it('falls back to API base URL when subdomain is invalid', () => {
    process.env.PUBLIC_RESULTS_BASE_URL = 'https://api.example.test';
    const service = createService();
    const url = (service as any).resolveOrderQrValue({
      id: 'order-3',
      lab: { subdomain: 'bad subdomain' },
    });

    expect(url).toBe('https://api.example.test/public/results/order-3');
  });

  it('supports overriding the public lab base domain via env', () => {
    process.env.PUBLIC_RESULTS_LAB_BASE_DOMAIN = 'staging.medilis.net';
    const service = createService();
    const url = (service as any).resolveOrderQrValue({
      id: 'order-4',
      lab: { subdomain: 'lab02' },
    });

    expect(url).toBe('https://lab02.staging.medilis.net/public/results/order-4');
  });

  it('changes the report cache key when panel section fingerprint changes', () => {
    const service = createService();
    const baseInput = {
      labId: 'lab-1',
      order: {
        id: 'order-1',
        paymentStatus: 'PAID',
        updatedAt: new Date('2026-03-16T08:00:00.000Z'),
        lab: {
          updatedAt: new Date('2026-03-16T08:00:00.000Z'),
          reportStyle: null,
        },
      },
      reportableOrderTests: [
        {
          id: 'ot-1',
          updatedAt: new Date('2026-03-16T08:00:00.000Z'),
          status: 'VERIFIED',
          flag: null,
          resultValue: 1.2,
          resultText: null,
        },
      ],
      latestVerifiedAt: new Date('2026-03-16T09:00:00.000Z'),
      bypassPaymentCheck: false,
      orderQrValue: 'https://lab01.medilis.net/public/results/order-1',
      cultureOnly: false,
    };

    const keyA = (service as any).buildReportPdfCacheKey({
      ...baseInput,
      panelSectionFingerprint: 'panel-a:child-1:Macroscopic:1710576000000',
    });
    const keyB = (service as any).buildReportPdfCacheKey({
      ...baseInput,
      panelSectionFingerprint: 'panel-a:child-1:Microscopic:1710576000000',
    });

    expect(keyA).not.toBe(keyB);
  });
});
