import { DashboardService } from './dashboard.service';

function createServiceHarness(options?: {
  totalPatientsCount?: string | number | null;
  pendingVerification?: number;
  ordersToday?: number;
  avgTatHours?: number | null;
}) {
  const patientRepo = {
    count: jest.fn().mockResolvedValue(37),
  };

  const orderQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest
      .fn()
      .mockResolvedValue({ count: options?.totalPatientsCount ?? '0' }),
  };

  const orderTestQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(options?.pendingVerification ?? 0),
  };

  const orderRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(orderQueryBuilder),
  };

  const orderTestRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(orderTestQueryBuilder),
  };

  const ordersService = {
    getOrdersTodayCount: jest.fn().mockResolvedValue(options?.ordersToday ?? 0),
  };

  const service = new DashboardService(
    patientRepo as never,
    orderTestRepo as never,
    orderRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    ordersService as never,
    {} as never,
  );

  const getRecentAverageTatHoursMock = jest.spyOn(
    service as unknown as { getRecentAverageTatHours: (labId: string, days: number) => Promise<number | null> },
    'getRecentAverageTatHours',
  );
  getRecentAverageTatHoursMock.mockResolvedValue(options?.avgTatHours ?? null);

  return {
    service,
    patientRepo,
    orderRepo,
    orderQueryBuilder,
    orderTestRepo,
    orderTestQueryBuilder,
    ordersService,
  };
}

describe('DashboardService', () => {
  it('counts distinct patients for the current lab instead of using the global patient table', async () => {
    const { service, patientRepo, orderRepo, orderQueryBuilder, ordersService } =
      createServiceHarness({
        totalPatientsCount: '2',
        ordersToday: 1,
        pendingVerification: 3,
        avgTatHours: 4.5,
      });

    const result = await service.getKpis('lab-1');

    expect(result).toEqual({
      ordersToday: 1,
      pendingVerification: 3,
      avgTatHours: 4.5,
      totalPatients: 2,
    });
    expect(orderRepo.createQueryBuilder).toHaveBeenCalledWith('o');
    expect(orderQueryBuilder.where).toHaveBeenCalledWith('o.labId = :labId', { labId: 'lab-1' });
    expect(ordersService.getOrdersTodayCount).toHaveBeenCalledWith('lab-1');
    expect(patientRepo.count).not.toHaveBeenCalled();
  });

  it('returns zero total patients for a new lab with no orders', async () => {
    const { service } = createServiceHarness({
      totalPatientsCount: '0',
      ordersToday: 0,
      pendingVerification: 0,
      avgTatHours: null,
    });

    const result = await service.getKpis('new-lab');

    expect(result.totalPatients).toBe(0);
  });
});
