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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("./reports.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const lab_actor_context_1 = require("../types/lab-actor-context");
const lab_role_matrix_1 = require("../auth/lab-role-matrix");
let ReportsController = class ReportsController {
    constructor(reportsService, auditService) {
        this.reportsService = reportsService;
        this.auditService = auditService;
    }
    async getOrderActionFlags(req, orderIdsRaw = '', res) {
        const labId = req.user?.labId;
        if (!labId) {
            return res.status(401).json({ message: 'Lab ID not found in token' });
        }
        const orderIds = (orderIdsRaw ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
        const flags = await this.reportsService.getOrderActionFlags(labId, orderIds);
        return res.status(200).json(flags);
    }
    async logReportAction(req, orderId, body, res) {
        const labId = req.user?.labId;
        if (!labId) {
            return res.status(401).json({ message: 'Lab ID not found in token' });
        }
        const action = String(body?.action ?? '')
            .trim()
            .toUpperCase();
        if (!['PDF', 'PRINT', 'WHATSAPP', 'VIBER'].includes(action)) {
            return res.status(400).json({ message: 'action must be PDF, PRINT, WHATSAPP, or VIBER' });
        }
        await this.logReportActionInternal(req, orderId, action);
        return res.status(201).json({ success: true });
    }
    async getOrderReceiptPDF(req, orderId, res) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            return res.status(401).json({ message: 'Lab ID not found in token' });
        }
        try {
            const pdfBuffer = await this.reportsService.generateOrderReceiptPDF(orderId, labId);
            const impersonationAudit = actor.isImpersonation && actor.platformUserId
                ? {
                    impersonation: {
                        active: true,
                        platformUserId: actor.platformUserId,
                    },
                }
                : {};
            await this.auditService.log({
                actorType: actor.actorType,
                actorId: actor.actorId,
                labId,
                userId: actor.userId,
                action: audit_log_entity_1.AuditAction.REPORT_GENERATE,
                entityType: 'order',
                entityId: orderId,
                description: `Generated order receipt PDF for order ${orderId}`,
                newValues: impersonationAudit,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="receipt-${orderId.substring(0, 8)}.pdf"`);
            res.send(pdfBuffer);
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                const response = error.getResponse();
                const message = typeof response === 'string'
                    ? response
                    : (response.message ?? error.message);
                return res.status(error.getStatus()).json({ message });
            }
            if (error instanceof Error && error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            return res.status(500).json({ message: 'Failed to generate PDF' });
        }
    }
    async getTestResultsPDF(req, orderId, res) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            return res.status(401).json({ message: 'Lab ID not found in token' });
        }
        try {
            const pdfBuffer = await this.reportsService.generateTestResultsPDF(orderId, labId);
            const impersonationAudit = actor.isImpersonation && actor.platformUserId
                ? {
                    impersonation: {
                        active: true,
                        platformUserId: actor.platformUserId,
                    },
                }
                : {};
            await this.auditService.log({
                actorType: actor.actorType,
                actorId: actor.actorId,
                labId,
                userId: actor.userId,
                action: audit_log_entity_1.AuditAction.REPORT_GENERATE,
                entityType: 'order',
                entityId: orderId,
                description: `Generated test results PDF for order ${orderId}`,
                newValues: impersonationAudit,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="results-${orderId.substring(0, 8)}.pdf"`);
            res.send(pdfBuffer);
        }
        catch (error) {
            console.error('Error generating results PDF:', error);
            if (error instanceof common_1.HttpException) {
                const response = error.getResponse();
                const message = typeof response === 'string'
                    ? response
                    : (response.message ?? error.message);
                return res.status(error.getStatus()).json({ message });
            }
            if (error instanceof Error && error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            return res.status(500).json({
                message: 'Failed to generate PDF',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async logReportDelivery(req, orderId, body, res) {
        const labId = req.user?.labId;
        if (!labId) {
            return res.status(401).json({ message: 'Lab ID not found in token' });
        }
        if (!body?.channel || !['WHATSAPP', 'VIBER'].includes(body.channel)) {
            return res.status(400).json({ message: 'channel must be WHATSAPP or VIBER' });
        }
        await this.logReportActionInternal(req, orderId, body.channel);
        return res.status(201).json({ success: true });
    }
    async logReportActionInternal(req, orderId, actionKind) {
        const labId = req.user?.labId;
        if (!labId) {
            return;
        }
        await this.reportsService.ensureOrderBelongsToLab(orderId, labId);
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        const impersonationAudit = actor.isImpersonation && actor.platformUserId
            ? {
                impersonation: {
                    active: true,
                    platformUserId: actor.platformUserId,
                },
            }
            : {};
        await this.auditService.log({
            actorType: actor.actorType,
            actorId: actor.actorId,
            labId,
            userId: actor.userId,
            action: audit_log_entity_1.AuditAction.REPORT_PRINT,
            entityType: 'order',
            entityId: orderId,
            description: `Report action ${actionKind} for order ${orderId}`,
            newValues: { actionKind, ...impersonationAudit },
            ipAddress: req.ip ?? null,
            userAgent: req.headers?.['user-agent'] ?? null,
        });
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('orders/action-flags'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('orderIds')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getOrderActionFlags", null);
__decorate([
    (0, common_1.Post)('orders/:id/action-log'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "logReportAction", null);
__decorate([
    (0, common_1.Get)('orders/:id/receipt'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getOrderReceiptPDF", null);
__decorate([
    (0, common_1.Get)('orders/:id/results'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getTestResultsPDF", null);
__decorate([
    (0, common_1.Post)('orders/:id/delivery-log'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "logReportDelivery", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)('reports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.REPORTS),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        audit_service_1.AuditService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map