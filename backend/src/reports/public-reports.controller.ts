import { Controller, Get, HttpException, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ReportsService,
  type PublicResultStatus,
} from './reports.service';

function escapeHtml(value: unknown): string {
  const s = value == null ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const msg = (response as { message?: string | string[] }).message;
      if (Array.isArray(msg)) return msg.join(', ');
      if (typeof msg === 'string') return msg;
    }
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

function renderPendingPage(status: PublicResultStatus): string {
  const statusPath = `/public/results/${encodeURIComponent(status.orderId)}/status`;
  const pdfPath = `/public/results/${encodeURIComponent(status.orderId)}/pdf`;
  const initialStatusJson = serializeForInlineScript(status);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Result Status</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f1f5f9;
      --card-bg: #ffffff;
      --ink: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --blue: #2563eb;
      --blue-soft: #dbeafe;
      --green: #16a34a;
      --green-soft: #dcfce7;
      --amber: #d97706;
      --amber-soft: #ffedd5;
      --slate-soft: #e2e8f0;
      --danger: #dc2626;
      --danger-soft: #fee2e2;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(180deg, #e2e8f0 0%, #f8fafc 40%, #f8fafc 100%);
      color: var(--ink);
      min-height: 100vh;
      padding: 18px;
    }

    .wrap {
      max-width: 860px;
      margin: 0 auto;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: 0 10px 30px rgb(15 23 42 / 0.08);
      overflow: hidden;
    }

    .header {
      padding: 20px 20px 14px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }

    .top-line {
      margin: 0;
      line-height: 1.55;
      font-size: 1.04rem;
      font-weight: 700;
      color: #1d4ed8;
    }

    .top-line + .top-line {
      margin-top: 6px;
      color: #0f766e;
    }

    .watermark {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }

    .watermark img {
      max-height: 58px;
      max-width: 100%;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #fff;
    }

    .watermark .wm-text {
      font-size: 0.78rem;
      color: var(--muted);
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .summary {
      padding: 14px 20px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      border-bottom: 1px solid var(--line);
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      font-size: 0.92rem;
      color: var(--muted);
    }

    .summary-row strong {
      color: var(--ink);
      font-weight: 700;
    }

    .overall {
      padding: 14px 20px;
      border-bottom: 1px solid var(--line);
      background: #fcfdff;
    }

    .overall-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
      color: var(--muted);
      font-size: 0.88rem;
      font-weight: 600;
    }

    .overall-track {
      height: 11px;
      border-radius: 999px;
      background: var(--slate-soft);
      overflow: hidden;
    }

    .overall-fill {
      height: 100%;
      width: 0;
      background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%);
      transition: width 0.35s ease;
    }

    .tests {
      padding: 14px 20px 18px;
      display: grid;
      gap: 10px;
    }

    .test-row {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #fff;
    }

    .test-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .test-name {
      font-weight: 700;
      font-size: 0.92rem;
      color: var(--ink);
      line-height: 1.3;
    }

    .test-dept {
      margin-top: 2px;
      font-size: 0.78rem;
      color: var(--muted);
    }

    .badge {
      font-size: 0.73rem;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 999px;
      white-space: nowrap;
      border: 1px solid transparent;
    }

    .badge-verified {
      color: #166534;
      background: var(--green-soft);
      border-color: #86efac;
    }

    .badge-progress {
      color: #92400e;
      background: var(--amber-soft);
      border-color: #fdba74;
    }

    .badge-pending {
      color: #334155;
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .badge-rejected {
      color: #991b1b;
      background: var(--danger-soft);
      border-color: #fecaca;
    }

    .bar-track {
      margin-top: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--slate-soft);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      width: 0;
      border-radius: inherit;
      transition: width 0.35s ease;
      background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
    }

    .bar-fill.verified {
      background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
    }

    .bar-fill.neutral {
      background: linear-gradient(90deg, #94a3b8 0%, #64748b 100%);
    }

    .bar-fill.overdue {
      background: linear-gradient(90deg, #f97316 0%, #dc2626 100%);
    }

    .test-meta {
      margin-top: 6px;
      min-height: 1.1em;
      font-size: 0.77rem;
      color: var(--muted);
      font-weight: 600;
    }

    .footer {
      border-top: 1px solid var(--line);
      padding: 10px 20px 14px;
      color: var(--muted);
      font-size: 0.8rem;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
    }

    @media (max-width: 640px) {
      body {
        padding: 10px;
      }

      .header,
      .summary,
      .overall,
      .tests,
      .footer {
        padding-left: 12px;
        padding-right: 12px;
      }

      .top-line {
        font-size: 0.97rem;
      }

      .summary-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <p class="top-line" dir="rtl">تکایە چاوەڕێ بکە، ئەنجامی تاقیکردنەوەکانت بە شێوەی خۆکار نوێ دەبێتەوە.</p>
        <p class="top-line" dir="rtl">يرجى الانتظار، يتم تحديث حالة التحاليل تلقائياً حتى اكتمال النتيجة.</p>
        <div class="watermark" id="wm-wrap" style="display:none;">
          <img id="wm-image" alt="Online watermark" style="display:none;" />
          <div class="wm-text" id="wm-text" style="display:none;"></div>
        </div>
      </div>

      <div class="summary">
        <div class="summary-row"><span>Patient</span><strong id="patient-name">-</strong></div>
        <div class="summary-row"><span>Order</span><strong id="order-number">-</strong></div>
        <div class="summary-row"><span>Registered</span><strong id="registered-at">-</strong></div>
      </div>

      <div class="overall">
        <div class="overall-head">
          <span id="overall-label">Progress</span>
          <span id="overall-stats">0 / 0</span>
        </div>
        <div class="overall-track">
          <div class="overall-fill" id="overall-fill"></div>
        </div>
      </div>

      <div class="tests" id="tests-list"></div>

      <div class="footer">
        <div id="polling-note">Checking every 5 seconds...</div>
        <div id="last-updated">-</div>
      </div>
    </div>
  </div>

  <script>
    (function () {
      var state = ${initialStatusJson};
      var statusUrl = ${JSON.stringify(statusPath)};
      var pdfUrl = ${JSON.stringify(pdfPath)};

      function escapeHtml(value) {
        var s = value == null ? '' : String(value);
        return s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function normalizeTestStatus(status) {
        var normalized = String(status || '').trim().toUpperCase();
        if (normalized === 'VERIFIED') return 'VERIFIED';
        if (normalized === 'COMPLETED') return 'COMPLETED';
        if (normalized === 'IN_PROGRESS') return 'IN_PROGRESS';
        if (normalized === 'REJECTED') return 'REJECTED';
        return 'PENDING';
      }

      function formatDateTime(iso) {
        if (!iso) return '-';
        var dt = new Date(iso);
        if (isNaN(dt.getTime())) return '-';
        return dt.toLocaleString();
      }

      function updateWatermark(current) {
        var wrap = document.getElementById('wm-wrap');
        var image = document.getElementById('wm-image');
        var text = document.getElementById('wm-text');
        if (!wrap || !image || !text) return;

        var hasImage = !!current.onlineResultWatermarkDataUrl;
        var hasText = !!current.onlineResultWatermarkText;

        if (!hasImage && !hasText) {
          wrap.style.display = 'none';
          return;
        }

        wrap.style.display = 'flex';

        if (hasImage) {
          image.src = String(current.onlineResultWatermarkDataUrl);
          image.style.display = 'block';
        } else {
          image.removeAttribute('src');
          image.style.display = 'none';
        }

        if (hasText) {
          text.textContent = String(current.onlineResultWatermarkText);
          text.style.display = 'block';
        } else {
          text.textContent = '';
          text.style.display = 'none';
        }
      }

      function resolveTestProgress(current, test, nowMs) {
        var status = normalizeTestStatus(test.status);
        if (test.isVerified || status === 'VERIFIED') {
          return { percent: 100, barClass: 'verified', meta: 'Verified' };
        }

        var expected = Number(test.expectedCompletionMinutes || 0);
        var registeredAtMs = Date.parse(current.registeredAt || '');

        if (isFinite(expected) && expected > 0 && isFinite(registeredAtMs)) {
          var totalMs = Math.round(expected) * 60 * 1000;
          var elapsedMs = Math.max(0, nowMs - registeredAtMs);
          var percent = Math.round((elapsedMs / totalMs) * 100);
          if (percent < 0) percent = 0;
          if (percent > 100) percent = 100;

          var dueAtMs = registeredAtMs + totalMs;
          var remainingMs = dueAtMs - nowMs;
          if (remainingMs >= 0) {
            var remainingMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
            return { percent: percent, barClass: '', meta: 'ETA ' + remainingMinutes + ' min' };
          }

          var overdueMinutes = Math.max(1, Math.ceil(Math.abs(remainingMs) / (60 * 1000)));
          return { percent: 100, barClass: 'overdue', meta: 'Overdue ' + overdueMinutes + ' min' };
        }

        var neutralPercent = status === 'IN_PROGRESS' ? 45 : 20;
        return { percent: neutralPercent, barClass: 'neutral', meta: '' };
      }

      function getStatusBadge(status) {
        if (status === 'VERIFIED') {
          return { label: 'Verified', className: 'badge badge-verified' };
        }
        if (status === 'COMPLETED' || status === 'IN_PROGRESS') {
          return { label: 'In progress', className: 'badge badge-progress' };
        }
        if (status === 'REJECTED') {
          return { label: 'Rejected', className: 'badge badge-rejected' };
        }
        return { label: 'Pending', className: 'badge badge-pending' };
      }

      function render(current) {
        var patientNode = document.getElementById('patient-name');
        var orderNode = document.getElementById('order-number');
        var registeredNode = document.getElementById('registered-at');
        var overallStatsNode = document.getElementById('overall-stats');
        var overallFillNode = document.getElementById('overall-fill');
        var overallLabelNode = document.getElementById('overall-label');
        var testsNode = document.getElementById('tests-list');
        var lastUpdatedNode = document.getElementById('last-updated');

        if (!patientNode || !orderNode || !registeredNode || !overallStatsNode || !overallFillNode || !overallLabelNode || !testsNode) {
          return;
        }

        updateWatermark(current);

        patientNode.textContent = String(current.patientName || '-');
        orderNode.textContent = String(current.orderNumber || '-');
        registeredNode.textContent = formatDateTime(current.registeredAt);

        var reportableCount = Number(current.reportableCount || 0);
        var verifiedCount = Number(current.verifiedCount || 0);
        var progressPercent = Number(current.progressPercent || 0);
        if (!isFinite(progressPercent) || progressPercent < 0) progressPercent = 0;
        if (progressPercent > 100) progressPercent = 100;

        overallLabelNode.textContent = 'Overall progress ' + progressPercent + '%';
        overallStatsNode.textContent = verifiedCount + ' / ' + reportableCount;
        overallFillNode.style.width = progressPercent + '%';

        var nowMs = Date.now();
        var rows = [];
        var tests = Array.isArray(current.tests) ? current.tests : [];

        for (var i = 0; i < tests.length; i += 1) {
          var test = tests[i] || {};
          var status = normalizeTestStatus(test.status);
          var badge = getStatusBadge(status);
          var progress = resolveTestProgress(current, test, nowMs);
          var meta = progress.meta ? '<div class="test-meta">' + escapeHtml(progress.meta) + '</div>' : '<div class="test-meta"></div>';

          rows.push(
            '<div class="test-row">' +
              '<div class="test-head">' +
                '<div class="test-name">' + escapeHtml(test.testCode || '-') + ' - ' + escapeHtml(test.testName || '-') + '</div>' +
                '<span class="' + badge.className + '">' + escapeHtml(badge.label) + '</span>' +
              '</div>' +
              '<div class="test-dept">' + escapeHtml(test.departmentName || '-') + '</div>' +
              '<div class="bar-track"><div class="bar-fill ' + progress.barClass + '" style="width:' + progress.percent + '%"></div></div>' +
              meta +
            '</div>'
          );
        }

        if (rows.length === 0) {
          rows.push('<div class="test-row"><div class="test-name">No reportable tests yet.</div></div>');
        }

        testsNode.innerHTML = rows.join('');
        if (lastUpdatedNode) {
          lastUpdatedNode.textContent = 'Last update: ' + new Date().toLocaleTimeString();
        }
      }

      async function pollStatus() {
        try {
          var response = await fetch(statusUrl, {
            method: 'GET',
            cache: 'no-store',
            headers: {
              Accept: 'application/json'
            }
          });
          if (!response.ok) {
            return;
          }
          var nextState = await response.json();
          if (nextState && nextState.ready) {
            window.location.replace(pdfUrl);
            return;
          }
          state = nextState;
          render(state);
        } catch {
          // Keep current state on intermittent errors and retry on next interval.
        }
      }

      if (state && state.ready) {
        window.location.replace(pdfUrl);
        return;
      }

      render(state);
      window.setInterval(pollStatus, 5000);
    })();
  </script>
</body>
</html>`;
}

function renderErrorPage(code: number, message: string): string {
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

@Controller('public/results')
export class PublicReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Get(':id/status')
  async getResultStatusJson(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    try {
      const status = await this.reportsService.getPublicResultStatus(orderId);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.status(200).json(status);
    } catch (error) {
      const statusCode = error instanceof HttpException ? error.getStatus() : 500;
      const message = extractErrorMessage(error, 'Unable to load result status.');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(statusCode).json({ message });
    }
  }

  @Get(':id')
  async getResultStatusPage(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    try {
      const status = await this.reportsService.getPublicResultStatus(orderId);

      if (status.ready) {
        return res.redirect(`/public/results/${orderId}/pdf`);
      }

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(renderPendingPage(status));
    } catch (error) {
      const statusCode = error instanceof HttpException ? error.getStatus() : 500;
      const message = extractErrorMessage(error, 'Unable to load result status.');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(statusCode).send(renderErrorPage(statusCode, message));
    }
  }

  @Get(':id/pdf')
  async getResultPdf(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.reportsService.generatePublicTestResultsPDF(orderId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="results-${orderId.substring(0, 8)}.pdf"`,
      );
      return res.send(pdfBuffer);
    } catch (error) {
      const statusCode = error instanceof HttpException ? error.getStatus() : 500;
      const message = extractErrorMessage(error, 'Unable to generate PDF.');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(statusCode).send(renderErrorPage(statusCode, message));
    }
  }
}

