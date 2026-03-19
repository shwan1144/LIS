"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubLabsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sub_lab_entity_1 = require("../entities/sub-lab.entity");
const sub_lab_test_price_entity_1 = require("../entities/sub-lab-test-price.entity");
const user_entity_1 = require("../entities/user.entity");
const test_entity_1 = require("../entities/test.entity");
const order_entity_1 = require("../entities/order.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const password_util_1 = require("../auth/password.util");
const orders_service_1 = require("../orders/orders.service");
const create_order_response_dto_1 = require("../orders/dto/create-order-response.dto");
const reports_service_1 = require("../reports/reports.service");
const dashboard_service_1 = require("../dashboard/dashboard.service");
let SubLabsService = class SubLabsService {
    constructor(subLabRepo, subLabTestPriceRepo, userRepo, testRepo, orderRepo, ordersService, reportsService, dashboardService) {
        this.subLabRepo = subLabRepo;
        this.subLabTestPriceRepo = subLabTestPriceRepo;
        this.userRepo = userRepo;
        this.testRepo = testRepo;
        this.orderRepo = orderRepo;
        this.ordersService = ordersService;
        this.reportsService = reportsService;
        this.dashboardService = dashboardService;
    }
    async listForLab(labId) {
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
                .getRawMany(),
        ]);
        const userBySubLabId = new Map();
        for (const user of users) {
            if (!user.subLabId || userBySubLabId.has(user.subLabId))
                continue;
            userBySubLabId.set(user.subLabId, user);
        }
        const priceCountBySubLabId = new Map(priceCounts.map((row) => [row.subLabId, parseInt(row.count, 10) || 0]));
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
    async listActiveOptions(labId) {
        return this.subLabRepo.find({
            where: { labId, isActive: true },
            select: { id: true, name: true, isActive: true, labId: true, createdAt: true, updatedAt: true },
            order: { name: 'ASC' },
        });
    }
    async getForLab(labId, id) {
        return this.getForLabWithManager(this.subLabRepo.manager, labId, id);
    }
    async createForLab(labId, data) {
        const password = String(data.password ?? '').trim();
        if (!password) {
            throw new common_1.BadRequestException('Password is required');
        }
        return this.subLabRepo.manager.transaction(async (manager) => {
            const existingUser = await manager.getRepository(user_entity_1.User).findOne({
                where: { labId, username: data.username.trim() },
            });
            if (existingUser) {
                throw new common_1.BadRequestException('Username already exists');
            }
            await this.assertTestsBelongToLab(manager, labId, data.prices ?? []);
            const subLab = await manager.getRepository(sub_lab_entity_1.SubLab).save(manager.getRepository(sub_lab_entity_1.SubLab).create({
                labId,
                name: data.name.trim(),
                isActive: data.isActive !== false,
            }));
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
    async updateForLab(labId, id, data) {
        return this.subLabRepo.manager.transaction(async (manager) => {
            const repo = manager.getRepository(sub_lab_entity_1.SubLab);
            const subLab = await repo.findOne({ where: { id, labId } });
            if (!subLab) {
                throw new common_1.NotFoundException('Sub lab not found');
            }
            await this.assertTestsBelongToLab(manager, labId, data.prices ?? []);
            const normalizedUsername = data.username.trim();
            const existingUserWithUsername = await manager.getRepository(user_entity_1.User).findOne({
                where: { labId, username: normalizedUsername },
            });
            if (existingUserWithUsername && existingUserWithUsername.subLabId !== subLab.id) {
                throw new common_1.BadRequestException('Username already exists');
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
    async archiveForLab(labId, id) {
        await this.subLabRepo.manager.transaction(async (manager) => {
            const subLab = await manager.getRepository(sub_lab_entity_1.SubLab).findOne({
                where: { id, labId },
            });
            if (!subLab) {
                throw new common_1.NotFoundException('Sub lab not found');
            }
            subLab.isActive = false;
            await manager.getRepository(sub_lab_entity_1.SubLab).save(subLab);
            await manager.getRepository(user_entity_1.User).update({ labId, subLabId: subLab.id }, { isActive: false });
        });
        return { success: true };
    }
    async getPortalProfile(labId, subLabId) {
        const subLab = await this.requireActiveSubLab(labId, subLabId);
        return {
            id: subLab.id,
            name: subLab.name,
            labId: subLab.labId,
        };
    }
    async listPortalOrders(labId, subLabId, params) {
        await this.requireActiveSubLab(labId, subLabId);
        const result = await this.ordersService.findHistory(labId, {
            ...params,
            sourceSubLabId: subLabId,
        });
        const readyItems = result.items.filter((item) => item.reportReady);
        if (readyItems.length === 0) {
            return result;
        }
        const summaryByOrderId = new Map();
        await Promise.all(readyItems.map(async (item) => {
            const order = await this.ordersService.findOne(item.id, labId, create_order_response_dto_1.OrderDetailView.FULL);
            if (order.sourceSubLabId !== subLabId) {
                return;
            }
            const progress = this.calculatePortalProgress(order.samples ?? []);
            if (!progress.reportReady) {
                return;
            }
            summaryByOrderId.set(item.id, this.buildPortalResultSummary(order));
        }));
        return {
            ...result,
            items: result.items.map((item) => ({
                ...item,
                resultSummary: item.reportReady ? (summaryByOrderId.get(item.id) ?? 'Result ready') : null,
            })),
        };
    }
    async getPortalOrderDetail(labId, subLabId, orderId) {
        await this.requireActiveSubLab(labId, subLabId);
        const order = await this.ordersService.findOne(orderId, labId, create_order_response_dto_1.OrderDetailView.FULL);
        if (order.sourceSubLabId !== subLabId) {
            throw new common_1.NotFoundException('Order not found');
        }
        const progress = this.calculatePortalProgress(order.samples ?? []);
        Object.assign(order, progress);
        if (!progress.reportReady) {
            this.stripPortalResults(order);
        }
        return order;
    }
    async getPortalStatistics(labId, subLabId, startDate, endDate) {
        await this.requireActiveSubLab(labId, subLabId);
        return this.dashboardService.getStatistics(labId, startDate, endDate, {
            subLabId,
        });
    }
    async generatePortalResultsPdf(labId, subLabId, orderId) {
        await this.requireActiveSubLab(labId, subLabId);
        const order = await this.ordersService.findOne(orderId, labId, create_order_response_dto_1.OrderDetailView.FULL);
        if (order.sourceSubLabId !== subLabId) {
            throw new common_1.NotFoundException('Order not found');
        }
        const progress = this.calculatePortalProgress(order.samples ?? []);
        if (!progress.reportReady) {
            throw new common_1.ForbiddenException('Results are not ready yet');
        }
        if (!this.hasRootPanelTest(order.samples ?? [])) {
            throw new common_1.ForbiddenException('PDF access is available only for panel orders');
        }
        return this.reportsService.generateTestResultsPDF(orderId, labId, {
            bypassPaymentCheck: true,
            reportDesignOverride: {
                reportBranding: {
                    bannerDataUrl: null,
                    footerDataUrl: null,
                },
            },
        });
    }
    async requireActiveSubLab(labId, subLabId) {
        const subLab = await this.subLabRepo.findOne({
            where: { id: subLabId, labId },
        });
        if (!subLab) {
            throw new common_1.NotFoundException('Sub lab not found');
        }
        if (!subLab.isActive) {
            throw new common_1.ForbiddenException('Sub lab is inactive');
        }
        return subLab;
    }
    async getForLabWithManager(manager, labId, id) {
        const subLabRepo = manager.getRepository(sub_lab_entity_1.SubLab);
        const userRepo = manager.getRepository(user_entity_1.User);
        const subLabTestPriceRepo = manager.getRepository(sub_lab_test_price_entity_1.SubLabTestPrice);
        const subLab = await subLabRepo.findOne({
            where: { id, labId },
        });
        if (!subLab) {
            throw new common_1.NotFoundException('Sub lab not found');
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
    async upsertSubLabUser(manager, input) {
        const userRepo = manager.getRepository(user_entity_1.User);
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
                existingUser.passwordHash = await (0, password_util_1.hashPassword)(input.password);
            }
            return userRepo.save(existingUser);
        }
        if (!input.password) {
            throw new common_1.BadRequestException('Password is required');
        }
        return userRepo.save(userRepo.create({
            username: input.username,
            passwordHash: await (0, password_util_1.hashPassword)(input.password),
            fullName: input.subLab.name,
            role: 'SUB_LAB',
            labId: input.labId,
            defaultLabId: input.labId,
            subLabId: input.subLab.id,
            isActive: input.isActive,
        }));
    }
    async replaceSubLabPrices(manager, subLabId, prices) {
        const repo = manager.getRepository(sub_lab_test_price_entity_1.SubLabTestPrice);
        await repo.delete({ subLabId });
        if (prices.length === 0) {
            return;
        }
        await repo.insert(prices.map((row) => ({
            subLabId,
            testId: row.testId,
            price: row.price,
            isActive: true,
        })));
    }
    async assertTestsBelongToLab(manager, labId, prices) {
        const uniqueTestIds = [...new Set(prices.map((row) => row.testId))];
        if (uniqueTestIds.length === 0) {
            return;
        }
        const tests = await manager.getRepository(test_entity_1.Test).find({
            where: uniqueTestIds.map((id) => ({ id, labId })),
            select: { id: true, labId: true, name: true, code: true },
        });
        if (tests.length !== uniqueTestIds.length) {
            throw new common_1.BadRequestException('One or more priced tests do not belong to this lab');
        }
    }
    calculatePortalProgress(samples) {
        const rootTests = samples
            .flatMap((sample) => sample.orderTests ?? [])
            .filter((orderTest) => !orderTest.parentOrderTestId);
        let pendingTestsCount = 0;
        let completedTestsCount = 0;
        let verifiedTestsCount = 0;
        let rejectedTestsCount = 0;
        for (const orderTest of rootTests) {
            if (orderTest.status === order_test_entity_1.OrderTestStatus.COMPLETED) {
                completedTestsCount += 1;
            }
            else if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED) {
                verifiedTestsCount += 1;
            }
            else if (orderTest.status === order_test_entity_1.OrderTestStatus.REJECTED) {
                rejectedTestsCount += 1;
            }
            else {
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
    buildPortalResultSummary(order) {
        const rootTests = (order.samples ?? [])
            .flatMap((sample) => sample.orderTests ?? [])
            .filter((orderTest) => !orderTest.parentOrderTestId);
        const resultParts = rootTests
            .map((orderTest) => this.formatPortalOrderTestSummary(orderTest))
            .filter((value) => Boolean(value));
        if (resultParts.length === 0) {
            return null;
        }
        const visible = resultParts.slice(0, 3);
        const suffix = resultParts.length > visible.length ? ` +${resultParts.length - visible.length} more` : '';
        return `${visible.join(' | ')}${suffix}`;
    }
    formatPortalOrderTestSummary(orderTest) {
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
    stripPortalResults(order) {
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
    hasRootPanelTest(samples) {
        return samples
            .flatMap((sample) => sample.orderTests ?? [])
            .some((orderTest) => !orderTest.parentOrderTestId && orderTest.test?.type === test_entity_1.TestType.PANEL);
    }
};
exports.SubLabsService = SubLabsService;
exports.SubLabsService = SubLabsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(sub_lab_entity_1.SubLab)),
    __param(1, (0, typeorm_1.InjectRepository)(sub_lab_test_price_entity_1.SubLabTestPrice)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(test_entity_1.Test)),
    __param(4, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        orders_service_1.OrdersService,
        reports_service_1.ReportsService,
        dashboard_service_1.DashboardService])
], SubLabsService);
//# sourceMappingURL=sub-labs.service.js.map