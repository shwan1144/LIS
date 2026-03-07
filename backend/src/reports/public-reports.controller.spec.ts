import type { Request, Response } from 'express';
import { PublicReportsController } from './public-reports.controller';
import {
  type PublicResultHistoryItem,
  type PublicResultStatus,
  type ReportsService,
} from './reports.service';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function createStatus(overrides: Partial<PublicResultStatus> = {}): PublicResultStatus {
  return {
    orderId: ORDER_ID,
    orderNumber: 'ORD-1001',
    patientName: 'Test Patient',
    labName: 'Main Lab',
    onlineResultWatermarkDataUrl: null,
    onlineResultWatermarkText: null,
    registeredAt: '2026-03-06T10:00:00.000Z',
    paymentStatus: 'paid',
    reportableCount: 2,
    verifiedCount: 2,
    progressPercent: 100,
    ready: true,
    verifiedAt: '2026-03-06T10:30:00.000Z',
    tests: [],
    ...overrides,
  };
}

function createResponseMock(): Response {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('PublicReportsController', () => {
  let controller: PublicReportsController;
  let reportsService: jest.Mocked<Pick<ReportsService, 'getPublicResultStatus' | 'searchPublicResultHistory' | 'generatePublicTestResultsPDF'>>;

  beforeEach(() => {
    reportsService = {
      getPublicResultStatus: jest.fn(),
      searchPublicResultHistory: jest.fn(),
      generatePublicTestResultsPDF: jest.fn(),
    };
    controller = new PublicReportsController(reportsService as unknown as ReportsService);
  });

  it('renders ready order page with View PDF action and no redirect', async () => {
    reportsService.getPublicResultStatus.mockResolvedValue(createStatus({ ready: true }));
    const res = createResponseMock();

    await controller.getResultStatusPage(
      ORDER_ID,
      { labId: 'lab-1' } as Request,
      res,
      undefined,
      undefined,
    );

    expect((res.redirect as jest.Mock)).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(200);
    const html = String((res.send as jest.Mock).mock.calls[0]?.[0] ?? '');
    expect(html).toContain('View PDF');
    expect(html).toContain(`/public/results/${ORDER_ID}/pdf`);
  });

  it('renders history rows and links for valid search query', async () => {
    reportsService.getPublicResultStatus.mockResolvedValue(createStatus({ ready: false, progressPercent: 30, verifiedCount: 1 }));
    const history: PublicResultHistoryItem[] = [
      {
        orderId: '22222222-2222-4222-8222-222222222222',
        orderNumber: 'ORD-9001',
        registeredAt: '2026-01-01T12:00:00.000Z',
      },
    ];
    reportsService.searchPublicResultHistory.mockResolvedValue(history);
    const res = createResponseMock();

    await controller.getResultStatusPage(
      ORDER_ID,
      { labId: 'lab-1' } as Request,
      res,
      'P-000001',
      '1990',
    );

    expect(reportsService.searchPublicResultHistory).toHaveBeenCalledWith({
      labId: 'lab-1',
      patientNumber: 'P-000001',
      birthYear: 1990,
      limit: 50,
    });
    const html = String((res.send as jest.Mock).mock.calls[0]?.[0] ?? '');
    expect(html).toContain('Result History Search');
    expect(html).toContain('ORD-9001');
    expect(html).toContain('/public/results/22222222-2222-4222-8222-222222222222/pdf');
  });

  it('shows generic validation error for invalid birth year', async () => {
    reportsService.getPublicResultStatus.mockResolvedValue(createStatus({ ready: false }));
    const res = createResponseMock();

    await controller.getResultStatusPage(
      ORDER_ID,
      { labId: 'lab-1' } as Request,
      res,
      'P-000001',
      '90',
    );

    expect(reportsService.searchPublicResultHistory).not.toHaveBeenCalled();
    const html = String((res.send as jest.Mock).mock.calls[0]?.[0] ?? '');
    expect(html).toContain('Please enter valid search details.');
  });

  it('shows validation error for out-of-range birth year', async () => {
    reportsService.getPublicResultStatus.mockResolvedValue(createStatus({ ready: false }));
    const res = createResponseMock();

    await controller.getResultStatusPage(
      ORDER_ID,
      { labId: 'lab-1' } as Request,
      res,
      'P-000001',
      '1899',
    );

    expect(reportsService.searchPublicResultHistory).not.toHaveBeenCalled();
    const html = String((res.send as jest.Mock).mock.calls[0]?.[0] ?? '');
    expect(html).toContain('Please enter valid search details.');
  });

  it('shows safe generic message when search returns no matches', async () => {
    reportsService.getPublicResultStatus.mockResolvedValue(createStatus({ ready: false }));
    reportsService.searchPublicResultHistory.mockResolvedValue([]);
    const res = createResponseMock();

    await controller.getResultStatusPage(
      ORDER_ID,
      { labId: 'lab-1' } as Request,
      res,
      'P-000001',
      '1990',
    );

    const html = String((res.send as jest.Mock).mock.calls[0]?.[0] ?? '');
    expect(html).toContain('No matching report history found with the provided details.');
  });

  it('disables history search when lab scope is unavailable', async () => {
    reportsService.getPublicResultStatus.mockResolvedValue(createStatus({ ready: false }));
    const res = createResponseMock();

    await controller.getResultStatusPage(
      ORDER_ID,
      { labId: null } as Request,
      res,
      'P-000001',
      '1990',
    );

    expect(reportsService.searchPublicResultHistory).not.toHaveBeenCalled();
    const html = String((res.send as jest.Mock).mock.calls[0]?.[0] ?? '');
    expect(html).toContain('History search unavailable on this host.');
    expect(html).toContain('id="patientNumber" name="patientNumber" required value="P-000001" disabled');
  });
});
