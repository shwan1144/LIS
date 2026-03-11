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
  const now = new Date();
  const registeredAtMs = new Date(status.registeredAt || now).getTime();
  const elapsedMinutes = Math.max(0, (now.getTime() - registeredAtMs) / 60000);

  const testsHtml = (status.tests || []).map(t => {
    const isCompleted = t.isVerified;
    const statusText = isCompleted ? 'Completed' : 'Pending';
    const statusColor = isCompleted ? '#10b981' : '#f59e0b';

    let percent = 0;
    if (isCompleted) {
      percent = 100;
    } else if (t.expectedCompletionMinutes && t.expectedCompletionMinutes > 0) {
      percent = Math.floor((elapsedMinutes / t.expectedCompletionMinutes) * 100);
      // Cap at 95% so it never hits 100% until actually completed
      if (percent > 95) percent = 95;
    } else {
      // Default fallback if no expected time is set (e.g. 50% or indeterminate)
      percent = 50;
    }

    return `
      <div class="test-item">
        <div class="test-header">
          <div class="test-name" dir="auto">${escapeHtml(t.testName)}</div>
          <div class="test-status" style="color: ${statusColor}">${statusText}</div>
        </div>
        <div class="test-progress-container">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${isCompleted ? 'completed-fill' : ''}" style="width: ${percent}%;"></div>
          </div>
          <div class="expected-text">
             ${!isCompleted && t.expectedCompletionMinutes ? `Estimated time: ${t.expectedCompletionMinutes} min` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Result Status</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem 0; box-sizing: border-box; }
    .card { background: #fff; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 90%; width: 500px; }
    .patient { font-size: 1.1rem; color: #475569; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: center; }
    
    .msg-block { margin-bottom: 1.5rem; text-align: center; }
    .msg { font-size: 1.15rem; font-weight: 700; color: #2563eb; margin-bottom: 0.25rem; }
    .sub-msg { font-size: 0.95rem; color: #64748b; }
    .msg-ku, .msg-ar { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .sub-msg-ku, .sub-msg-ar { font-size: 1rem; }

    .test-list { display: flex; flex-direction: column; gap: 0.75rem; max-height: 350px; overflow-y: auto; padding-right: 0.5rem; margin-bottom: 2rem; margin-top: 1rem; border-top: 1px solid #e2e8f0; padding-top: 1.5rem; }
    .test-list::-webkit-scrollbar { width: 6px; }
    .test-list::-webkit-scrollbar-track { background: transparent; }
    .test-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    .test-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .test-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .test-name { font-weight: 600; font-size: 0.95rem; color: #334155; word-break: break-word; flex: 1; text-align: left; }
    .test-status { font-size: 0.85rem; font-weight: 700; white-space: nowrap; }
    
    .test-progress-container { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem; }
    .progress-bar-bg { background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden; width: 100%; }
    .progress-bar-fill { background: #3b82f6; height: 100%; transition: width 0.3s ease; }
    .completed-fill { background: #10b981; }
    .expected-text { font-size: 0.75rem; color: #94a3b8; text-align: right; min-height: 12px; }
    
    .refresh { font-size: 0.875rem; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="patient" dir="auto">${escapeHtml(status.patientName)}</div>
    
    <div class="msg-block" dir="rtl">
      <div class="msg msg-ku">ئەنجامەکان هێشتا کاریان لەسەر دەکرێت</div>
      <div class="sub-msg sub-msg-ku">تکایە چاوەڕێ بکە تا ڕاپۆرتەکە تەواو دەبێت</div>
    </div>
    
    <div class="msg-block" dir="rtl">
      <div class="msg msg-ar">النتائج لا تزال قيد المعالجة</div>
      <div class="sub-msg sub-msg-ar">يرجى الانتظار حتى يكتمل التقرير</div>
    </div>
    
    <div class="msg-block">
      <div class="msg">Result is still in processing</div>
      <div class="sub-msg">Please wait while the report is being completed</div>
    </div>
    
    <div class="test-list">
      ${testsHtml}
    </div>

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

  @Get(':id')
  async getResultStatusPage(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    try {
      const status = await this.reportsService.getPublicResultStatus(orderId);

      if (status.ready) {
        const pdfUrl = `/public/results/${orderId}/pdf`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(`
        <!doctype html>
        <html>
        <head><title>Result Ready</title></head>
        <body>
          <script>
            try {
              if (window.top) {
                window.top.location.href = '${pdfUrl}';
              } else {
                window.location.href = '${pdfUrl}';
              }
            } catch (e) {
              window.location.href = '${pdfUrl}';
            }
          </script>
        </body>
        </html>
      `);
      }

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