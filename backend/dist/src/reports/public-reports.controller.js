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
function renderHistoryRows(history) {
    return history
        .map((item) => `<tr>
        <td>${escapeHtml(item.orderNumber)}</td>
        <td>${escapeHtml(formatDateTime(item.registeredAt))}</td>
        <td><a class="link-btn" href="/public/results/${encodeURIComponent(item.orderId)}/pdf" target="_blank" rel="noopener">Open PDF</a></td>
      </tr>`)
        .join('');
}
function normalizeBirthYear(raw) {
    const value = raw.trim();
    if (!/^\d{4}$/.test(value))
        return null;
    const birthYear = Number(value);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear) {
        return null;
    }
    return birthYear;
}
function renderResultPage(input) {
    const statusToneClass = input.status.ready ? 'ready' : 'pending';
    const statusTitle = input.status.ready
        ? 'Current order result is ready'
        : 'Current order result is being processed';
    const statusDetail = input.status.ready
        ? `Verified ${input.status.verifiedCount} of ${input.status.reportableCount} reportable tests.`
        : `Progress ${input.status.progressPercent}% (${input.status.verifiedCount}/${input.status.reportableCount} verified).`;
    const disableAttr = input.search.disabled ? 'disabled' : '';
    const showHistoryTable = input.search.history.length > 0;
    const historyRows = showHistoryTable ? renderHistoryRows(input.search.history) : '';
    const refreshScript = input.autoRefreshSeconds
        ? `<script>
      (function () {
        var sec = ${input.autoRefreshSeconds};
        var node = document.getElementById('refresh-sec');
        setInterval(function () {
          sec -= 1;
          if (node) node.textContent = String(sec);
          if (sec <= 0) window.location.href = window.location.pathname;
        }, 1000);
      })();
    </script>`
        : '';
    const refreshBlock = input.autoRefreshSeconds
        ? `<div class="refresh">Auto refresh in <span id="refresh-sec">${input.autoRefreshSeconds}</span>s</div>`
        : '';
    const pdfAction = input.status.ready
        ? `<a class="primary-btn" href="/public/results/${encodeURIComponent(input.status.orderId)}/pdf" target="_blank" rel="noopener">View PDF</a>`
        : `<button class="primary-btn disabled" type="button" disabled>View PDF</button>`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Online Results</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; }
    .wrap { max-width: 900px; margin: 20px auto; padding: 0 14px; display: grid; gap: 14px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; }
    .meta { display: grid; gap: 6px; color: #334155; font-size: 14px; }
    .meta strong { color: #111827; }
    .status { border-left: 4px solid #3b82f6; padding-left: 12px; display: grid; gap: 6px; }
    .status.ready { border-left-color: #16a34a; }
    .status.pending { border-left-color: #2563eb; }
    .status-title { font-size: 18px; font-weight: 700; }
    .status-detail { color: #334155; font-size: 14px; }
    .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
    .primary-btn { display: inline-flex; align-items: center; justify-content: center; border: 0; background: #2563eb; color: #fff; text-decoration: none; padding: 8px 12px; border-radius: 9px; font-weight: 600; font-size: 14px; cursor: pointer; }
    .primary-btn.disabled { background: #94a3b8; cursor: not-allowed; }
    .search-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; align-items: end; }
    .field { display: grid; gap: 5px; }
    .field label { font-size: 13px; color: #334155; font-weight: 600; }
    .field input { border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 10px; font-size: 14px; }
    .search-btn { border: 0; border-radius: 8px; padding: 10px 12px; background: #0f766e; color: #fff; font-weight: 600; cursor: pointer; height: 38px; }
    .search-btn:disabled { background: #94a3b8; cursor: not-allowed; }
    .helper { margin: 10px 0 0; color: #475569; font-size: 13px; }
    .alert { margin-top: 10px; border-radius: 10px; padding: 9px 11px; font-size: 13px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1e3a8a; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 9px 6px; font-size: 14px; }
    th { color: #334155; font-weight: 700; background: #f8fafc; }
    .link-btn { color: #1d4ed8; text-decoration: none; font-weight: 600; }
    .refresh { font-size: 13px; color: #64748b; margin-top: 8px; }
    .section-title { margin: 0 0 10px; font-size: 16px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="meta">
        <div><strong>Patient:</strong> <span dir="auto">${escapeHtml(input.status.patientName)}</span></div>
        <div><strong>Order:</strong> ${escapeHtml(input.status.orderNumber)}</div>
        <div><strong>Visit Date:</strong> ${escapeHtml(formatDateTime(input.status.registeredAt))}</div>
      </div>
    </div>

    <div class="card">
      <div class="status ${statusToneClass}">
        <div class="status-title">${statusTitle}</div>
        <div class="status-detail">${statusDetail}</div>
      </div>
      <div class="actions">
        ${pdfAction}
      </div>
      ${refreshBlock}
    </div>

    <div class="card">
      <h2 class="section-title">Result History Search</h2>
      <form method="get" action="${escapeHtml(input.pagePath)}" class="search-form">
        <div class="field">
          <label for="patientNumber">Patient Number</label>
          <input id="patientNumber" name="patientNumber" required value="${escapeHtml(input.search.patientNumber)}" ${disableAttr} />
        </div>
        <div class="field">
          <label for="birthYear">Birth Year</label>
          <input id="birthYear" name="birthYear" required value="${escapeHtml(input.search.birthYear)}" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" ${disableAttr} />
        </div>
        <button class="search-btn" type="submit" ${disableAttr}>Search</button>
      </form>
      <div class="helper">Enter your patient number and 4-digit birth year to view report history.</div>
      ${input.search.message ? `<div class="alert">${escapeHtml(input.search.message)}</div>` : ''}
      ${showHistoryTable
        ? `<table>
        <thead>
          <tr>
            <th>Order Number</th>
            <th>Visit Date</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${historyRows}</tbody>
      </table>`
        : ''}
    </div>
  </div>
  ${refreshScript}
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
    async getResultStatusPage(orderId, req, res, patientNumberRaw, birthYearRaw) {
        try {
            const status = await this.reportsService.getPublicResultStatus(orderId);
            const patientNumber = String(patientNumberRaw || '').trim();
            const birthYearText = String(birthYearRaw || '').trim();
            const searchAttempted = patientNumberRaw !== undefined || birthYearRaw !== undefined;
            const labId = req.labId ?? null;
            let searchMessage = null;
            let history = [];
            if (!labId) {
                searchMessage = 'History search unavailable on this host.';
            }
            else if (searchAttempted) {
                const birthYear = normalizeBirthYear(birthYearText);
                if (!patientNumber || birthYear === null) {
                    searchMessage = 'Please enter valid search details.';
                }
                else {
                    try {
                        history = await this.reportsService.searchPublicResultHistory({
                            labId,
                            patientNumber,
                            birthYear,
                            limit: 50,
                        });
                        if (history.length === 0) {
                            searchMessage = 'No matching report history found with the provided details.';
                        }
                    }
                    catch {
                        searchMessage = 'History search is temporarily unavailable. Please try again later.';
                    }
                }
            }
            const autoRefreshSeconds = !status.ready && !searchAttempted ? 30 : null;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(renderResultPage({
                status,
                pagePath: `/public/results/${status.orderId}`,
                search: {
                    patientNumber,
                    birthYear: birthYearText,
                    disabled: !labId,
                    message: searchMessage,
                    history,
                },
                autoRefreshSeconds,
            }));
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
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __param(3, (0, common_1.Query)('patientNumber')),
    __param(4, (0, common_1.Query)('birthYear')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String, String]),
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