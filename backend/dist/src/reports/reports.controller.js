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
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
let ReportsController = class ReportsController {
    constructor(reportsService, auditService) {
        this.reportsService = reportsService;
        this.auditService = auditService;
    }
    async getOrderReceiptPDF(req, orderId, res) {
        const labId = req.user?.labId;
        if (!labId) {
            return res.status(401).json({ message: 'Lab ID not found in token' });
        }
        try {
            const pdfBuffer = await this.reportsService.generateOrderReceiptPDF(orderId, labId);
            await this.auditService.log({
                labId,
                userId: req.user?.userId ?? null,
                action: audit_log_entity_1.AuditAction.REPORT_GENERATE,
                entityType: 'order',
                entityId: orderId,
                description: `Generated order receipt PDF for order ${orderId}`,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="receipt-${orderId.substring(0, 8)}.pdf"`);
            res.send(pdfBuffer);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            return res.status(500).json({ message: 'Failed to generate PDF' });
        }
    }
    async getTestResultsPDF(req, orderId, res) {
        const labId = req.user?.labId;
        if (!labId) {
            return res.status(401).json({ message: 'Lab ID not found in token' });
        }
        try {
            const pdfBuffer = await this.reportsService.generateTestResultsPDF(orderId, labId);
            await this.auditService.log({
                labId,
                userId: req.user?.userId ?? null,
                action: audit_log_entity_1.AuditAction.REPORT_GENERATE,
                entityType: 'order',
                entityId: orderId,
                description: `Generated test results PDF for order ${orderId}`,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="results-${orderId.substring(0, 8)}.pdf"`);
            res.send(pdfBuffer);
        }
        catch (error) {
            console.error('Error generating results PDF:', error);
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
        await this.auditService.log({
            labId,
            userId: req.user?.userId ?? null,
            action: audit_log_entity_1.AuditAction.REPORT_PRINT,
            entityType: 'order',
            entityId: orderId,
            description: `Shared report link via ${body.channel} for order ${orderId}`,
            newValues: { channel: body.channel },
            ipAddress: req.ip ?? null,
            userAgent: req.headers?.['user-agent'] ?? null,
        });
        return res.status(201).json({ success: true });
    }
};
exports.ReportsController = ReportsController;
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
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        audit_service_1.AuditService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map