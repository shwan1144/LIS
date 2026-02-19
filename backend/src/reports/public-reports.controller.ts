import { Controller, Get, HttpException, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService, type PublicResultStatus } from './reports.service';

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

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function renderStatusPage(status: PublicResultStatus): string {
  const readyBadge = status.ready
    ? '<span class="badge ready">Ready</span>'
    : '<span class="badge pending">Pending</span>';

  const progressText = `${status.verifiedCount}/${status.reportableCount} tests verified`;
  const paymentText = status.paymentStatus === 'paid' ? 'Paid' : 'Payment pending';
  const paymentBadge =
    status.paymentStatus === 'paid'
      ? '<span class="badge ready">Paid</span>'
      : '<span class="badge pending">Unpaid</span>';

  const actionHtml = status.ready
    ? `<a class="btn" href="/public/results/${status.orderId}/pdf">Download Result PDF</a>`
    : '<div class="hint">Result is not completed yet. Please check again later.</div>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Patient Result Status</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f3f5f9; color: #111827; }
    .wrap { max-width: 640px; margin: 24px auto; padding: 0 14px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; box-shadow: 0 3px 14px rgba(0,0,0,0.06); }
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
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="top">
        <h1>Laboratory Result</h1>
        ${readyBadge}
      </div>
      <div class="row"><div class="k">Lab</div><div class="v">${escapeHtml(status.labName)}</div></div>
      <div class="row"><div class="k">Patient</div><div class="v">${escapeHtml(status.patientName)}</div></div>
      <div class="row"><div class="k">Order #</div><div class="v">${escapeHtml(status.orderNumber)}</div></div>
      <div class="row"><div class="k">Registered At</div><div class="v">${escapeHtml(formatDateTime(status.registeredAt))}</div></div>
      <div class="row"><div class="k">Payment</div><div class="v">${escapeHtml(paymentText)} ${paymentBadge}</div></div>
      <div class="row"><div class="k">Progress</div><div class="v">${escapeHtml(progressText)}</div></div>
      <div class="row"><div class="k">Last Verified</div><div class="v">${escapeHtml(status.verifiedAt ? formatDateTime(status.verifiedAt) : '-')}</div></div>
      <div class="section">
        ${actionHtml}
      </div>
    </div>
  </div>
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
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':id')
  async getResultStatusPage(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    try {
      const status = await this.reportsService.getPublicResultStatus(orderId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(renderStatusPage(status));
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
