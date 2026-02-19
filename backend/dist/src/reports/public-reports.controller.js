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
function getLoadingMessage(status) {
    if (status.ready) {
        return 'All tests are completed and verified.';
    }
    if (status.paymentStatus !== 'paid') {
        return 'Payment is pending. Results will be released after payment and verification.';
    }
    if (status.verifiedCount === 0) {
        return 'Laboratory is processing your tests.';
    }
    return 'Some tests are complete. Remaining tests are still processing.';
}
function getTestStatusMeta(test) {
    if (test.isVerified) {
        return { label: 'Verified', className: 'ok' };
    }
    if (test.status === 'COMPLETED') {
        return { label: 'Completed', className: 'done' };
    }
    if (test.status === 'IN_PROGRESS') {
        return { label: 'In Progress', className: 'work' };
    }
    if (test.status === 'REJECTED') {
        return { label: 'Rejected', className: 'bad' };
    }
    return { label: 'Pending', className: 'wait' };
}
function renderTestsSection(status) {
    if (status.tests.length === 0) {
        return '<div class="hint">No reportable tests found.</div>';
    }
    const groups = new Map();
    for (const test of status.tests) {
        const key = test.departmentName || 'General Department';
        const arr = groups.get(key) ?? [];
        arr.push(test);
        groups.set(key, arr);
    }
    const groupsHtml = Array.from(groups.entries())
        .map(([departmentName, tests]) => {
        const verifiedCount = tests.filter((t) => t.isVerified).length;
        const rowsHtml = tests
            .map((test) => {
            const meta = getTestStatusMeta(test);
            const resultText = test.resultValue
                ? `${escapeHtml(test.resultValue)}${test.unit ? ` ${escapeHtml(test.unit)}` : ''}`
                : '-';
            return `<tr>
            <td class="test-name" dir="auto">${escapeHtml(test.testName)} (${escapeHtml(test.testCode)})</td>
            <td><span class="chip ${meta.className}">${escapeHtml(meta.label)}</span></td>
            <td>${resultText}</td>
          </tr>`;
        })
            .join('');
        return `<details class="dept" open>
        <summary>${escapeHtml(departmentName)} (${verifiedCount}/${tests.length})</summary>
        <table>
          <thead><tr><th>Test</th><th>Status</th><th>Result</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </details>`;
    })
        .join('');
    return `<details class="tests-collapse" open>
    <summary>Test Status (${status.verifiedCount}/${status.reportableCount})</summary>
    <div class="tests-wrap">${groupsHtml}</div>
  </details>`;
}
function renderStatusPage(status) {
    const watermarkText = status.onlineResultWatermarkText?.trim() || '';
    const readyBadge = status.ready
        ? '<span class="badge ready">Ready</span>'
        : '<span class="badge pending">Pending</span>';
    const progressText = `${status.verifiedCount}/${status.reportableCount} tests verified`;
    const loadingMessage = getLoadingMessage(status);
    const paymentText = status.paymentStatus === 'paid' ? 'Paid' : 'Payment pending';
    const paymentBadge = status.paymentStatus === 'paid'
        ? '<span class="badge ready">Paid</span>'
        : '<span class="badge pending">Unpaid</span>';
    const actionHtml = status.ready
        ? `<a class="btn" href="/public/results/${status.orderId}/pdf">Download Result PDF</a>`
        : '<div class="hint">Result is not completed yet. Please check again later.</div>';
    const testsSectionHtml = renderTestsSection(status);
    const refreshHtml = status.ready
        ? ''
        : `<div class="refresh">
        Auto refresh in <span id="refresh-sec">30</span>s
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
      </script>`;
    const watermarkHtml = watermarkText
        ? `<div class="online-watermark" aria-hidden="true"><span>${escapeHtml(watermarkText)}</span></div>`
        : '';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Patient Result Status</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f3f5f9; color: #111827; }
    .online-watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
    .online-watermark span { font-size: clamp(34px, 10vw, 78px); letter-spacing: 4px; font-weight: 800; color: rgba(15, 23, 42, 0.08); transform: rotate(-24deg); text-transform: uppercase; user-select: none; }
    .wrap { max-width: 640px; margin: 24px auto; padding: 0 14px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; box-shadow: 0 3px 14px rgba(0,0,0,0.06); }
    .wrap, .card { position: relative; z-index: 1; }
    h1 { margin: 0 0 10px 0; font-size: 22px; }
    .row { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid #f1f5f9; }
    .row:last-child { border-bottom: 0; }
    .k { color: #6b7280; font-size: 14px; }
    .v { font-weight: 600; font-size: 14px; text-align: right; }
    .top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .badge { border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; }
    .badge.ready { background: #dcfce7; color: #166534; }
    .badge.pending { background: #fee2e2; color: #991b1b; }
    .section { margin-top: 16px; }
    .hint { margin-top: 10px; color: #6b7280; font-size: 14px; }
    .btn { margin-top: 8px; display: inline-block; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700; border-radius: 8px; padding: 10px 14px; }
    .progress-track { width: 100%; height: 8px; border-radius: 999px; background: #e2e8f0; overflow: hidden; margin-top: 6px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #16a34a); }
    .loading-text { margin-top: 8px; font-size: 13px; color: #475569; }
    .refresh { margin-top: 6px; font-size: 12px; color: #64748b; }
    .tests-collapse { margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
    .tests-collapse > summary { cursor: pointer; list-style: none; padding: 10px 12px; font-weight: 700; }
    .tests-wrap { padding: 0 10px 10px 10px; }
    .dept { margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
    .dept > summary { cursor: pointer; list-style: none; padding: 8px 10px; font-size: 13px; font-weight: 700; border-bottom: 1px solid #f1f5f9; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; vertical-align: top; }
    th { color: #475569; font-weight: 700; background: #f8fafc; }
    .test-name { font-weight: 600; }
    .chip { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .chip.ok { background: #dcfce7; color: #166534; }
    .chip.done { background: #dbeafe; color: #1d4ed8; }
    .chip.work { background: #fef3c7; color: #92400e; }
    .chip.wait { background: #e2e8f0; color: #334155; }
    .chip.bad { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  ${watermarkHtml}
  <div class="wrap">
    <div class="card">
      <div class="top">
        <h1>Laboratory Result</h1>
        ${readyBadge}
      </div>
      <div class="row"><div class="k">Lab</div><div class="v">${escapeHtml(status.labName)}</div></div>
      <div class="row"><div class="k">Patient</div><div class="v" dir="auto">${escapeHtml(status.patientName)}</div></div>
      <div class="row"><div class="k">Order #</div><div class="v">${escapeHtml(status.orderNumber)}</div></div>
      <div class="row"><div class="k">Registered At</div><div class="v">${escapeHtml(formatDateTime(status.registeredAt))}</div></div>
      <div class="row"><div class="k">Payment</div><div class="v">${escapeHtml(paymentText)} ${paymentBadge}</div></div>
      <div class="row"><div class="k">Progress</div><div class="v">${escapeHtml(progressText)}</div></div>
      <div class="progress-track"><div class="progress-fill" style="width:${status.progressPercent}%"></div></div>
      <div class="loading-text">${escapeHtml(loadingMessage)}</div>
      ${refreshHtml}
      <div class="row"><div class="k">Last Verified</div><div class="v">${escapeHtml(status.verifiedAt ? formatDateTime(status.verifiedAt) : '-')}</div></div>
      ${testsSectionHtml}
      <div class="section">
        ${actionHtml}
      </div>
    </div>
  </div>
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
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(renderStatusPage(status));
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