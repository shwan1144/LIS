import { PlatformAdminController } from './platform-admin.controller';

describe('PlatformAdminController', () => {
  it('maps listOrders query params to typed service call', async () => {
    const service = {
      listOrders: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 2,
        size: 25,
        totalPages: 0,
      }),
    };

    const controller = new PlatformAdminController(service as never);
    const req = {
      user: { platformUserId: 'platform-user-1', role: 'SUPER_ADMIN' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest', 'x-forwarded-for': '203.0.113.10' },
    };

    await controller.listOrders(req, 'lab-1', 'COMPLETED', 'patient', '2026-02-01', '2026-02-20', '2', '25');

    expect(service.listOrders).toHaveBeenCalledWith(
      {
        labId: 'lab-1',
        status: 'COMPLETED',
        q: 'patient',
        dateFrom: '2026-02-01',
        dateTo: '2026-02-20',
        page: 2,
        size: 25,
      },
      expect.objectContaining({
        platformUserId: 'platform-user-1',
        role: 'SUPER_ADMIN',
        ipAddress: '203.0.113.10',
        userAgent: 'jest',
      }),
    );
  });

  it('maps tests-transfer params and body to the service call', async () => {
    const service = {
      transferLabTests: jest.fn().mockResolvedValue({
        dryRun: true,
        sourceLab: { id: '11111111-1111-4111-8111-111111111111', code: 'SRC', name: 'Source Lab' },
        targetLab: { id: '22222222-2222-4222-8222-222222222222', code: 'TGT', name: 'Target Lab' },
        totalSourceTests: 3,
        createCount: 1,
        updateCount: 2,
        pricingRowsCopied: 4,
        pricingRowsSkipped: 1,
        unmatchedDepartments: [],
        unmatchedShiftPrices: [],
        warnings: [],
      }),
    };

    const controller = new PlatformAdminController(service as never);
    const req = {
      user: { platformUserId: 'platform-user-1', role: 'SUPER_ADMIN' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest', 'x-forwarded-for': '203.0.113.10' },
    };

    await controller.transferLabTests(req, '22222222-2222-4222-8222-222222222222', {
      sourceLabId: '11111111-1111-4111-8111-111111111111',
      dryRun: true,
    });

    expect(service.transferLabTests).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      {
        sourceLabId: '11111111-1111-4111-8111-111111111111',
        dryRun: true,
      },
      expect.objectContaining({
        platformUserId: 'platform-user-1',
        role: 'SUPER_ADMIN',
        ipAddress: '203.0.113.10',
        userAgent: 'jest',
      }),
    );
  });
});
