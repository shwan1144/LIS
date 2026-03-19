import { ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { PublicReportsController } from './public-reports.controller';
import type { PublicResultStatus, ReportsService } from './reports.service';

type ResponseMock = Response & {
  setHeader: jest.Mock;
  status: jest.Mock;
  send: jest.Mock;
  json: jest.Mock;
  redirect: jest.Mock;
};

function createResponseMock(): ResponseMock {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn(),
    send: jest.fn(),
    json: jest.fn(),
    redirect: jest.fn(),
  } as unknown as ResponseMock;
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.redirect.mockReturnValue(res);
  res.setHeader.mockReturnValue(res);
  return res;
}

function createStatus(overrides: Partial<PublicResultStatus> = {}): PublicResultStatus {
  return {
    orderId: '11111111-1111-1111-1111-111111111111',
    orderNumber: 'ORD-001',
    patientName: 'Patient Name',
    labName: 'Main Lab',
    onlineResultWatermarkDataUrl: null,
    onlineResultWatermarkText: null,
    registeredAt: '2026-03-12T10:00:00.000Z',
    paymentStatus: 'paid',
    reportableCount: 2,
    verifiedCount: 1,
    progressPercent: 50,
    ready: false,
    verifiedAt: null,
    tests: [
      {
        orderTestId: 'ot-1',
        testCode: 'CBC',
        testName: 'Complete Blood Count',
        departmentName: 'Hematology',
        expectedCompletionMinutes: 60,
        status: 'IN_PROGRESS',
        isVerified: false,
        hasResult: false,
        resultValue: null,
        unit: null,
        verifiedAt: null,
        resultEntryType: 'NUMERIC',
        resultDocument: null,
      },
    ],
    ...overrides,
  };
}

describe('PublicReportsController', () => {
  it('renders bilingual pending HTML when results are not ready', async () => {
    const reportsService = {
      getPublicResultStatus: jest.fn().mockResolvedValue(createStatus()),
    } as unknown as ReportsService;
    const controller = new PublicReportsController(reportsService);
    const res = createResponseMock();

    await controller.getResultStatusPage('11111111-1111-1111-1111-111111111111', res);

    expect(res.status).toHaveBeenCalledWith(200);
    const html = String(res.send.mock.calls[0]?.[0] ?? '');
    expect(html).toContain('تکایە چاوەڕێ بکە');
    expect(html).toContain('يرجى الانتظار');
    expect((html.match(/dir=\"rtl\"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Checking every 5 seconds');
  });

  it('redirects to PDF when status is ready', async () => {
    const reportsService = {
      getPublicResultStatus: jest.fn().mockResolvedValue(createStatus({ ready: true })),
    } as unknown as ReportsService;
    const controller = new PublicReportsController(reportsService);
    const res = createResponseMock();

    await controller.getResultStatusPage('11111111-1111-1111-1111-111111111111', res);

    expect(res.redirect).toHaveBeenCalledWith('/public/results/11111111-1111-1111-1111-111111111111/pdf');
  });

  it('returns no-store JSON from status endpoint', async () => {
    const status = createStatus();
    const reportsService = {
      getPublicResultStatus: jest.fn().mockResolvedValue(status),
    } as unknown as ReportsService;
    const controller = new PublicReportsController(reportsService);
    const res = createResponseMock();

    await controller.getResultStatusJson('11111111-1111-1111-1111-111111111111', res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(status);
  });

  it('returns JSON error payload from status endpoint failures', async () => {
    const reportsService = {
      getPublicResultStatus: jest.fn().mockRejectedValue(
        new ForbiddenException('Online results are disabled by laboratory settings.'),
      ),
    } as unknown as ReportsService;
    const controller = new PublicReportsController(reportsService);
    const res = createResponseMock();

    await controller.getResultStatusJson('11111111-1111-1111-1111-111111111111', res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Online results are disabled by laboratory settings.',
    });
  });
});
