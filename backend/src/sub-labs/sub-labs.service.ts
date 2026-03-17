import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SubLab } from '../entities/sub-lab.entity';
import { SubLabTestPrice } from '../entities/sub-lab-test-price.entity';
import { User } from '../entities/user.entity';
import { Test } from '../entities/test.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { hashPassword } from '../auth/password.util';
import { OrdersService, type OrderListQueryParams } from '../orders/orders.service';
import { OrderDetailView } from '../orders/dto/create-order-response.dto';
import { ReportsService } from '../reports/reports.service';
import { DashboardService } from '../dashboard/dashboard.service';

type PortalProgress = {
  testsCount: number;
  readyTestsCount: number;
  pendingTestsCount: number;
  completedTestsCount: number;
  verifiedTestsCount: number;
  rejectedTestsCount: number;
  reportReady: boolean;
};

@Injectable()
export class SubLabsService {
  constructor(
    @InjectRepository(SubLab)
    private readonly subLabRepo: Repository<SubLab>,
    @InjectRepository(SubLabTestPrice)
    private readonly subLabTestPriceRepo: Repository<SubLabTestPrice>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Test)
    private readonly testRepo: Repository<Test>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly reportsService: ReportsService,
    private readonly dashboardService: DashboardService,
  ) {}

  async listForLab(labId: string) {
    const subLabs = await this.subLabRepo.find({
      where: { labId },
      order: { createdAt: 'DESC' },
    });
    if (subLabs.length === 0) {
      return [];
    }

    const subLabIds = subLabs.map((subLab) => subLab.id);
    const [users, priceCounts] = await Promise.all([
      this.userRepo.find({
        where: subLabIds.map((subLabId) => ({ subLabId, labId })),
        order: { createdAt: 'ASC' },
      }),
      this.subLabTestPriceRepo
        .createQueryBuilder('price')
        .select('price.subLabId', 'subLabId')
        .addSelect('COUNT(*)', 'count')
        .where('price.subLabId IN (:...subLabIds)', { subLabIds })
        .andWhere('price.isActive = :isActive', { isActive: true })
        .groupBy('price.subLabId')
        .getRawMany<{ subLabId: string; count: string }>(),
    ]);

    const userBySubLabId = new Map<string, User>();
    for (const user of users) {
      if (!user.subLabId || userBySubLabId.has(user.subLabId)) continue;
      userBySubLabId.set(user.subLabId, user);
    }
    const priceCountBySubLabId = new Map(
      priceCounts.map((row) => [row.subLabId, parseInt(row.count, 10) || 0]),
    );

    return subLabs.map((subLab) => ({
      id: subLab.id,
      name: subLab.name,
      isActive: subLab.isActive,
      createdAt: subLab.createdAt,
      updatedAt: subLab.updatedAt,
      username: userBySubLabId.get(subLab.id)?.username ?? null,
      priceCount: priceCountBySubLabId.get(subLab.id) ?? 0,
    }));
  }

  async listActiveOptions(labId: string) {
    return this.subLabRepo.find({
      where: { labId, isActive: true },
      select: { id: true, name: true, isActive: true, labId: true, createdAt: true, updatedAt: true },
      order: { name: 'ASC' },
    });
  }

  async getForLab(labId: string, id: string) {
    return this.getForLabWithManager(this.subLabRepo.manager, labId, id);
  }

  async createForLab(
    labId: string,
    data: {
      name: string;
      username: string;
      password?: string;
      isActive?: boolean;
      prices?: Array<{ testId: string; price: number }>;
    },
  ) {
    const password = String(data.password ?? '').trim();
    if (!password) {
      throw new BadRequestException('Password is required');
    }
    return this.subLabRepo.manager.transaction(async (manager) => {
      const existingUser = await manager.getRepository(User).findOne({
        where: { labId, username: data.username.trim() },
      });
      if (existingUser) {
        throw new BadRequestException('Username already exists');
      }

      await this.assertTestsBelongToLab(manager, labId, data.prices ?? []);

      const subLab = await manager.getRepository(SubLab).save(
        manager.getRepository(SubLab).create({
          labId,
          name: data.name.trim(),
          isActive: data.isActive !== false,
        }),
      );

      await this.upsertSubLabUser(manager, {
        labId,
        subLab,
        username: data.username.trim(),
        password,
        isActive: subLab.isActive,
      });
      await this.replaceSubLabPrices(manager, subLab.id, data.prices ?? []);

      return this.getForLabWithManager(manager, labId, subLab.id);
    });
  }

  async updateForLab(
    labId: string,
    id: string,
    data: {
      name: string;
      username: string;
      password?: string;
      isActive?: boolean;
      prices?: Array<{ testId: string; price: number }>;
    },
  ) {
    return this.subLabRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(SubLab);
      const subLab = await repo.findOne({ where: { id, labId } });
      if (!subLab) {
        throw new NotFoundException('Sub lab not found');
      }

      await this.assertTestsBelongToLab(manager, labId, data.prices ?? []);

      const normalizedUsername = data.username.trim();
      const existingUserWithUsername = await manager.getRepository(User).findOne({
        where: { labId, username: normalizedUsername },
      });
      if (existingUserWithUsername && existingUserWithUsername.subLabId !== subLab.id) {
        throw new BadRequestException('Username already exists');
      }

      subLab.name = data.name.trim();
      if (data.isActive !== undefined) {
        subLab.isActive = data.isActive;
      }
      await repo.save(subLab);

      await this.upsertSubLabUser(manager, {
        labId,
        subLab,
        username: normalizedUsername,
        password: data.password?.trim() || null,
        isActive: subLab.isActive,
      });

      if (data.prices !== undefined) {
        await this.replaceSubLabPrices(manager, subLab.id, data.prices);
      }

      return this.getForLabWithManager(manager, labId, subLab.id);
    });
  }

  async archiveForLab(labId: string, id: string) {
    await this.subLabRepo.manager.transaction(async (manager) => {
      const subLab = await manager.getRepository(SubLab).findOne({
        where: { id, labId },
      });
      if (!subLab) {
        throw new NotFoundException('Sub lab not found');
      }

      subLab.isActive = false;
      await manager.getRepository(SubLab).save(subLab);
      await manager.getRepository(User).update(
        { labId, subLabId: subLab.id },
        { isActive: false },
      );
    });
    return { success: true };
  }

  async getPortalProfile(labId: string, subLabId: string) {
    const subLab = await this.requireActiveSubLab(labId, subLabId);
    return {
      id: subLab.id,
      name: subLab.name,
      labId: subLab.labId,
    };
  }

  async listPortalOrders(labId: string, subLabId: string, params: OrderListQueryParams) {
    await this.requireActiveSubLab(labId, subLabId);
    const result = await this.ordersService.findHistory(labId, {
      ...params,
      sourceSubLabId: subLabId,
    });
    const readyItems = result.items.filter((item) => item.reportReady);
    if (readyItems.length === 0) {
      return result;
    }

    const summaryByOrderId = new Map<string, string | null>();
    await Promise.all(
      readyItems.map(async (item) => {
        const order = await this.ordersService.findOne(item.id, labId, OrderDetailView.FULL);
        if (order.sourceSubLabId !== subLabId) {
          return;
        }
        const progress = this.calculatePortalProgress(order.samples ?? []);
        if (!progress.reportReady) {
          return;
        }
        summaryByOrderId.set(item.id, this.buildPortalResultSummary(order));
      }),
    );

    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        resultSummary: item.reportReady ? (summaryByOrderId.get(item.id) ?? 'Result ready') : null,
      })),
    };
  }

  async getPortalOrderDetail(labId: string, subLabId: string, orderId: string) {
    await this.requireActiveSubLab(labId, subLabId);
    const order = await this.ordersService.findOne(orderId, labId, OrderDetailView.FULL);
    if (order.sourceSubLabId !== subLabId) {
      throw new NotFoundException('Order not found');
    }

    const progress = this.calculatePortalProgress(order.samples ?? []);
    Object.assign(order, progress);
    if (!progress.reportReady) {
      this.stripPortalResults(order);
    }
    return order;
  }

  async getPortalStatistics(
    labId: string,
    subLabId: string,
    startDate: Date,
    endDate: Date,
  ) {
    await this.requireActiveSubLab(labId, subLabId);
    return this.dashboardService.getStatistics(labId, startDate, endDate, {
      subLabId,
    });
  }

  async generatePortalResultsPdf(labId: string, subLabId: string, orderId: string) {
    throw new ForbiddenException('PDF access is disabled for sub-lab portal');
  }

  private async requireActiveSubLab(labId: string, subLabId: string): Promise<SubLab> {
    const subLab = await this.subLabRepo.findOne({
      where: { id: subLabId, labId },
    });
    if (!subLab) {
      throw new NotFoundException('Sub lab not found');
    }
    if (!subLab.isActive) {
      throw new ForbiddenException('Sub lab is inactive');
    }
    return subLab;
  }

  private async getForLabWithManager(
    manager: EntityManager,
    labId: string,
    id: string,
  ) {
    const subLabRepo = manager.getRepository(SubLab);
    const userRepo = manager.getRepository(User);
    const subLabTestPriceRepo = manager.getRepository(SubLabTestPrice);

    const subLab = await subLabRepo.findOne({
      where: { id, labId },
    });
    if (!subLab) {
      throw new NotFoundException('Sub lab not found');
    }

    const [user, priceRows] = await Promise.all([
      userRepo.findOne({
        where: { subLabId: subLab.id, labId },
      }),
      subLabTestPriceRepo.find({
        where: { subLabId: subLab.id, isActive: true },
        order: { createdAt: 'ASC' },
      }),
    ]);

    return {
      id: subLab.id,
      name: subLab.name,
      isActive: subLab.isActive,
      createdAt: subLab.createdAt,
      updatedAt: subLab.updatedAt,
      username: user?.username ?? null,
      prices: priceRows.map((row) => ({
        id: row.id,
        testId: row.testId,
        price: Number(row.price ?? 0),
      })),
    };
  }

  private async upsertSubLabUser(
    manager: EntityManager,
    input: {
      labId: string;
      subLab: SubLab;
      username: string;
      password: string | null;
      isActive: boolean;
    },
  ) {
    const userRepo = manager.getRepository(User);
    const existingUser = await userRepo.findOne({
      where: { subLabId: input.subLab.id, labId: input.labId },
    });

    if (existingUser) {
      existingUser.username = input.username;
      existingUser.fullName = input.subLab.name;
      existingUser.role = 'SUB_LAB';
      existingUser.defaultLabId = input.labId;
      existingUser.isActive = input.isActive;
      if (input.password) {
        existingUser.passwordHash = await hashPassword(input.password);
      }
      return userRepo.save(existingUser);
    }

    if (!input.password) {
      throw new BadRequestException('Password is required');
    }

    return userRepo.save(
      userRepo.create({
        username: input.username,
        passwordHash: await hashPassword(input.password),
        fullName: input.subLab.name,
        role: 'SUB_LAB',
        labId: input.labId,
        defaultLabId: input.labId,
        subLabId: input.subLab.id,
        isActive: input.isActive,
      }),
    );
  }

  private async replaceSubLabPrices(
    manager: EntityManager,
    subLabId: string,
    prices: Array<{ testId: string; price: number }>,
  ) {
    const repo = manager.getRepository(SubLabTestPrice);
    await repo.delete({ subLabId });
    if (prices.length === 0) {
      return;
    }
    await repo.insert(
      prices.map((row) => ({
        subLabId,
        testId: row.testId,
        price: row.price,
        isActive: true,
      })),
    );
  }

  private async assertTestsBelongToLab(
    manager: EntityManager,
    labId: string,
    prices: Array<{ testId: string; price: number }>,
  ) {
    const uniqueTestIds = [...new Set(prices.map((row) => row.testId))];
    if (uniqueTestIds.length === 0) {
      return;
    }
    const tests = await manager.getRepository(Test).find({
      where: uniqueTestIds.map((id) => ({ id, labId })),
      select: { id: true, labId: true, name: true, code: true },
    });
    if (tests.length !== uniqueTestIds.length) {
      throw new BadRequestException('One or more priced tests do not belong to this lab');
    }
  }

  private calculatePortalProgress(samples: Array<{ orderTests?: OrderTest[] }>): PortalProgress {
    const rootTests = samples
      .flatMap((sample) => sample.orderTests ?? [])
      .filter((orderTest) => !orderTest.parentOrderTestId);

    let pendingTestsCount = 0;
    let completedTestsCount = 0;
    let verifiedTestsCount = 0;
    let rejectedTestsCount = 0;

    for (const orderTest of rootTests) {
      if (orderTest.status === OrderTestStatus.COMPLETED) {
        completedTestsCount += 1;
      } else if (orderTest.status === OrderTestStatus.VERIFIED) {
        verifiedTestsCount += 1;
      } else if (orderTest.status === OrderTestStatus.REJECTED) {
        rejectedTestsCount += 1;
      } else {
        pendingTestsCount += 1;
      }
    }

    const testsCount = rootTests.length;
    const readyTestsCount = completedTestsCount + verifiedTestsCount;
    return {
      testsCount,
      readyTestsCount,
      pendingTestsCount,
      completedTestsCount,
      verifiedTestsCount,
      rejectedTestsCount,
      reportReady: testsCount > 0 && verifiedTestsCount === testsCount,
    };
  }

  private buildPortalResultSummary(order: Order): string | null {
    const rootTests = (order.samples ?? [])
      .flatMap((sample) => sample.orderTests ?? [])
      .filter((orderTest) => !orderTest.parentOrderTestId);

    const resultParts = rootTests
      .map((orderTest) => this.formatPortalOrderTestSummary(orderTest))
      .filter((value): value is string => Boolean(value));

    if (resultParts.length === 0) {
      return null;
    }

    const visible = resultParts.slice(0, 3);
    const suffix = resultParts.length > visible.length ? ` +${resultParts.length - visible.length} more` : '';
    return `${visible.join(' | ')}${suffix}`;
  }

  private formatPortalOrderTestSummary(orderTest: OrderTest): string | null {
    const label = orderTest.test?.code?.trim() || orderTest.test?.name?.trim() || 'Result';

    if (orderTest.cultureResult) {
      if (orderTest.cultureResult.noGrowth) {
        return `${label}: ${orderTest.cultureResult.noGrowthResult || 'No growth'}`;
      }
      const isolateCount = Array.isArray(orderTest.cultureResult.isolates)
        ? orderTest.cultureResult.isolates.length
        : 0;
      return `${label}: ${isolateCount} isolate${isolateCount === 1 ? '' : 's'}`;
    }

    if (orderTest.resultText?.trim()) {
      return `${label}: ${orderTest.resultText.trim()}`;
    }

    if (orderTest.resultValue !== null && orderTest.resultValue !== undefined) {
      const unit = orderTest.test?.unit ? ` ${orderTest.test.unit}` : '';
      return `${label}: ${orderTest.resultValue}${unit}`;
    }

    const parameterEntries = Object.entries(orderTest.resultParameters ?? {})
      .filter(([, value]) => String(value ?? '').trim().length > 0)
      .slice(0, 2)
      .map(([key, value]) => `${key} ${value}`);
    if (parameterEntries.length > 0) {
      return `${label}: ${parameterEntries.join(', ')}`;
    }

    return null;
  }

  private stripPortalResults(order: Order) {
    for (const sample of order.samples ?? []) {
      for (const orderTest of sample.orderTests ?? []) {
        orderTest.resultValue = null;
        orderTest.resultText = null;
        orderTest.resultParameters = null;
        orderTest.cultureResult = null;
        orderTest.flag = null;
        orderTest.comments = null;
      }
    }
  }
}
