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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformAdminService = void 0;
const common_1 = require("@nestjs/common");
const lab_entity_1 = require("../entities/lab.entity");
const order_entity_1 = require("../entities/order.entity");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const rls_session_service_1 = require("../database/rls-session.service");
const settings_service_1 = require("../settings/settings.service");
const user_lab_assignment_entity_1 = require("../entities/user-lab-assignment.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_2 = require("../entities/audit-log.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const patient_entity_1 = require("../entities/patient.entity");
const reports_service_1 = require("../reports/reports.service");
const typeorm_1 = require("typeorm");
const admin_auth_service_1 = require("../admin-auth/admin-auth.service");
const auth_service_1 = require("../auth/auth.service");
let PlatformAdminService = class PlatformAdminService {
    constructor(rlsSessionService, settingsService, auditService, reportsService, adminAuthService, authService) {
        this.rlsSessionService = rlsSessionService;
        this.settingsService = settingsService;
        this.auditService = auditService;
        this.reportsService = reportsService;
        this.adminAuthService = adminAuthService;
        this.authService = authService;
    }
    async listLabs() {
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const labs = await manager.getRepository(lab_entity_1.Lab).find({
                order: { name: 'ASC' },
            });
            return this.toAdminLabListItems(manager, labs);
        });
    }
    async listLabsPaged(params) {
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(200, Math.max(1, params.size ?? 25));
        const skip = (page - 1) * size;
        const status = params.status?.trim().toLowerCase();
        if (status && !['all', 'active', 'disabled'].includes(status)) {
            throw new common_1.BadRequestException('Invalid status');
        }
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const qb = manager.getRepository(lab_entity_1.Lab).createQueryBuilder('lab');
            if (status === 'active') {
                qb.andWhere('lab.isActive = true');
            }
            else if (status === 'disabled') {
                qb.andWhere('lab.isActive = false');
            }
            if (params.q?.trim()) {
                const q = `%${params.q.trim()}%`;
                qb.andWhere(`(lab.name ILIKE :q
            OR lab.code ILIKE :q
            OR COALESCE(lab.subdomain, '') ILIKE :q
            OR COALESCE(lab.timezone, '') ILIKE :q)`, { q });
            }
            const total = await qb.clone().getCount();
            const labs = await qb
                .orderBy('lab.name', 'ASC')
                .addOrderBy('lab.code', 'ASC')
                .skip(skip)
                .take(size)
                .getMany();
            const items = await this.toAdminLabListItems(manager, labs);
            return {
                items,
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            };
        });
    }
    async getLab(labId, actor) {
        const labs = await this.listLabs();
        const lab = labs.find((item) => item.id === labId);
        if (!lab) {
            throw new common_1.NotFoundException('Lab not found');
        }
        await this.logPlatformSensitiveRead(actor, {
            labId,
            entityType: 'lab',
            entityId: labId,
            description: `Viewed lab details for ${lab.name} (${lab.code})`,
        });
        return lab;
    }
    async createLab(dto, actor) {
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const labRepo = manager.getRepository(lab_entity_1.Lab);
            const code = dto.code.trim().toUpperCase();
            const name = dto.name.trim();
            const subdomain = (dto.subdomain?.trim().toLowerCase() || this.toSubdomainFromCode(code));
            const timezone = dto.timezone?.trim() || 'UTC';
            const existing = await labRepo.findOne({
                where: [{ code }, { subdomain }],
            });
            if (existing) {
                if (existing.code === code) {
                    throw new common_1.ConflictException(`Lab code "${code}" already exists`);
                }
                if (existing.subdomain === subdomain) {
                    throw new common_1.ConflictException(`Subdomain "${subdomain}" already exists`);
                }
            }
            const lab = labRepo.create({
                code,
                name,
                subdomain,
                timezone,
                isActive: dto.isActive ?? true,
            });
            const created = await labRepo.save(lab);
            await this.logLabAudit(audit_log_entity_2.AuditAction.PLATFORM_LAB_CREATE, created.id, actor, {
                newValues: {
                    code: created.code,
                    name: created.name,
                    subdomain: created.subdomain,
                    timezone: created.timezone,
                    isActive: created.isActive,
                },
                description: `Created lab ${created.name} (${created.code})`,
            });
            return created;
        });
    }
    async updateLab(labId, dto, actor) {
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const labRepo = manager.getRepository(lab_entity_1.Lab);
            const lab = await labRepo.findOne({ where: { id: labId } });
            if (!lab) {
                throw new common_1.NotFoundException('Lab not found');
            }
            const oldValues = {
                code: lab.code,
                name: lab.name,
                subdomain: lab.subdomain,
                timezone: lab.timezone,
            };
            let nextCode = lab.code;
            let nextName = lab.name;
            let nextSubdomain = lab.subdomain;
            let nextTimezone = lab.timezone;
            if (dto.code !== undefined) {
                const normalizedCode = dto.code.trim().toUpperCase();
                if (!normalizedCode) {
                    throw new common_1.BadRequestException('code cannot be empty');
                }
                nextCode = normalizedCode;
            }
            if (dto.name !== undefined) {
                const normalizedName = dto.name.trim();
                if (!normalizedName) {
                    throw new common_1.BadRequestException('name cannot be empty');
                }
                nextName = normalizedName;
            }
            if (dto.subdomain !== undefined) {
                const normalizedSubdomain = dto.subdomain.trim().toLowerCase();
                if (!normalizedSubdomain) {
                    throw new common_1.BadRequestException('subdomain cannot be empty');
                }
                nextSubdomain = normalizedSubdomain;
            }
            if (dto.timezone !== undefined) {
                const normalizedTimezone = dto.timezone.trim();
                if (!normalizedTimezone) {
                    throw new common_1.BadRequestException('timezone cannot be empty');
                }
                nextTimezone = normalizedTimezone;
            }
            if (nextCode !== lab.code) {
                const existingByCode = await labRepo.findOne({ where: { code: nextCode } });
                if (existingByCode && existingByCode.id !== lab.id) {
                    throw new common_1.ConflictException(`Lab code "${nextCode}" already exists`);
                }
            }
            if (nextSubdomain && nextSubdomain !== lab.subdomain) {
                const existingBySubdomain = await labRepo.findOne({ where: { subdomain: nextSubdomain } });
                if (existingBySubdomain && existingBySubdomain.id !== lab.id) {
                    throw new common_1.ConflictException(`Subdomain "${nextSubdomain}" already exists`);
                }
            }
            lab.code = nextCode;
            lab.name = nextName;
            lab.subdomain = nextSubdomain;
            lab.timezone = nextTimezone;
            const updated = await labRepo.save(lab);
            await this.logLabAudit(audit_log_entity_2.AuditAction.PLATFORM_LAB_UPDATE, updated.id, actor, {
                oldValues,
                newValues: {
                    code: updated.code,
                    name: updated.name,
                    subdomain: updated.subdomain,
                    timezone: updated.timezone,
                },
                description: `Updated lab ${updated.name} (${updated.code})`,
            });
            return updated;
        });
    }
    async setLabStatus(labId, data, actor) {
        const reason = data.reason?.trim();
        if (!reason || reason.length < 3) {
            throw new common_1.BadRequestException('reason must be at least 3 characters');
        }
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const labRepo = manager.getRepository(lab_entity_1.Lab);
            const lab = await labRepo.findOne({ where: { id: labId } });
            if (!lab) {
                throw new common_1.NotFoundException('Lab not found');
            }
            const oldValues = { isActive: lab.isActive };
            lab.isActive = data.isActive;
            const updated = await labRepo.save(lab);
            await this.logLabAudit(audit_log_entity_2.AuditAction.PLATFORM_LAB_STATUS_CHANGE, updated.id, actor, {
                oldValues,
                newValues: { isActive: updated.isActive, reason },
                description: `${updated.isActive ? 'Enabled' : 'Disabled'} lab ${updated.name} (${updated.code})`,
            });
            return updated;
        });
    }
    async getSummary(params = {}, actor) {
        const scopeLabId = params.labId?.trim() || undefined;
        const { from, to } = this.resolveDashboardDateRange(params.dateFrom, params.dateTo);
        const { start: todayStart, end: todayEnd } = this.getTodayRange();
        const pendingStatuses = [order_test_entity_1.OrderTestStatus.PENDING, order_test_entity_1.OrderTestStatus.IN_PROGRESS];
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const inactiveThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const labRepo = manager.getRepository(lab_entity_1.Lab);
            const orderRepo = manager.getRepository(order_entity_1.Order);
            const orderTestRepo = manager.getRepository(order_test_entity_1.OrderTest);
            const patientRepo = manager.getRepository(patient_entity_1.Patient);
            const auditRepo = manager.getRepository(audit_log_entity_1.AuditLog);
            const totalLabsPromise = scopeLabId ? labRepo.count({ where: { id: scopeLabId } }) : labRepo.count();
            const activeLabsPromise = scopeLabId
                ? labRepo.count({ where: { id: scopeLabId, isActive: true } })
                : labRepo.count({ where: { isActive: true } });
            const totalPatientsPromise = patientRepo.count();
            const ordersCountQb = orderRepo.createQueryBuilder('o');
            if (scopeLabId) {
                ordersCountQb.where('o.labId = :labId', { labId: scopeLabId });
            }
            const ordersCountPromise = ordersCountQb.getCount();
            const ordersTodayQb = orderRepo
                .createQueryBuilder('o')
                .where('o.registeredAt >= :todayStart AND o.registeredAt <= :todayEnd', {
                todayStart,
                todayEnd,
            });
            if (scopeLabId) {
                ordersTodayQb.andWhere('o.labId = :labId', { labId: scopeLabId });
            }
            const ordersTodayCountPromise = ordersTodayQb.getCount();
            const pendingResultsQb = orderTestRepo
                .createQueryBuilder('ot')
                .innerJoin('ot.sample', 'sample')
                .innerJoin('sample.order', 'o')
                .where('ot.status IN (:...pendingStatuses)', { pendingStatuses })
                .andWhere('o.status != :cancelled', { cancelled: order_entity_1.OrderStatus.CANCELLED });
            if (scopeLabId) {
                pendingResultsQb.andWhere('o.labId = :labId', { labId: scopeLabId });
            }
            const pendingResultsCountPromise = pendingResultsQb.getCount();
            const completedTodayQb = orderTestRepo
                .createQueryBuilder('ot')
                .innerJoin('ot.sample', 'sample')
                .innerJoin('sample.order', 'o')
                .where('ot.status = :verifiedStatus', { verifiedStatus: order_test_entity_1.OrderTestStatus.VERIFIED })
                .andWhere('ot.verifiedAt >= :todayStart AND ot.verifiedAt <= :todayEnd', {
                todayStart,
                todayEnd,
            });
            if (scopeLabId) {
                completedTodayQb.andWhere('o.labId = :labId', { labId: scopeLabId });
            }
            const completedTodayCountPromise = completedTodayQb.getCount();
            const ordersByLabPromise = orderRepo
                .createQueryBuilder('o')
                .innerJoin('o.lab', 'lab')
                .leftJoin('o.samples', 'sample')
                .leftJoin('sample.orderTests', 'ot')
                .select('o.labId', 'labId')
                .addSelect('MAX(lab.code)', 'labCode')
                .addSelect('MAX(lab.name)', 'labName')
                .addSelect('COUNT(DISTINCT o.id)', 'ordersCount')
                .addSelect('COUNT(ot.id)', 'totalTestsCount')
                .addSelect('SUM(CASE WHEN ot.status = :verifiedStatus THEN 1 ELSE 0 END)', 'verifiedTestsCount')
                .addSelect('SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)', 'pendingResultsCount')
                .where('o.registeredAt >= :from AND o.registeredAt <= :to', {
                from,
                to,
                verifiedStatus: order_test_entity_1.OrderTestStatus.VERIFIED,
                pendingStatuses,
            })
                .andWhere(scopeLabId ? 'o.labId = :scopeLabId' : '1=1', { scopeLabId })
                .groupBy('o.labId')
                .orderBy('COUNT(DISTINCT o.id)', 'DESC')
                .limit(12)
                .getRawMany();
            const topTestsPromise = orderTestRepo
                .createQueryBuilder('ot')
                .innerJoin('ot.test', 'test')
                .innerJoin('ot.sample', 'sample')
                .innerJoin('sample.order', 'o')
                .select('test.id', 'testId')
                .addSelect('MAX(test.code)', 'testCode')
                .addSelect('MAX(test.name)', 'testName')
                .addSelect('COUNT(ot.id)', 'ordersCount')
                .addSelect('SUM(CASE WHEN ot.status = :verifiedStatus THEN 1 ELSE 0 END)', 'verifiedCount')
                .where('o.registeredAt >= :from AND o.registeredAt <= :to', {
                from,
                to,
                verifiedStatus: order_test_entity_1.OrderTestStatus.VERIFIED,
            })
                .andWhere(scopeLabId ? 'o.labId = :scopeLabId' : '1=1', { scopeLabId })
                .groupBy('test.id')
                .orderBy('COUNT(ot.id)', 'DESC')
                .addOrderBy('MAX(test.name)', 'ASC')
                .limit(8)
                .getRawMany();
            const trendRowsPromise = orderRepo
                .createQueryBuilder('o')
                .select("DATE_TRUNC('day', o.registeredAt)", 'day')
                .addSelect('COUNT(*)', 'ordersCount')
                .where('o.registeredAt >= :from AND o.registeredAt <= :to', { from, to })
                .andWhere(scopeLabId ? 'o.labId = :scopeLabId' : '1=1', { scopeLabId })
                .groupBy("DATE_TRUNC('day', o.registeredAt)")
                .orderBy("DATE_TRUNC('day', o.registeredAt)", 'ASC')
                .getRawMany();
            const inactiveLabsPromise = labRepo
                .createQueryBuilder('lab')
                .leftJoin(order_entity_1.Order, 'o', 'o.labId = lab.id')
                .select('lab.id', 'labId')
                .addSelect('lab.code', 'labCode')
                .addSelect('lab.name', 'labName')
                .addSelect('MAX(o.registeredAt)', 'lastOrderAt')
                .where('lab.isActive = true')
                .andWhere(scopeLabId ? 'lab.id = :scopeLabId' : '1=1', { scopeLabId })
                .groupBy('lab.id')
                .addGroupBy('lab.code')
                .addGroupBy('lab.name')
                .having('MAX(o.registeredAt) IS NULL OR MAX(o.registeredAt) < :inactiveThreshold', {
                inactiveThreshold,
            })
                .orderBy('MAX(o.registeredAt)', 'ASC', 'NULLS FIRST')
                .limit(8)
                .getRawMany();
            const highPendingLabsPromise = orderRepo
                .createQueryBuilder('o')
                .innerJoin('o.lab', 'lab')
                .leftJoin('o.samples', 'sample')
                .leftJoin('sample.orderTests', 'ot')
                .select('o.labId', 'labId')
                .addSelect('MAX(lab.code)', 'labCode')
                .addSelect('MAX(lab.name)', 'labName')
                .addSelect('COUNT(ot.id)', 'totalTestsCount')
                .addSelect('SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)', 'pendingResultsCount')
                .where('o.registeredAt >= :from AND o.registeredAt <= :to', { from, to, pendingStatuses })
                .andWhere(scopeLabId ? 'o.labId = :scopeLabId' : '1=1', { scopeLabId })
                .groupBy('o.labId')
                .having('COUNT(ot.id) > 0')
                .orderBy('SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)::float / NULLIF(COUNT(ot.id), 0)', 'DESC')
                .addOrderBy('COUNT(ot.id)', 'DESC')
                .limit(12)
                .getRawMany();
            const failedLoginCountsPromise = auditRepo
                .createQueryBuilder('audit')
                .select('audit."action"', 'action')
                .addSelect('COUNT(*)', 'count')
                .where('audit."createdAt" >= :since24h', { since24h })
                .andWhere('audit."action" IN (:...actions)', {
                actions: [audit_log_entity_2.AuditAction.LOGIN_FAILED, audit_log_entity_2.AuditAction.PLATFORM_LOGIN_FAILED],
            })
                .andWhere(scopeLabId ? 'audit."labId" = :scopeLabId' : '1=1', { scopeLabId })
                .groupBy('audit."action"')
                .getRawMany();
            const failedLoginsByLabPromise = auditRepo
                .createQueryBuilder('audit')
                .leftJoin(lab_entity_1.Lab, 'lab', 'lab.id = audit."labId"')
                .select('audit."labId"', 'labId')
                .addSelect('MAX(lab.code)', 'labCode')
                .addSelect('MAX(lab.name)', 'labName')
                .addSelect('COUNT(*)', 'failedCount')
                .where('audit."createdAt" >= :since24h', { since24h })
                .andWhere('audit."action" = :loginFailed', { loginFailed: audit_log_entity_2.AuditAction.LOGIN_FAILED })
                .andWhere(scopeLabId ? 'audit."labId" = :scopeLabId' : '1=1', { scopeLabId })
                .groupBy('audit."labId"')
                .orderBy('COUNT(*)', 'DESC')
                .limit(8)
                .getRawMany();
            const [labsCount, activeLabsCount, totalPatientsCount, ordersCount, ordersTodayCount, pendingResultsCount, completedTodayCount, ordersByLabRows, topTestsRows, trendRows, inactiveLabRows, highPendingRows, failedLoginRows, failedLoginsByLabRows,] = await Promise.all([
                totalLabsPromise,
                activeLabsPromise,
                totalPatientsPromise,
                ordersCountPromise,
                ordersTodayCountPromise,
                pendingResultsCountPromise,
                completedTodayCountPromise,
                ordersByLabPromise,
                topTestsPromise,
                trendRowsPromise,
                inactiveLabsPromise,
                highPendingLabsPromise,
                failedLoginCountsPromise,
                failedLoginsByLabPromise,
            ]);
            const ordersByLab = ordersByLabRows.map((row) => {
                const totalTestsCount = Number(row.totalTestsCount) || 0;
                const verifiedTestsCount = Number(row.verifiedTestsCount) || 0;
                const pendingCount = Number(row.pendingResultsCount) || 0;
                return {
                    labId: row.labId,
                    labCode: row.labCode || '-',
                    labName: row.labName || '-',
                    ordersCount: Number(row.ordersCount) || 0,
                    totalTestsCount,
                    verifiedTestsCount,
                    pendingResultsCount: pendingCount,
                    completionRate: totalTestsCount > 0 ? verifiedTestsCount / totalTestsCount : 0,
                };
            });
            const topTests = topTestsRows.map((row) => ({
                testId: row.testId,
                testCode: row.testCode || '-',
                testName: row.testName || '-',
                ordersCount: Number(row.ordersCount) || 0,
                verifiedCount: Number(row.verifiedCount) || 0,
            }));
            const inactiveLabs = inactiveLabRows.map((row) => {
                const lastOrderDate = row.lastOrderAt ? new Date(row.lastOrderAt) : null;
                const daysSinceLastOrder = lastOrderDate
                    ? Math.max(0, Math.floor((Date.now() - lastOrderDate.getTime()) / (24 * 60 * 60 * 1000)))
                    : null;
                return {
                    labId: row.labId,
                    labCode: row.labCode || '-',
                    labName: row.labName || '-',
                    lastOrderAt: lastOrderDate ? lastOrderDate.toISOString() : null,
                    daysSinceLastOrder,
                };
            });
            const highPendingLabs = highPendingRows
                .map((row) => {
                const totalTestsCount = Number(row.totalTestsCount) || 0;
                const pendingCount = Number(row.pendingResultsCount) || 0;
                const pendingRate = totalTestsCount > 0 ? pendingCount / totalTestsCount : 0;
                return {
                    labId: row.labId,
                    labCode: row.labCode || '-',
                    labName: row.labName || '-',
                    pendingResultsCount: pendingCount,
                    totalTestsCount,
                    pendingRate,
                };
            })
                .filter((item) => item.pendingResultsCount >= 5 && item.pendingRate >= 0.35)
                .slice(0, 6);
            const failedByAction = new Map(failedLoginRows.map((row) => [row.action, Number(row.count) || 0]));
            const platformFailed = failedByAction.get(audit_log_entity_2.AuditAction.PLATFORM_LOGIN_FAILED) ?? 0;
            const labFailed = failedByAction.get(audit_log_entity_2.AuditAction.LOGIN_FAILED) ?? 0;
            const failedByLab = failedLoginsByLabRows
                .filter((row) => Boolean(row.labId))
                .map((row) => ({
                labId: row.labId,
                labCode: row.labCode || '-',
                labName: row.labName || '-',
                failedCount: Number(row.failedCount) || 0,
            }));
            const summary = {
                labsCount,
                activeLabsCount,
                totalPatientsCount,
                ordersCount,
                ordersTodayCount,
                pendingResultsCount,
                completedTodayCount,
                dateRange: {
                    from: from.toISOString(),
                    to: to.toISOString(),
                },
                ordersTrend: this.buildOrderTrend(from, to, trendRows),
                topTests,
                ordersByLab,
                alerts: {
                    inactiveLabs,
                    highPendingLabs,
                    failedLoginsLast24h: {
                        totalCount: platformFailed + labFailed,
                        platformCount: platformFailed,
                        labCount: labFailed,
                        byLab: failedByLab,
                    },
                },
            };
            await this.logPlatformSensitiveRead(actor, {
                labId: scopeLabId ?? null,
                entityType: 'dashboard',
                entityId: null,
                description: `Viewed dashboard summary (${scopeLabId ? `lab ${scopeLabId}` : 'all labs'})`,
                metadata: {
                    filters: {
                        labId: scopeLabId ?? null,
                        from: from.toISOString(),
                        to: to.toISOString(),
                    },
                    totals: {
                        labsCount,
                        ordersCount,
                        pendingResultsCount,
                    },
                },
            });
            return summary;
        });
    }
    async listOrdersByLab(params) {
        if (!params.labId) {
            throw new common_1.BadRequestException('labId is required');
        }
        const result = await this.listOrders({
            labId: params.labId,
            page: params.page,
            size: params.size,
        });
        return {
            items: result.items,
            total: result.total,
            page: result.page,
            size: result.size,
            totalPages: result.totalPages,
        };
    }
    async listOrders(params, actor) {
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(200, Math.max(1, params.size ?? 25));
        const skip = (page - 1) * size;
        if (params.status && !Object.values(order_entity_1.OrderStatus).includes(params.status)) {
            throw new common_1.BadRequestException('Invalid status');
        }
        if (params.dateFrom && Number.isNaN(Date.parse(params.dateFrom))) {
            throw new common_1.BadRequestException('Invalid dateFrom');
        }
        if (params.dateTo && Number.isNaN(Date.parse(params.dateTo))) {
            throw new common_1.BadRequestException('Invalid dateTo');
        }
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const orderRepo = manager.getRepository(order_entity_1.Order);
            const idsQb = orderRepo
                .createQueryBuilder('o')
                .leftJoin('o.patient', 'patient')
                .leftJoin('o.samples', 'samples');
            if (params.labId) {
                idsQb.andWhere('o.labId = :labId', { labId: params.labId });
            }
            if (params.status) {
                idsQb.andWhere('o.status = :status', { status: params.status });
            }
            if (params.q?.trim()) {
                const q = `%${params.q.trim()}%`;
                idsQb.andWhere('(o.orderNumber ILIKE :q OR patient.fullName ILIKE :q OR patient.phone ILIKE :q OR patient.nationalId ILIKE :q OR samples.barcode ILIKE :q)', { q });
            }
            if (params.dateFrom) {
                idsQb.andWhere('o.registeredAt >= :dateFrom', { dateFrom: new Date(params.dateFrom) });
            }
            if (params.dateTo) {
                idsQb.andWhere('o.registeredAt <= :dateTo', { dateTo: new Date(params.dateTo) });
            }
            const countRow = await idsQb
                .clone()
                .select('COUNT(DISTINCT o.id)', 'count')
                .getRawOne();
            const total = Number(countRow?.count ?? 0);
            const idRows = await idsQb
                .clone()
                .select('o.id', 'id')
                .addSelect('MAX(o.registeredAt)', 'registeredAt')
                .groupBy('o.id')
                .orderBy('MAX(o.registeredAt)', 'DESC')
                .addOrderBy('o.id', 'DESC')
                .offset(skip)
                .limit(size)
                .getRawMany();
            const ids = idRows.map((row) => row.id);
            if (ids.length === 0) {
                const emptyResult = {
                    items: [],
                    total,
                    page,
                    size,
                    totalPages: Math.ceil(total / size),
                };
                await this.logPlatformSensitiveRead(actor, {
                    labId: params.labId ?? null,
                    entityType: 'order',
                    entityId: null,
                    description: 'Viewed orders list (no matching rows)',
                    metadata: {
                        filters: {
                            labId: params.labId ?? null,
                            status: params.status ?? null,
                            q: params.q ?? null,
                            dateFrom: params.dateFrom ?? null,
                            dateTo: params.dateTo ?? null,
                        },
                        page,
                        size,
                        total,
                    },
                });
                return emptyResult;
            }
            const orders = await orderRepo.find({
                where: { id: (0, typeorm_1.In)(ids) },
                relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests'],
            });
            const orderById = new Map(orders.map((order) => [order.id, order]));
            const sortedOrders = ids
                .map((id) => orderById.get(id))
                .filter((order) => Boolean(order));
            const result = {
                items: sortedOrders.map((order) => this.toAdminOrderListItem(order)),
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            };
            await this.logPlatformSensitiveRead(actor, {
                labId: params.labId ?? null,
                entityType: 'order',
                entityId: null,
                description: `Viewed orders list (${result.items.length} rows on page ${page})`,
                metadata: {
                    filters: {
                        labId: params.labId ?? null,
                        status: params.status ?? null,
                        q: params.q ?? null,
                        dateFrom: params.dateFrom ?? null,
                        dateTo: params.dateTo ?? null,
                    },
                    page,
                    size,
                    total,
                },
            });
            return result;
        });
    }
    async getOrderDetail(orderId, actor) {
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const order = await manager.getRepository(order_entity_1.Order).findOne({
                where: { id: orderId },
                relations: [
                    'patient',
                    'lab',
                    'shift',
                    'samples',
                    'samples.orderTests',
                    'samples.orderTests.test',
                ],
            });
            if (!order) {
                throw new common_1.NotFoundException('Order not found');
            }
            const tests = order.samples?.flatMap((sample) => sample.orderTests ?? []) ?? [];
            const testsCount = tests.length;
            const verifiedTestsCount = tests.filter((test) => test.status === 'VERIFIED').length;
            const completedTestsCount = tests.filter((test) => test.status === 'COMPLETED').length;
            const pendingTestsCount = tests.filter((test) => test.status === 'PENDING' || test.status === 'IN_PROGRESS').length;
            const hasCriticalFlag = tests.some((test) => test.flag === 'HH' || test.flag === 'LL');
            const lastVerifiedAt = tests
                .map((test) => test.verifiedAt)
                .filter((value) => Boolean(value))
                .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
            const detail = {
                id: order.id,
                labId: order.labId,
                orderNumber: order.orderNumber,
                status: order.status,
                patientType: order.patientType,
                notes: order.notes,
                paymentStatus: order.paymentStatus,
                paidAmount: order.paidAmount,
                totalAmount: Number(order.totalAmount ?? 0),
                finalAmount: Number(order.finalAmount ?? 0),
                registeredAt: order.registeredAt,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                patient: order.patient,
                lab: order.lab,
                shift: order.shift,
                samples: order.samples ?? [],
                testsCount,
                verifiedTestsCount,
                completedTestsCount,
                pendingTestsCount,
                hasCriticalFlag,
                lastVerifiedAt,
            };
            await this.logPlatformSensitiveRead(actor, {
                labId: order.labId,
                entityType: 'order',
                entityId: order.id,
                description: `Viewed order detail ${order.orderNumber ?? order.id}`,
            });
            return detail;
        });
    }
    async generateOrderResultsPdf(orderId, actor) {
        const order = await this.getOrderDetail(orderId);
        const pdfBuffer = await this.reportsService.generateTestResultsPDF(orderId, order.labId, {
            bypassPaymentCheck: true,
        });
        if (actor?.platformUserId) {
            await this.auditService.log({
                actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
                actorId: actor.platformUserId,
                labId: order.labId,
                action: audit_log_entity_2.AuditAction.REPORT_EXPORT,
                entityType: 'order',
                entityId: orderId,
                description: `Platform admin exported test results PDF for order ${orderId}`,
                ipAddress: actor.ipAddress ?? null,
                userAgent: actor.userAgent ?? null,
            });
        }
        return {
            pdfBuffer,
            fileName: `results-${orderId.substring(0, 8)}.pdf`,
        };
    }
    async listAuditLogs(params) {
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(200, Math.max(1, params.size ?? 50));
        const skip = (page - 1) * size;
        this.validateAuditLogFilters(params);
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const qb = this.buildAuditLogsQuery(manager, params);
            const [items, total] = await qb
                .orderBy('audit.createdAt', 'DESC')
                .skip(skip)
                .take(size)
                .getManyAndCount();
            return {
                items,
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            };
        });
    }
    async exportAuditLogsCsv(params, actor) {
        const reason = params.reason?.trim();
        if (!reason || reason.length < 3) {
            throw new common_1.BadRequestException('reason must be at least 3 characters');
        }
        this.validateAuditLogFilters(params);
        const maxRows = Math.min(5000, Math.max(1, params.maxRows ?? 2000));
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const qb = this.buildAuditLogsQuery(manager, params);
            const items = await qb
                .orderBy('audit.createdAt', 'DESC')
                .take(maxRows)
                .getMany();
            const csv = this.toAuditLogsCsv(items);
            const fileDate = new Date().toISOString().slice(0, 10);
            const scope = params.labId ? `lab-${params.labId.substring(0, 8)}` : 'all-labs';
            const fileName = `audit-logs-${scope}-${fileDate}.csv`;
            if (actor?.platformUserId) {
                await this.auditService.log({
                    actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
                    actorId: actor.platformUserId,
                    labId: params.labId ?? null,
                    action: audit_log_entity_2.AuditAction.REPORT_EXPORT,
                    entityType: 'audit_log',
                    entityId: null,
                    description: `Exported audit logs CSV (${items.length} rows). Reason: ${reason}`,
                    newValues: {
                        reason,
                        exportedRows: items.length,
                        maxRows,
                        filters: {
                            labId: params.labId ?? null,
                            actorType: params.actorType ?? null,
                            action: params.action ?? null,
                            entityType: params.entityType ?? null,
                            search: params.search ?? null,
                            dateFrom: params.dateFrom ?? null,
                            dateTo: params.dateTo ?? null,
                        },
                    },
                    ipAddress: actor.ipAddress ?? null,
                    userAgent: actor.userAgent ?? null,
                });
            }
            return {
                csvBuffer: Buffer.from(csv, 'utf8'),
                fileName,
            };
        });
    }
    async getAuditActionOptions() {
        return Object.values(audit_log_entity_2.AuditAction);
    }
    async getAuditEntityTypeOptions(params = {}) {
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const qb = manager
                .getRepository(audit_log_entity_1.AuditLog)
                .createQueryBuilder('audit')
                .select('DISTINCT audit."entityType"', 'entityType')
                .where('audit."entityType" IS NOT NULL');
            if (params.labId) {
                qb.andWhere('audit."labId" = :labId', { labId: params.labId });
            }
            const rows = await qb
                .orderBy('audit."entityType"', 'ASC')
                .getRawMany();
            return rows
                .map((row) => row.entityType)
                .filter((value) => typeof value === 'string' && value.length > 0);
        });
    }
    validateAuditLogFilters(params) {
        if (params.actorType && !Object.values(audit_log_entity_2.AuditActorType).includes(params.actorType)) {
            throw new common_1.BadRequestException('Invalid actorType');
        }
        if (params.action && !Object.values(audit_log_entity_2.AuditAction).includes(params.action)) {
            throw new common_1.BadRequestException('Invalid action');
        }
        if (params.dateFrom && Number.isNaN(Date.parse(params.dateFrom))) {
            throw new common_1.BadRequestException('Invalid dateFrom');
        }
        if (params.dateTo && Number.isNaN(Date.parse(params.dateTo))) {
            throw new common_1.BadRequestException('Invalid dateTo');
        }
        if (params.dateFrom && params.dateTo && new Date(params.dateFrom) > new Date(params.dateTo)) {
            throw new common_1.BadRequestException('dateFrom cannot be greater than dateTo');
        }
    }
    buildAuditLogsQuery(manager, params) {
        const qb = manager
            .getRepository(audit_log_entity_1.AuditLog)
            .createQueryBuilder('audit')
            .leftJoinAndSelect('audit.user', 'user')
            .leftJoinAndSelect('audit.lab', 'lab');
        if (params.labId) {
            qb.andWhere('audit."labId" = :labId', { labId: params.labId });
        }
        if (params.actorType) {
            qb.andWhere('audit."actorType" = :actorType', { actorType: params.actorType });
        }
        if (params.action) {
            qb.andWhere('audit."action" = :action', { action: params.action });
        }
        if (params.entityType) {
            qb.andWhere('audit."entityType" = :entityType', { entityType: params.entityType });
        }
        if (params.dateFrom) {
            qb.andWhere('audit."createdAt" >= :dateFrom', { dateFrom: new Date(params.dateFrom) });
        }
        if (params.dateTo) {
            qb.andWhere('audit."createdAt" <= :dateTo', { dateTo: new Date(params.dateTo) });
        }
        if (params.search?.trim()) {
            const q = `%${params.search.trim()}%`;
            qb.andWhere(`(audit."description" ILIKE :q
          OR CAST(audit."action" AS text) ILIKE :q
          OR COALESCE(audit."entityType", '') ILIKE :q
          OR COALESCE(audit."entityId"::text, '') ILIKE :q
          OR COALESCE(audit."actorId"::text, '') ILIKE :q
          OR COALESCE(user.username, '') ILIKE :q
          OR COALESCE(user.fullName, '') ILIKE :q
          OR COALESCE(lab.name, '') ILIKE :q
          OR COALESCE(lab.code, '') ILIKE :q)`, { q });
        }
        return qb;
    }
    toAuditLogsCsv(items) {
        const headers = [
            'timestamp',
            'actorType',
            'actorId',
            'actorUsername',
            'actorName',
            'labCode',
            'labName',
            'action',
            'entityType',
            'entityId',
            'description',
            'ipAddress',
            'userAgent',
            'oldValues',
            'newValues',
        ];
        const rows = items.map((item) => [
            item.createdAt?.toISOString() ?? '',
            item.actorType ?? '',
            item.actorId ?? '',
            item.user?.username ?? '',
            item.user?.fullName ?? '',
            item.lab?.code ?? '',
            item.lab?.name ?? '',
            item.action ?? '',
            item.entityType ?? '',
            item.entityId ?? '',
            item.description ?? '',
            item.ipAddress ?? '',
            item.userAgent ?? '',
            item.oldValues ? JSON.stringify(item.oldValues) : '',
            item.newValues ? JSON.stringify(item.newValues) : '',
        ]);
        const csvLines = [headers, ...rows].map((row) => row.map((cell) => this.csvEscape(cell)).join(','));
        return csvLines.join('\n');
    }
    csvEscape(value) {
        const text = String(value ?? '');
        return `"${text.replace(/"/g, '""')}"`;
    }
    async getSystemHealth() {
        const checkedAt = new Date().toISOString();
        const uptimeSeconds = Math.floor(process.uptime());
        const environment = process.env.NODE_ENV || 'development';
        try {
            const dbInfo = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
                const rows = await manager.query(`SELECT now() AS "now"`);
                const serverTime = rows?.[0]?.now ? new Date(rows[0].now).toISOString() : null;
                return {
                    connected: true,
                    serverTime,
                    error: null,
                };
            });
            return {
                status: 'ok',
                checkedAt,
                uptimeSeconds,
                environment,
                db: dbInfo,
            };
        }
        catch (error) {
            return {
                status: 'degraded',
                checkedAt,
                uptimeSeconds,
                environment,
                db: {
                    connected: false,
                    serverTime: null,
                    error: error instanceof Error ? error.message : String(error),
                },
            };
        }
    }
    async getPlatformSettingsOverview() {
        const [enabledAccounts, totalAccounts] = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const enabledRows = await manager.query(`SELECT COUNT(*)::int AS "count" FROM "platform_users" WHERE "isActive" = true AND "mfaSecret" IS NOT NULL`);
            const totalRows = await manager.query(`SELECT COUNT(*)::int AS "count" FROM "platform_users" WHERE "isActive" = true`);
            return [
                Number(enabledRows?.[0]?.count ?? 0),
                Number(totalRows?.[0]?.count ?? 0),
            ];
        });
        return {
            branding: {
                logoUploadEnabled: false,
                themeColor: '#1677ff',
            },
            securityPolicy: {
                sessionTimeoutMinutes: Number(process.env.PLATFORM_SESSION_TIMEOUT_MINUTES || 30),
                passwordMinLength: Number(process.env.PLATFORM_PASSWORD_MIN_LENGTH || 8),
                requireStrongPassword: process.env.PLATFORM_REQUIRE_STRONG_PASSWORD !== 'false',
            },
            mfa: {
                mode: (process.env.PLATFORM_MFA_MODE === 'required' ? 'REQUIRED' : 'OPTIONAL'),
                enabledAccounts,
                totalAccounts,
            },
        };
    }
    async getSettingsRoles() {
        return this.settingsService.getRoles();
    }
    async getLabSettings(labId, actor) {
        const settings = await this.settingsService.getLabSettings(labId);
        await this.logPlatformSensitiveRead(actor, {
            labId,
            entityType: 'lab_settings',
            entityId: labId,
            description: `Viewed lab settings for ${settings.name} (${settings.code})`,
        });
        return settings;
    }
    async updateLabSettings(labId, data) {
        return this.settingsService.updateLabSettings(labId, data);
    }
    async getLabUsers(labId, actor) {
        const users = await this.settingsService.getUsersForLab(labId);
        await this.logPlatformSensitiveRead(actor, {
            labId,
            entityType: 'user',
            entityId: null,
            description: `Viewed lab users list (${users.length} users)`,
            metadata: { usersCount: users.length },
        });
        return users;
    }
    async getLabUser(userId, labId, actor) {
        const detail = await this.settingsService.getUserWithDetails(userId, labId);
        await this.logPlatformSensitiveRead(actor, {
            labId,
            entityType: 'user',
            entityId: userId,
            description: `Viewed lab user details for ${detail.user.username}`,
        });
        return detail;
    }
    async createLabUser(labId, data) {
        return this.settingsService.createUser(labId, data);
    }
    async updateLabUser(userId, labId, data) {
        return this.settingsService.updateUser(userId, labId, data);
    }
    async deleteLabUser(userId, labId) {
        await this.settingsService.deleteUser(userId, labId, '__platform_admin__');
        return { success: true };
    }
    async resetLabUserPassword(userId, labId, data, actor) {
        const password = data.password?.trim();
        const reason = data.reason?.trim();
        if (!password || password.length < 8) {
            throw new common_1.BadRequestException('password must be at least 8 characters');
        }
        if (!reason || reason.length < 3) {
            throw new common_1.BadRequestException('reason must be at least 3 characters');
        }
        const detail = await this.settingsService.getUserWithDetails(userId, labId);
        await this.settingsService.updateUser(userId, labId, { password });
        if (actor?.platformUserId) {
            await this.auditService.log({
                actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
                actorId: actor.platformUserId,
                labId,
                action: audit_log_entity_2.AuditAction.USER_UPDATE,
                entityType: 'user',
                entityId: userId,
                description: `Platform admin reset password for lab user ${detail.user.username}`,
                newValues: {
                    operation: 'RESET_PASSWORD',
                    reason,
                },
                ipAddress: actor.ipAddress ?? null,
                userAgent: actor.userAgent ?? null,
            });
        }
        return { success: true };
    }
    async getImpersonationStatus(user) {
        const impersonatedLabId = user.impersonatedLabId?.trim() || null;
        if (!impersonatedLabId) {
            return { active: false, labId: null, lab: null };
        }
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const lab = await manager.getRepository(lab_entity_1.Lab).findOne({ where: { id: impersonatedLabId } });
            return {
                active: true,
                labId: impersonatedLabId,
                lab: lab
                    ? {
                        id: lab.id,
                        code: lab.code,
                        name: lab.name,
                        subdomain: lab.subdomain,
                        isActive: lab.isActive,
                    }
                    : null,
            };
        });
    }
    async startImpersonation(data, actor) {
        const reason = data.reason?.trim();
        if (!reason || reason.length < 3) {
            throw new common_1.BadRequestException('reason must be at least 3 characters');
        }
        const lab = await this.rlsSessionService.withPlatformAdminContext(async (manager) => manager.getRepository(lab_entity_1.Lab).findOne({ where: { id: data.labId } }));
        if (!lab) {
            throw new common_1.NotFoundException('Lab not found');
        }
        if (!lab.isActive) {
            throw new common_1.BadRequestException('Cannot impersonate a disabled lab');
        }
        const issued = await this.adminAuthService.issueAccessTokenByPlatformUserId(actor.platformUserId, {
            impersonatedLabId: lab.id,
        });
        await this.auditService.log({
            actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
            actorId: actor.platformUserId,
            labId: lab.id,
            action: audit_log_entity_2.AuditAction.PLATFORM_IMPERSONATE_START,
            entityType: 'lab',
            entityId: lab.id,
            description: `Platform admin started impersonation for lab ${lab.name} (${lab.code})`,
            newValues: {
                reason,
                previousImpersonatedLabId: actor.impersonatedLabId ?? null,
            },
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
        });
        return {
            accessToken: issued.accessToken,
            impersonation: {
                active: true,
                labId: lab.id,
                lab: {
                    id: lab.id,
                    code: lab.code,
                    name: lab.name,
                    subdomain: lab.subdomain,
                    isActive: lab.isActive,
                },
            },
        };
    }
    async stopImpersonation(actor) {
        const previousLabId = actor.impersonatedLabId?.trim() || null;
        const issued = await this.adminAuthService.issueAccessTokenByPlatformUserId(actor.platformUserId, {
            impersonatedLabId: null,
        });
        if (previousLabId) {
            await this.auditService.log({
                actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
                actorId: actor.platformUserId,
                labId: previousLabId,
                action: audit_log_entity_2.AuditAction.PLATFORM_IMPERSONATE_STOP,
                entityType: 'lab',
                entityId: previousLabId,
                description: `Platform admin stopped impersonation for lab ${previousLabId}`,
                ipAddress: actor.ipAddress ?? null,
                userAgent: actor.userAgent ?? null,
            });
        }
        return {
            accessToken: issued.accessToken,
            impersonation: {
                active: false,
                labId: null,
                lab: null,
            },
        };
    }
    async createImpersonatedLabPortalToken(actor) {
        const impersonatedLabId = actor.impersonatedLabId?.trim() || null;
        if (!impersonatedLabId) {
            throw new common_1.BadRequestException('Impersonation is not active');
        }
        const lab = await this.rlsSessionService.withPlatformAdminContext(async (manager) => manager.getRepository(lab_entity_1.Lab).findOne({ where: { id: impersonatedLabId } }));
        if (!lab || !lab.isActive) {
            throw new common_1.NotFoundException('Impersonated lab is not available');
        }
        return this.authService.issueLabPortalBridgeToken({
            platformUserId: actor.platformUserId,
            labId: impersonatedLabId,
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
        });
    }
    async getLabShifts(labId) {
        return this.settingsService.getShiftsForLab(labId);
    }
    async getLabDepartments(labId) {
        return this.settingsService.getDepartmentsForLab(labId);
    }
    async toAdminLabListItems(manager, labs) {
        if (!labs.length) {
            return [];
        }
        const labIds = labs.map((lab) => lab.id);
        const userRows = await manager
            .getRepository(user_lab_assignment_entity_1.UserLabAssignment)
            .createQueryBuilder('ula')
            .select('ula.labId', 'labId')
            .addSelect('COUNT(DISTINCT ula.userId)', 'usersCount')
            .where('ula.labId IN (:...labIds)', { labIds })
            .groupBy('ula.labId')
            .getRawMany();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const ordersRows = await manager
            .getRepository(order_entity_1.Order)
            .createQueryBuilder('o')
            .select('o.labId', 'labId')
            .addSelect('COUNT(*)', 'orders30dCount')
            .where('o.labId IN (:...labIds)', { labIds })
            .andWhere('o.registeredAt >= :thirtyDaysAgo', { thirtyDaysAgo })
            .groupBy('o.labId')
            .getRawMany();
        const usersByLab = new Map(userRows.map((row) => [row.labId, Number(row.usersCount) || 0]));
        const ordersByLab = new Map(ordersRows.map((row) => [row.labId, Number(row.orders30dCount) || 0]));
        return labs.map((lab) => ({
            ...lab,
            usersCount: usersByLab.get(lab.id) ?? 0,
            orders30dCount: ordersByLab.get(lab.id) ?? 0,
        }));
    }
    resolveDashboardDateRange(rawDateFrom, rawDateTo) {
        const now = new Date();
        const defaultTo = new Date(now);
        const defaultFrom = new Date(defaultTo.getTime() - 29 * 24 * 60 * 60 * 1000);
        const from = rawDateFrom ? new Date(rawDateFrom) : defaultFrom;
        const to = rawDateTo ? new Date(rawDateTo) : defaultTo;
        if (Number.isNaN(from.getTime())) {
            throw new common_1.BadRequestException('Invalid dateFrom');
        }
        if (Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid dateTo');
        }
        if (from > to) {
            throw new common_1.BadRequestException('dateFrom cannot be greater than dateTo');
        }
        const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
        if (rangeDays > 120) {
            throw new common_1.BadRequestException('Date range too large (max 120 days)');
        }
        return { from, to };
    }
    getTodayRange() {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }
    buildOrderTrend(from, to, rows) {
        const countsByDate = new Map();
        for (const row of rows) {
            const key = this.normalizeDateKey(row.day);
            countsByDate.set(key, Number(row.ordersCount) || 0);
        }
        const trend = [];
        const cursor = new Date(from);
        cursor.setHours(0, 0, 0, 0);
        const end = new Date(to);
        end.setHours(0, 0, 0, 0);
        while (cursor.getTime() <= end.getTime()) {
            const key = this.normalizeDateKey(cursor);
            trend.push({
                date: key,
                ordersCount: countsByDate.get(key) ?? 0,
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        return trend;
    }
    normalizeDateKey(value) {
        const date = value instanceof Date ? value : new Date(value);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    toSubdomainFromCode(code) {
        return code.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    }
    toAdminOrderListItem(order) {
        const tests = order.samples?.flatMap((sample) => sample.orderTests ?? []) ?? [];
        const verifiedTestsCount = tests.filter((test) => test.status === 'VERIFIED').length;
        const hasCriticalFlag = tests.some((test) => test.flag === 'HH' || test.flag === 'LL');
        const firstBarcode = order.samples?.find((sample) => Boolean(sample.barcode))?.barcode ?? null;
        return {
            id: order.id,
            labId: order.labId,
            labCode: order.lab?.code ?? null,
            labName: order.lab?.name ?? null,
            orderNumber: order.orderNumber,
            status: order.status,
            registeredAt: order.registeredAt,
            patientId: order.patientId,
            patientName: order.patient?.fullName ?? null,
            patientPhone: order.patient?.phone ?? null,
            paymentStatus: order.paymentStatus ?? null,
            finalAmount: Number(order.finalAmount ?? 0),
            testsCount: tests.length,
            verifiedTestsCount,
            hasCriticalFlag,
            barcode: firstBarcode,
        };
    }
    async logPlatformSensitiveRead(actor, payload) {
        if (!actor?.platformUserId)
            return;
        await this.auditService.log({
            actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
            actorId: actor.platformUserId,
            labId: payload.labId ?? null,
            action: audit_log_entity_2.AuditAction.PLATFORM_SENSITIVE_READ,
            entityType: payload.entityType,
            entityId: payload.entityId ?? null,
            description: payload.description,
            newValues: payload.metadata ?? null,
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
        });
    }
    async logLabAudit(action, labId, actor, payload) {
        if (!actor?.platformUserId)
            return;
        await this.auditService.log({
            actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
            actorId: actor.platformUserId,
            action,
            entityType: 'lab',
            entityId: labId,
            labId,
            oldValues: payload.oldValues ?? null,
            newValues: payload.newValues ?? null,
            description: payload.description,
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
        });
    }
};
exports.PlatformAdminService = PlatformAdminService;
exports.PlatformAdminService = PlatformAdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rls_session_service_1.RlsSessionService,
        settings_service_1.SettingsService,
        audit_service_1.AuditService,
        reports_service_1.ReportsService,
        admin_auth_service_1.AdminAuthService,
        auth_service_1.AuthService])
], PlatformAdminService);
//# sourceMappingURL=platform-admin.service.js.map