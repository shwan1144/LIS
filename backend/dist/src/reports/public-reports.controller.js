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
exports.PublicReportsController = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("./reports.service");
function escapeHtml(value) {
    const s = value == null ? '' : String(value);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function extractErrorMessage(error, fallback) {
    if (error instanceof common_1.HttpException) {
        const response = error.getResponse();
        if (typeof response === 'string')
            return response;
        if (response && typeof response === 'object') {
            const msg = response.message;
            if (Array.isArray(msg))
                return msg.join(', ');
            if (typeof msg === 'string')
                return msg;
        }
        return error.message || fallback;
    }
    if (error instanceof Error)
        return error.message || fallback;
    return fallback;
}
function formatDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return '-';
    return d.toLocaleString();
}
function renderPendingPage(status) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Result Status</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; }
    .card { background: #fff; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 90%; width: 400px; }
    .patient { font-size: 1rem; color: #64748b; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0; font-weight: 500; }
    .msg { font-size: 1.25rem; font-weight: 600; color: #2563eb; margin-bottom: 1.5rem; line-height: 1.6; }
    .refresh { font-size: 0.875rem; color: #94a3b8; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="patient" dir="auto">${escapeHtml(status.patientName)}</div>
    <div class="msg" dir="rtl">چاوەڕێی ئەنجامەکە بکە، هێشتا لە پرۆسەدایە</div>
    <div class="msg" dir="rtl">يرجى انتظار النتيجة، لا يزال قيد المعالجة</div>
    <div class="refresh">
      Auto refresh in <span id="refresh-sec">30</span>s
    </div>
  </div>
  <script>
    (function () {
      var sec = 30;
      var node = document.getElementById('refresh-sec');
      setInterval(function () {
        sec -= 1;
        if (node) node.textContent = String(sec);
        if (sec <= 0) window.location.reload();
      }, 1000);
    })();
  </script>
</body>
</html>`;
}
function renderErrorPage(code, message) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Result Unavailable</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #111827; }
    .wrap { max-width: 600px; margin: 24px auto; padding: 0 14px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
    h1 { margin: 0 0 8px 0; font-size: 22px; }
    .code { color: #dc2626; font-weight: 700; }
    .msg { margin-top: 8px; color: #334155; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Result Unavailable</h1>
      <div class="code">Error ${code}</div>
      <div class="msg">${escapeHtml(message)}</div>
    </div>
  </div>
</body>
</html>`;
}
let PublicReportsController = class PublicReportsController {
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    async getResultStatusPage(orderId, res) {
        try {
            const status = await this.reportsService.getPublicResultStatus(orderId);
            if (status.ready) {
                return res.redirect(`/public/results/${orderId}/pdf`);
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(renderPendingPage(status));
        }
        catch (error) {
            const statusCode = error instanceof common_1.HttpException ? error.getStatus() : 500;
            const message = extractErrorMessage(error, 'Unable to load result status.');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(statusCode).send(renderErrorPage(statusCode, message));
        }
    }
    async getResultPdf(orderId, res) {
        try {
            const pdfBuffer = await this.reportsService.generatePublicTestResultsPDF(orderId);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="results-${orderId.substring(0, 8)}.pdf"`);
            return res.send(pdfBuffer);
        }
        catch (error) {
            const statusCode = error instanceof common_1.HttpException ? error.getStatus() : 500;
            const message = extractErrorMessage(error, 'Unable to generate PDF.');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(statusCode).send(renderErrorPage(statusCode, message));
        }
    }
};
exports.PublicReportsController = PublicReportsController;
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PublicReportsController.prototype, "getResultStatusPage", null);
__decorate([
    (0, common_1.Get)(':id/pdf'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PublicReportsController.prototype, "getResultPdf", null);
exports.PublicReportsController = PublicReportsController = __decorate([
    (0, common_1.Controller)('public/results'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], PublicReportsController);
//# sourceMappingURL=public-reports.controller.js.map