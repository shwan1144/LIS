import { ConflictException } from '@nestjs/common';
import { AuditAction } from '../entities/audit-log.entity';
import { ReportsController } from './reports.controller';

describe('ReportsController HTML print route', () => {
  function createResponseMock() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
  }

  function createRequestMock() {
    return {
      headers: {},
      user: {
        userId: 'user-1',
        username: 'lab-user',
        labId: 'lab-1',
      },
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns printable HTML and audits generation', async () => {
    const reportsService = {
      generateTestResultsPrintHtml: jest.fn().mockResolvedValue('<!DOCTYPE html><html><body>print</body></html>'),
    };
    const auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new ReportsController(reportsService as any, auditService as any);
    const req = createRequestMock();
    req.headers = { 'x-report-print-attempt-id': 'attempt-1' };
    const res = createResponseMock();

    await controller.getTestResultsPrintHtml(req as any, 'order-1', res as any);

    expect(reportsService.generateTestResultsPrintHtml).toHaveBeenCalledWith('order-1', 'lab-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.REPORT_GENERATE,
        entityId: 'order-1',
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('x-report-print-attempt-id', 'attempt-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith('<!DOCTYPE html><html><body>print</body></html>');
  });

  it('preserves the machine-readable attachment fallback code on conflicts', async () => {
    const reportsService = {
      generateTestResultsPrintHtml: jest.fn().mockRejectedValue(
        new ConflictException({
          code: 'REPORT_HTML_PRINT_REQUIRES_PDF',
          message: 'This report includes attached PDF result pages.',
        }),
      ),
    };
    const auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new ReportsController(reportsService as any, auditService as any);
    const req = createRequestMock();
    const res = createResponseMock();

    await controller.getTestResultsPrintHtml(req as any, 'order-1', res as any);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      code: 'REPORT_HTML_PRINT_REQUIRES_PDF',
      message: 'This report includes attached PDF result pages.',
    });
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
