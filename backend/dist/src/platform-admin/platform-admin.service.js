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
var PlatformAdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformAdminService = void 0;
const common_1 = require("@nestjs/common");
const lab_entity_1 = require("../entities/lab.entity");
const order_entity_1 = require("../entities/order.entity");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const rls_session_service_1 = require("../database/rls-session.service");
const settings_service_1 = require("../settings/settings.service");
const shift_entity_1 = require("../entities/shift.entity");
const department_entity_1 = require("../entities/department.entity");
const user_lab_assignment_entity_1 = require("../entities/user-lab-assignment.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_2 = require("../entities/audit-log.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const patient_entity_1 = require("../entities/patient.entity");
const test_entity_1 = require("../entities/test.entity");
const pricing_entity_1 = require("../entities/pricing.entity");
const test_component_entity_1 = require("../entities/test-component.entity");
const reports_service_1 = require("../reports/reports.service");
const report_style_config_1 = require("../reports/report-style.config");
const platform_setting_entity_1 = require("../entities/platform-setting.entity");
const typeorm_1 = require("typeorm");
const admin_auth_service_1 = require("../admin-auth/admin-auth.service");
const auth_service_1 = require("../auth/auth.service");
const auth_session_config_1 = require("../config/auth-session.config");
const order_test_flag_util_1 = require("../order-tests/order-test-flag.util");
const normal_range_util_1 = require("../tests/normal-range.util");
const MAX_REPORT_IMAGE_DATA_URL_LENGTH = 4 * 1024 * 1024;
const REPORT_IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[a-zA-Z0-9+/=]+$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DASHBOARD_ANNOUNCEMENT_TEXT_LENGTH = 255;
const GLOBAL_DASHBOARD_ANNOUNCEMENT_KEY = 'dashboard.announcement.all_labs';
const DEFAULT_CREATE_LAB_TIMEZONE = 'Asia/Baghdad';
let PlatformAdminService = PlatformAdminService_1 = class PlatformAdminService {
    constructor(rlsSessionService, settingsService, auditService, reportsService, adminAuthService, authService) {
        this.rlsSessionService = rlsSessionService;
        this.settingsService = settingsService;
        this.auditService = auditService;
        this.reportsService = reportsService;
        this.adminAuthService = adminAuthService;
        this.authService = authService;
        this.logger = new common_1.Logger(PlatformAdminService_1.name);
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
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const lab = await manager.getRepository(lab_entity_1.Lab).findOne({ where: { id: labId } });
            if (!lab) {
                throw new common_1.NotFoundException('Lab not found');
            }
            const [item] = await this.toAdminLabListItems(manager, [lab]);
            await this.logPlatformSensitiveRead(actor, {
                labId,
                entityType: 'lab',
                entityId: labId,
                description: `Viewed lab details for ${item.name} (${item.code})`,
            }, manager);
            return item;
        });
    }
    async createLab(dto, actor) {
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const labRepo = manager.getRepository(lab_entity_1.Lab);
            const code = dto.code.trim().toUpperCase();
            const name = dto.name.trim();
            const subdomain = (dto.subdomain?.trim().toLowerCase() || this.toSubdomainFromCode(code));
            const timezone = dto.timezone?.trim() || DEFAULT_CREATE_LAB_TIMEZONE;
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
            }, manager);
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
            }, manager);
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
            }, manager);
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
            }, manager);
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
                }, manager);
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
            }, manager);
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
            for (const test of tests) {
                test.flag = (0, order_test_flag_util_1.normalizeOrderTestFlag)(test.flag ?? null);
            }
            const testsCount = tests.length;
            const verifiedTestsCount = tests.filter((test) => test.status === 'VERIFIED').length;
            const completedTestsCount = tests.filter((test) => test.status === 'COMPLETED').length;
            const pendingTestsCount = tests.filter((test) => test.status === 'PENDING' || test.status === 'IN_PROGRESS').length;
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
                lastVerifiedAt,
            };
            await this.logPlatformSensitiveRead(actor, {
                labId: order.labId,
                entityType: 'order',
                entityId: order.id,
                description: `Viewed order detail ${order.orderNumber ?? order.id}`,
            }, manager);
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
    async generateLabReportPreviewPdf(labId, payload) {
        const orderId = this.normalizeUuidV4(payload.orderId, 'orderId');
        const reportBranding = this.normalizePreviewReportBranding(payload.reportBranding);
        const reportStyle = this.normalizePreviewReportStyle(payload.reportStyle);
        const pdfBuffer = await this.reportsService.generateDraftTestResultsPreviewPDF({
            orderId,
            labId,
            reportBranding,
            reportStyle,
        });
        return {
            pdfBuffer,
            fileName: `report-preview-${orderId.substring(0, 8)}.pdf`,
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
                }, manager);
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
                sessionTimeoutMinutes: auth_session_config_1.PLATFORM_ACCESS_TOKEN_TTL_MINUTES,
                accessTokenLifetimeMinutes: auth_session_config_1.PLATFORM_ACCESS_TOKEN_TTL_MINUTES,
                refreshTokenLifetimeDays: auth_session_config_1.REFRESH_TOKEN_TTL_DAYS,
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
    async getGlobalDashboardAnnouncement(actor) {
        const setting = await this.rlsSessionService.withPlatformAdminContext(async (manager) => manager.getRepository(platform_setting_entity_1.PlatformSetting).findOne({
            where: { key: GLOBAL_DASHBOARD_ANNOUNCEMENT_KEY },
        }));
        await this.logPlatformSensitiveRead(actor, {
            labId: null,
            entityType: 'platform_setting',
            entityId: GLOBAL_DASHBOARD_ANNOUNCEMENT_KEY,
            description: 'Viewed global dashboard announcement',
        });
        return {
            dashboardAnnouncementText: this.normalizeDashboardAnnouncementText(setting?.valueText),
        };
    }
    async updateGlobalDashboardAnnouncement(data) {
        const normalized = this.normalizeDashboardAnnouncementText(data.dashboardAnnouncementText);
        await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const repo = manager.getRepository(platform_setting_entity_1.PlatformSetting);
            let setting = await repo.findOne({
                where: { key: GLOBAL_DASHBOARD_ANNOUNCEMENT_KEY },
            });
            if (!setting) {
                setting = repo.create({
                    key: GLOBAL_DASHBOARD_ANNOUNCEMENT_KEY,
                });
            }
            setting.valueText = normalized;
            await repo.save(setting);
        });
        this.logger.log(JSON.stringify({
            event: 'admin.platform_announcement.update',
            key: GLOBAL_DASHBOARD_ANNOUNCEMENT_KEY,
            hasText: Boolean(normalized),
        }));
        return {
            dashboardAnnouncementText: normalized,
        };
    }
    async getLabSettings(labId, actor) {
        const settings = await this.settingsService.getLabSettings(labId);
        await this.logPlatformSensitiveRead(actor, {
            labId,
            entityType: 'lab_settings',
            entityId: labId,
            description: `Viewed lab settings for ${settings.name} (${settings.code})`,
        });
        return this.toAdminLabSettingsSummary(settings);
    }
    async getLabReportDesign(labId, actor) {
        const settings = await this.settingsService.getLabSettings(labId);
        await this.logPlatformSensitiveRead(actor, {
            labId,
            entityType: 'lab_report_design',
            entityId: labId,
            description: `Viewed report design for ${settings.name} (${settings.code})`,
        });
        return this.toAdminLabReportDesign(settings);
    }
    async updateLabSettings(labId, data) {
        const settings = await this.settingsService.updateLabSettings(labId, data);
        this.logger.log(JSON.stringify({
            event: 'admin.lab_settings.update',
            labId,
            reportDesignFingerprint: settings.reportDesignFingerprint ?? null,
        }));
        return this.toAdminLabSettingsUpdateResponse(settings);
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
        const issued = await this.adminAuthService.reissueSession(data.refreshToken, {
            platformUserId: actor.platformUserId,
            impersonatedLabId: lab.id,
        }, {
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
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
            refreshToken: issued.refreshToken,
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
    async stopImpersonation(data, actor) {
        const previousLabId = actor.impersonatedLabId?.trim() || null;
        const issued = await this.adminAuthService.reissueSession(data.refreshToken, {
            platformUserId: actor.platformUserId,
            impersonatedLabId: null,
        }, {
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
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
            refreshToken: issued.refreshToken,
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
    async transferLabTests(targetLabId, payload, actor) {
        const sourceLabId = this.normalizeUuidV4(payload.sourceLabId, 'sourceLabId');
        if (sourceLabId === targetLabId) {
            throw new common_1.BadRequestException('sourceLabId must be different from the target lab');
        }
        const dryRun = payload.dryRun !== false;
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const labRepo = manager.getRepository(lab_entity_1.Lab);
            const [sourceLab, targetLab] = await Promise.all([
                labRepo.findOne({
                    where: { id: sourceLabId },
                    select: { id: true, code: true, name: true },
                }),
                labRepo.findOne({
                    where: { id: targetLabId },
                    select: { id: true, code: true, name: true },
                }),
            ]);
            if (!sourceLab) {
                throw new common_1.NotFoundException('Source lab not found');
            }
            if (!targetLab) {
                throw new common_1.NotFoundException('Target lab not found');
            }
            const result = await this.buildAndMaybeApplyTestTransfer(manager, sourceLab, targetLab, dryRun);
            if (actor?.platformUserId) {
                await this.auditService.log({
                    actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
                    actorId: actor.platformUserId,
                    action: audit_log_entity_2.AuditAction.PLATFORM_TEST_TRANSFER,
                    entityType: 'lab',
                    entityId: targetLab.id,
                    labId: targetLab.id,
                    description: `${dryRun ? 'Previewed' : 'Transferred'} test configuration from ${sourceLab.name} (${sourceLab.code}) to ${targetLab.name} (${targetLab.code})`,
                    newValues: {
                        sourceLabId: sourceLab.id,
                        targetLabId: targetLab.id,
                        dryRun,
                        totalSourceTests: result.totalSourceTests,
                        createdCount: result.createCount,
                        updatedCount: result.updateCount,
                        pricingRowsCopied: result.pricingRowsCopied,
                        unmatchedDepartmentCount: result.unmatchedDepartments.length,
                        unmatchedShiftPriceCount: result.unmatchedShiftPrices.length,
                    },
                    ipAddress: actor.ipAddress ?? null,
                    userAgent: actor.userAgent ?? null,
                }, manager);
            }
            return result;
        });
    }
    async buildAndMaybeApplyTestTransfer(manager, sourceLab, targetLab, dryRun) {
        const testRepo = manager.getRepository(test_entity_1.Test);
        const pricingRepo = manager.getRepository(pricing_entity_1.Pricing);
        const testComponentRepo = manager.getRepository(test_component_entity_1.TestComponent);
        const departmentRepo = manager.getRepository(department_entity_1.Department);
        const shiftRepo = manager.getRepository(shift_entity_1.Shift);
        const [sourceTests, targetTests, sourceDepartments, targetDepartments, targetShifts] = await Promise.all([
            testRepo.find({
                where: { labId: sourceLab.id },
                order: { code: 'ASC', name: 'ASC' },
            }),
            testRepo.find({
                where: { labId: targetLab.id },
                order: { code: 'ASC', name: 'ASC' },
            }),
            departmentRepo.find({ where: { labId: sourceLab.id } }),
            departmentRepo.find({ where: { labId: targetLab.id } }),
            shiftRepo.find({ where: { labId: targetLab.id } }),
        ]);
        this.assertNoNormalizedTestCodeCollisions(sourceTests, sourceLab.code);
        this.assertNoNormalizedTestCodeCollisions(targetTests, targetLab.code);
        const sourcePanelIds = sourceTests
            .filter((test) => test.type === test_entity_1.TestType.PANEL)
            .map((test) => test.id);
        const sourceTestIds = sourceTests.map((test) => test.id);
        const [sourceComponents, sourcePricingRows] = await Promise.all([
            sourcePanelIds.length
                ? testComponentRepo.find({
                    where: { panelTestId: (0, typeorm_1.In)(sourcePanelIds) },
                    relations: ['childTest'],
                    order: { panelTestId: 'ASC', sortOrder: 'ASC' },
                })
                : Promise.resolve([]),
            sourceTestIds.length
                ? pricingRepo.find({
                    where: {
                        labId: sourceLab.id,
                        testId: (0, typeorm_1.In)(sourceTestIds),
                        patientType: (0, typeorm_1.IsNull)(),
                        isActive: true,
                    },
                    relations: ['shift'],
                })
                : Promise.resolve([]),
        ]);
        const sourceDepartmentCodeById = new Map(sourceDepartments.map((department) => [department.id, department.code]));
        const targetDepartmentByCode = new Map(targetDepartments.map((department) => [
            this.normalizeTransferCodeKey(department.code),
            department,
        ]));
        const targetShiftByCode = new Map(targetShifts.map((shift) => [this.normalizeTransferCodeKey(shift.code), shift]));
        const targetTestByCode = new Map(targetTests.map((test) => [this.normalizeTransferCodeKey(test.code), test]));
        const sourcePricingByTestId = new Map();
        for (const row of sourcePricingRows) {
            const existing = sourcePricingByTestId.get(row.testId) ?? [];
            existing.push(row);
            sourcePricingByTestId.set(row.testId, existing);
        }
        const sourceComponentsByPanelId = new Map();
        for (const component of sourceComponents) {
            const existing = sourceComponentsByPanelId.get(component.panelTestId) ?? [];
            existing.push(component);
            sourceComponentsByPanelId.set(component.panelTestId, existing);
        }
        const unmatchedDepartments = [];
        const unmatchedShiftPrices = [];
        const transferItems = sourceTests.map((sourceTest) => {
            const normalizedCode = this.normalizeTransferCode(sourceTest.code);
            const sourceDepartmentCode = sourceTest.departmentId
                ? sourceDepartmentCodeById.get(sourceTest.departmentId) ?? null
                : null;
            const mappedDepartment = sourceDepartmentCode
                ? targetDepartmentByCode.get(this.normalizeTransferCodeKey(sourceDepartmentCode)) ?? null
                : null;
            if (sourceDepartmentCode && !mappedDepartment) {
                unmatchedDepartments.push({
                    testCode: normalizedCode,
                    departmentCode: sourceDepartmentCode,
                });
            }
            const pricingPlan = [];
            for (const pricingRow of sourcePricingByTestId.get(sourceTest.id) ?? []) {
                const price = this.toTransferPrice(pricingRow.price);
                if (price === null)
                    continue;
                if (!pricingRow.shiftId) {
                    pricingPlan.push({ shiftId: null, price });
                    continue;
                }
                const shiftCode = pricingRow.shift?.code?.trim() || null;
                const matchedShift = shiftCode ? targetShiftByCode.get(this.normalizeTransferCodeKey(shiftCode)) ?? null : null;
                if (!matchedShift) {
                    unmatchedShiftPrices.push({
                        testCode: normalizedCode,
                        shiftCode,
                    });
                    continue;
                }
                pricingPlan.push({
                    shiftId: matchedShift.id,
                    price,
                });
            }
            return {
                sourceTest,
                normalizedCode,
                existingTargetTest: targetTestByCode.get(this.normalizeTransferCodeKey(normalizedCode)) ?? null,
                mappedDepartmentId: mappedDepartment?.id ?? null,
                pricingPlan,
            };
        });
        if (!dryRun) {
            await this.applyTestTransferPlan(manager, targetLab.id, transferItems, sourceComponentsByPanelId);
        }
        const pricingRowsCopied = transferItems.reduce((total, item) => total + item.pricingPlan.length, 0);
        const result = {
            dryRun,
            sourceLab: {
                id: sourceLab.id,
                code: sourceLab.code,
                name: sourceLab.name,
            },
            targetLab: {
                id: targetLab.id,
                code: targetLab.code,
                name: targetLab.name,
            },
            totalSourceTests: transferItems.length,
            createCount: transferItems.filter((item) => !item.existingTargetTest).length,
            updateCount: transferItems.filter((item) => Boolean(item.existingTargetTest)).length,
            pricingRowsCopied,
            pricingRowsSkipped: unmatchedShiftPrices.length,
            unmatchedDepartments,
            unmatchedShiftPrices,
            warnings: [],
        };
        result.warnings = this.buildTestTransferWarnings(result);
        return result;
    }
    async applyTestTransferPlan(manager, targetLabId, transferItems, sourceComponentsByPanelId) {
        const testRepo = manager.getRepository(test_entity_1.Test);
        const pricingRepo = manager.getRepository(pricing_entity_1.Pricing);
        const testComponentRepo = manager.getRepository(test_component_entity_1.TestComponent);
        const resolvedTargetByCode = new Map();
        for (const item of transferItems) {
            const payload = this.buildTransferredTestPayload(targetLabId, item.sourceTest, item.mappedDepartmentId);
            const entity = item.existingTargetTest
                ? Object.assign(item.existingTargetTest, payload)
                : testRepo.create(payload);
            const saved = await testRepo.save(entity);
            resolvedTargetByCode.set(item.normalizedCode, saved);
        }
        for (const targetTest of resolvedTargetByCode.values()) {
            await testComponentRepo.delete({ panelTestId: targetTest.id });
        }
        const componentRows = [];
        for (const item of transferItems) {
            const targetPanel = resolvedTargetByCode.get(item.normalizedCode);
            if (!targetPanel || item.sourceTest.type !== test_entity_1.TestType.PANEL) {
                continue;
            }
            const sourceComponents = sourceComponentsByPanelId.get(item.sourceTest.id) ?? [];
            for (const component of sourceComponents) {
                const childCode = component.childTest?.code?.trim();
                if (!childCode) {
                    continue;
                }
                const targetChild = resolvedTargetByCode.get(this.normalizeTransferCodeKey(childCode));
                if (!targetChild) {
                    continue;
                }
                componentRows.push(testComponentRepo.create({
                    panelTestId: targetPanel.id,
                    childTestId: targetChild.id,
                    required: component.required,
                    sortOrder: component.sortOrder,
                    reportSection: component.reportSection ?? null,
                    reportGroup: component.reportGroup ?? null,
                    effectiveFrom: component.effectiveFrom ?? null,
                    effectiveTo: component.effectiveTo ?? null,
                }));
            }
        }
        if (componentRows.length) {
            await testComponentRepo.save(componentRows);
        }
        const pricingRowsToInsert = [];
        for (const item of transferItems) {
            const targetTest = resolvedTargetByCode.get(item.normalizedCode);
            if (!targetTest)
                continue;
            await pricingRepo.delete({
                labId: targetLabId,
                testId: targetTest.id,
                patientType: (0, typeorm_1.IsNull)(),
            });
            for (const priceRow of item.pricingPlan) {
                pricingRowsToInsert.push(pricingRepo.create({
                    labId: targetLabId,
                    testId: targetTest.id,
                    shiftId: priceRow.shiftId,
                    patientType: null,
                    price: priceRow.price,
                    isActive: true,
                }));
            }
        }
        if (pricingRowsToInsert.length) {
            await pricingRepo.save(pricingRowsToInsert);
        }
    }
    buildTransferredTestPayload(targetLabId, sourceTest, mappedDepartmentId) {
        return {
            labId: targetLabId,
            code: this.normalizeTransferCode(sourceTest.code),
            name: sourceTest.name.trim(),
            abbreviation: this.toNullableTrimmedText(sourceTest.abbreviation),
            type: sourceTest.type === test_entity_1.TestType.PANEL ? test_entity_1.TestType.PANEL : test_entity_1.TestType.SINGLE,
            tubeType: sourceTest.tubeType,
            unit: this.toNullableTrimmedText(sourceTest.unit),
            category: this.toNullableTrimmedText(sourceTest.category),
            normalMin: this.toNullableNumber(sourceTest.normalMin),
            normalMax: this.toNullableNumber(sourceTest.normalMax),
            normalMinMale: this.toNullableNumber(sourceTest.normalMinMale),
            normalMaxMale: this.toNullableNumber(sourceTest.normalMaxMale),
            normalMinFemale: this.toNullableNumber(sourceTest.normalMinFemale),
            normalMaxFemale: this.toNullableNumber(sourceTest.normalMaxFemale),
            normalText: this.toNullableRawText(sourceTest.normalText),
            normalTextMale: this.toNullableRawText(sourceTest.normalTextMale),
            normalTextFemale: this.toNullableRawText(sourceTest.normalTextFemale),
            resultEntryType: this.normalizeTransferResultEntryType(sourceTest.resultEntryType),
            resultTextOptions: this.cloneTransferredResultTextOptions(sourceTest.resultTextOptions),
            allowCustomResultText: Boolean(sourceTest.allowCustomResultText),
            cultureConfig: this.cloneTransferredCultureConfig(sourceTest.cultureConfig),
            numericAgeRanges: this.cloneTransferredNumericAgeRanges(sourceTest.numericAgeRanges),
            description: this.toNullableTrimmedText(sourceTest.description),
            childTestIds: sourceTest.type === test_entity_1.TestType.PANEL ? null : this.toNullableTrimmedText(sourceTest.childTestIds),
            parameterDefinitions: this.cloneTransferredParameterDefinitions(sourceTest.parameterDefinitions),
            departmentId: mappedDepartmentId,
            isActive: Boolean(sourceTest.isActive),
            sortOrder: this.toIntegerOrZero(sourceTest.sortOrder),
            expectedCompletionMinutes: this.toNullableInteger(sourceTest.expectedCompletionMinutes),
        };
    }
    buildTestTransferWarnings(result) {
        const warnings = [];
        if (result.totalSourceTests === 0) {
            warnings.push('Source lab has no tests to transfer.');
        }
        if (result.unmatchedDepartments.length > 0) {
            warnings.push(`${result.unmatchedDepartments.length} transferred tests will have no department because the target lab has no department with the same code.`);
        }
        if (result.pricingRowsSkipped > 0) {
            warnings.push(`${result.pricingRowsSkipped} shift-specific pricing rows were skipped because the target lab has no shift with the same code.`);
        }
        return warnings;
    }
    assertNoNormalizedTestCodeCollisions(tests, labCode) {
        const seen = new Set();
        for (const test of tests) {
            const key = this.normalizeTransferCodeKey(test.code);
            if (seen.has(key)) {
                throw new common_1.BadRequestException(`Lab ${labCode} contains multiple tests that normalize to the same code (${key}).`);
            }
            seen.add(key);
        }
    }
    normalizeTransferCode(value) {
        return value.trim().toUpperCase();
    }
    normalizeTransferCodeKey(value) {
        return String(value ?? '').trim().toUpperCase();
    }
    toNullableTrimmedText(value) {
        if (value === null || value === undefined)
            return null;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
    }
    toNullableRawText(value) {
        if (value === null || value === undefined)
            return null;
        return value.length > 0 ? value : null;
    }
    toNullableNumber(value) {
        if (value === null || value === undefined || value === '')
            return null;
        const numeric = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }
    toNullableInteger(value) {
        const numeric = this.toNullableNumber(value);
        if (numeric === null)
            return null;
        return Math.trunc(numeric);
    }
    toIntegerOrZero(value) {
        return this.toNullableInteger(value) ?? 0;
    }
    toTransferPrice(value) {
        const numeric = this.toNullableNumber(value);
        if (numeric === null || numeric < 0)
            return null;
        return Math.round(numeric * 100) / 100;
    }
    normalizeTransferResultEntryType(value) {
        const normalized = String(value ?? '').trim().toUpperCase();
        if (normalized === 'QUALITATIVE' ||
            normalized === 'TEXT' ||
            normalized === 'CULTURE_SENSITIVITY') {
            return normalized;
        }
        return 'NUMERIC';
    }
    cloneTransferredCultureConfig(config) {
        if (!config || typeof config !== 'object')
            return null;
        const seen = new Set();
        const interpretationOptions = (config.interpretationOptions ?? [])
            .map((value) => String(value ?? '').trim().toUpperCase())
            .filter((value) => {
            if (!value || seen.has(value))
                return false;
            seen.add(value);
            return true;
        });
        const micUnit = typeof config.micUnit === 'string' && config.micUnit.trim().length > 0
            ? config.micUnit.trim()
            : null;
        return {
            interpretationOptions: interpretationOptions.length
                ? interpretationOptions
                : ['S', 'I', 'R'],
            micUnit,
        };
    }
    cloneTransferredNumericAgeRanges(ranges) {
        return ((0, normal_range_util_1.normalizeNumericAgeRanges)(ranges)?.map((range) => ({
            sex: range.sex,
            ageUnit: range.ageUnit,
            minAge: range.minAge,
            maxAge: range.maxAge,
            normalMin: range.normalMin,
            normalMax: range.normalMax,
        })) ?? null);
    }
    cloneTransferredResultTextOptions(options) {
        if (!options?.length)
            return null;
        const seen = new Set();
        let defaultAssigned = false;
        const normalized = [];
        for (const option of options) {
            const value = option?.value?.trim();
            if (!value)
                continue;
            const dedupeKey = value.toLowerCase();
            if (seen.has(dedupeKey))
                continue;
            seen.add(dedupeKey);
            const isDefault = Boolean(option?.isDefault) && !defaultAssigned;
            if (isDefault)
                defaultAssigned = true;
            normalized.push({
                value,
                flag: this.normalizeTransferredResultFlag(option?.flag ?? null),
                isDefault,
            });
        }
        return normalized.length ? normalized : null;
    }
    cloneTransferredParameterDefinitions(definitions) {
        if (!definitions?.length)
            return null;
        const normalized = [];
        for (const definition of definitions) {
            const code = definition?.code?.trim();
            const label = definition?.label?.trim();
            if (!code || !label)
                continue;
            const type = definition.type === 'select' ? 'select' : 'text';
            const options = type === 'select'
                ? (definition.options ?? [])
                    .map((option) => option?.trim())
                    .filter((option) => Boolean(option))
                : undefined;
            const normalOptions = type === 'select'
                ? (definition.normalOptions ?? [])
                    .map((option) => option?.trim())
                    .filter((option) => Boolean(option))
                : undefined;
            const defaultValue = this.toNullableTrimmedText(definition.defaultValue);
            normalized.push({
                code,
                label,
                type,
                options: options?.length ? options : undefined,
                normalOptions: normalOptions?.length ? normalOptions : undefined,
                defaultValue: defaultValue ?? undefined,
            });
        }
        return normalized.length ? normalized : null;
    }
    normalizeTransferredResultFlag(value) {
        const normalized = (0, order_test_flag_util_1.normalizeOrderTestFlag)(value ?? null);
        if (normalized === 'N' ||
            normalized === 'H' ||
            normalized === 'L' ||
            normalized === 'POS' ||
            normalized === 'NEG' ||
            normalized === 'ABN') {
            return normalized;
        }
        return null;
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
            id: lab.id,
            code: lab.code,
            subdomain: lab.subdomain,
            name: lab.name,
            timezone: lab.timezone,
            isActive: lab.isActive,
            createdAt: lab.createdAt,
            usersCount: usersByLab.get(lab.id) ?? 0,
            orders30dCount: ordersByLab.get(lab.id) ?? 0,
        }));
    }
    toAdminLabSettingsSummary(settings) {
        return {
            id: settings.id,
            code: settings.code,
            name: settings.name,
            reportDesignFingerprint: settings.reportDesignFingerprint,
            dashboardAnnouncementText: settings.dashboardAnnouncementText,
            labelSequenceBy: settings.labelSequenceBy === 'department' ? 'department' : 'tube_type',
            sequenceResetBy: settings.sequenceResetBy === 'shift' ? 'shift' : 'day',
            enableOnlineResults: settings.enableOnlineResults,
            hasOnlineResultWatermarkImage: Boolean(settings.onlineResultWatermarkDataUrl),
            onlineResultWatermarkText: settings.onlineResultWatermarkText,
            printing: {
                ...settings.printing,
                mode: settings.printing.mode === 'direct_gateway' ? 'direct_gateway' : 'browser',
            },
            hasReportBanner: Boolean(settings.reportBranding?.bannerDataUrl),
            hasReportFooter: Boolean(settings.reportBranding?.footerDataUrl),
            hasReportLogo: Boolean(settings.reportBranding?.logoDataUrl),
            hasReportWatermark: Boolean(settings.reportBranding?.watermarkDataUrl),
            uiTestGroups: settings.uiTestGroups ?? [],
            referringDoctors: settings.referringDoctors ?? [],
        };
    }
    toAdminLabSettingsUpdateResponse(settings) {
        return {
            ...this.toAdminLabSettingsSummary(settings),
            reportBranding: settings.reportBranding,
            reportStyle: settings.reportStyle,
            onlineResultWatermarkDataUrl: settings.onlineResultWatermarkDataUrl,
        };
    }
    toAdminLabReportDesign(settings) {
        return {
            id: settings.id,
            code: settings.code,
            name: settings.name,
            reportDesignFingerprint: settings.reportDesignFingerprint,
            reportBranding: settings.reportBranding,
            reportStyle: settings.reportStyle,
            onlineResultWatermarkDataUrl: settings.onlineResultWatermarkDataUrl,
            onlineResultWatermarkText: settings.onlineResultWatermarkText,
        };
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
            barcode: firstBarcode,
        };
    }
    normalizeUuidV4(value, fieldName) {
        if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value.trim())) {
            throw new common_1.BadRequestException(`${fieldName} must be a valid UUID`);
        }
        return value.trim();
    }
    normalizeReportImageDataUrl(value, fieldName) {
        if (value === null || value === undefined)
            return null;
        if (typeof value !== 'string') {
            throw new common_1.BadRequestException(`${fieldName} must be a string or null`);
        }
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        if (trimmed.length > MAX_REPORT_IMAGE_DATA_URL_LENGTH) {
            throw new common_1.BadRequestException(`${fieldName} is too large`);
        }
        if (!REPORT_IMAGE_DATA_URL_PATTERN.test(trimmed)) {
            throw new common_1.BadRequestException(`${fieldName} must be a valid image data URL (png, jpg/jpeg, or webp)`);
        }
        return trimmed;
    }
    normalizeDashboardAnnouncementText(value) {
        if (value === null || value === undefined)
            return null;
        if (typeof value !== 'string') {
            throw new common_1.BadRequestException('dashboardAnnouncementText must be a string or null');
        }
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        if (trimmed.length > MAX_DASHBOARD_ANNOUNCEMENT_TEXT_LENGTH) {
            throw new common_1.BadRequestException(`dashboardAnnouncementText must be at most ${MAX_DASHBOARD_ANNOUNCEMENT_TEXT_LENGTH} characters`);
        }
        return trimmed;
    }
    normalizePreviewReportBranding(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new common_1.BadRequestException('reportBranding must be an object');
        }
        const branding = value;
        const allowedKeys = ['bannerDataUrl', 'footerDataUrl', 'logoDataUrl', 'watermarkDataUrl'];
        const unknownKeys = Object.keys(branding).filter((key) => !allowedKeys.includes(key));
        if (unknownKeys.length > 0) {
            throw new common_1.BadRequestException(`reportBranding contains unknown keys: ${unknownKeys.join(', ')}`);
        }
        return {
            bannerDataUrl: this.normalizeReportImageDataUrl(branding.bannerDataUrl, 'reportBranding.bannerDataUrl'),
            footerDataUrl: this.normalizeReportImageDataUrl(branding.footerDataUrl, 'reportBranding.footerDataUrl'),
            logoDataUrl: this.normalizeReportImageDataUrl(branding.logoDataUrl, 'reportBranding.logoDataUrl'),
            watermarkDataUrl: this.normalizeReportImageDataUrl(branding.watermarkDataUrl, 'reportBranding.watermarkDataUrl'),
        };
    }
    normalizePreviewReportStyle(value) {
        if (value === null || value === undefined) {
            throw new common_1.BadRequestException('reportStyle is required');
        }
        try {
            return (0, report_style_config_1.validateAndNormalizeReportStyleConfig)(value, 'reportStyle');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid reportStyle';
            throw new common_1.BadRequestException(message);
        }
    }
    async logPlatformSensitiveRead(actor, payload, manager) {
        if (!actor?.platformUserId)
            return;
        const rawEntityId = typeof payload.entityId === 'string' ? payload.entityId.trim() : null;
        const entityId = rawEntityId && UUID_V4_PATTERN.test(rawEntityId) ? rawEntityId : null;
        const metadata = rawEntityId && !entityId
            ? {
                ...(payload.metadata ?? {}),
                entityReference: payload.metadata && 'entityReference' in payload.metadata
                    ? payload.metadata.entityReference
                    : rawEntityId,
            }
            : (payload.metadata ?? null);
        await this.auditService.log({
            actorType: audit_log_entity_2.AuditActorType.PLATFORM_USER,
            actorId: actor.platformUserId,
            labId: payload.labId ?? null,
            action: audit_log_entity_2.AuditAction.PLATFORM_SENSITIVE_READ,
            entityType: payload.entityType,
            entityId,
            description: payload.description,
            newValues: metadata,
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
        }, manager);
    }
    async logLabAudit(action, labId, actor, payload, manager) {
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
        }, manager);
    }
};
exports.PlatformAdminService = PlatformAdminService;
exports.PlatformAdminService = PlatformAdminService = PlatformAdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rls_session_service_1.RlsSessionService,
        settings_service_1.SettingsService,
        audit_service_1.AuditService,
        reports_service_1.ReportsService,
        admin_auth_service_1.AdminAuthService,
        auth_service_1.AuthService])
], PlatformAdminService);
//# sourceMappingURL=platform-admin.service.js.map