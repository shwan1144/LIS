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
});

