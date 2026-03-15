import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  ParseUUIDPipe,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ReportActionKind, ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';
import { buildLabActorContext } from '../types/lab-actor-context';
import { LAB_ROLE_GROUPS } from '../auth/lab-role-matrix';

interface RequestWithUser {
  user: {
    userId?: string | null;
    platformUserId?: string | null;
    isImpersonation?: boolean;
    username: string;
    labId: string;
    role?: string;
  };
}

const RESULTS_PDF_PROFILING_RESPONSE_HEADERS = [
  'x-report-print-attempt-id',
  'x-report-pdf-total-ms',
  'x-report-pdf-snapshot-ms',
  'x-report-pdf-verifier-lookup-ms',
  'x-report-pdf-assets-ms',
  'x-report-pdf-html-ms',
  'x-report-pdf-render-ms',
  'x-report-pdf-fallback-ms',
  'x-report-pdf-cache-hit',
  'x-report-pdf-inflight-join',
] as const;

function readSingleHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' && first.trim() ? first.trim() : null;
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...LAB_ROLE_GROUPS.REPORTS)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly auditService: AuditService,
  ) {}

  private setResultsPdfProfilingHeaders(
    res: Response,
    performance: {
      correlationId?: string | null;
      totalMs: number;
      snapshotMs: number;
      verifierLookupMs?: number;
      assetsMs?: number;
      htmlMs?: number;
      renderMs?: number;
      fallbackMs?: number;
      cacheHit: boolean;
      inFlightJoin: boolean;
    },
  ): void {
    if (performance.correlationId) {
      res.setHeader('x-report-print-attempt-id', performance.correlationId);
    }
    res.setHeader('x-report-pdf-total-ms', String(performance.totalMs));
    res.setHeader('x-report-pdf-snapshot-ms', String(performance.snapshotMs));
    res.setHeader(
      'x-report-pdf-verifier-lookup-ms',
      String(performance.verifierLookupMs ?? 0),
    );
    res.setHeader('x-report-pdf-assets-ms', String(performance.assetsMs ?? 0));
    res.setHeader('x-report-pdf-html-ms', String(performance.htmlMs ?? 0));
    res.setHeader('x-report-pdf-render-ms', String(performance.renderMs ?? 0));
    res.setHeader('x-report-pdf-fallback-ms', String(performance.fallbackMs ?? 0));
    res.setHeader('x-report-pdf-cache-hit', String(performance.cacheHit));
    res.setHeader('x-report-pdf-inflight-join', String(performance.inFlightJoin));
    res.setHeader(
      'Access-Control-Expose-Headers',
      RESULTS_PDF_PROFILING_RESPONSE_HEADERS.join(', '),
    );
  }

  @Get('orders/action-flags')
  async getOrderActionFlags(
    @Req() req: RequestWithUser,
    @Query('orderIds') orderIdsRaw = '',
    @Res() res: Response,
  ) {
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

  @Post('orders/:id/action-log')
  async logReportAction(
    @Req() req: RequestWithUser & { ip?: string; headers?: Record<string, string | string[] | undefined> },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() body: { action?: ReportActionKind },
    @Res() res: Response,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      return res.status(401).json({ message: 'Lab ID not found in token' });
    }

    const action = String(body?.action ?? '')
      .trim()
      .toUpperCase() as ReportActionKind;
    if (!['PDF', 'PRINT', 'WHATSAPP', 'VIBER'].includes(action)) {
      return res.status(400).json({ message: 'action must be PDF, PRINT, WHATSAPP, or VIBER' });
    }

    await this.logReportActionInternal(req, orderId, action);
    return res.status(201).json({ success: true });
  }

  @Get('orders/:id/receipt')
  async getOrderReceiptPDF(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      return res.status(401).json({ message: 'Lab ID not found in token' });
    }

    try {
      const pdfBuffer = await this.reportsService.generateOrderReceiptPDF(orderId, labId);
      const impersonationAudit =
        actor.isImpersonation && actor.platformUserId
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
        action: AuditAction.REPORT_GENERATE,
        entityType: 'order',
        entityId: orderId,
        description: `Generated order receipt PDF for order ${orderId}`,
        newValues: impersonationAudit,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="receipt-${orderId.substring(0, 8)}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: string | string[] }).message ?? error.message);
        return res.status(error.getStatus()).json({ message });
      }
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: 'Failed to generate PDF' });
    }
  }

  @Get('orders/:id/results')
  async getTestResultsPDF(
    @Req() req: Request & RequestWithUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      return res.status(401).json({ message: 'Lab ID not found in token' });
    }

    try {
      const correlationId = readSingleHeaderValue(req.headers['x-report-print-attempt-id']);
      const { pdf, performance } = await this.reportsService.generateTestResultsPDFWithProfile(
        orderId,
        labId,
        { correlationId },
      );
      const impersonationAudit =
        actor.isImpersonation && actor.platformUserId
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
        action: AuditAction.REPORT_GENERATE,
        entityType: 'order',
        entityId: orderId,
        description: `Generated test results PDF for order ${orderId}`,
        newValues: impersonationAudit,
      });
      this.setResultsPdfProfilingHeaders(res, performance);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="results-${orderId.substring(0, 8)}.pdf"`,
      );
      res.send(pdf);
    } catch (error) {
      console.error('Error generating results PDF:', error);
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: string | string[] }).message ?? error.message);
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

  @Post('orders/:id/delivery-log')
  async logReportDelivery(
    @Req() req: RequestWithUser & { ip?: string; headers?: Record<string, string | string[] | undefined> },
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() body: { channel?: 'WHATSAPP' | 'VIBER' },
    @Res() res: Response,
  ) {
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

  private async logReportActionInternal(
    req: RequestWithUser & { ip?: string; headers?: Record<string, string | string[] | undefined> },
    orderId: string,
    actionKind: ReportActionKind,
  ): Promise<void> {
    const labId = req.user?.labId;
    if (!labId) {
      return;
    }

    await this.reportsService.ensureOrderBelongsToLab(orderId, labId);
    const actor = buildLabActorContext(req.user);

    const impersonationAudit =
      actor.isImpersonation && actor.platformUserId
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
      action: AuditAction.REPORT_PRINT,
      entityType: 'order',
      entityId: orderId,
      description: `Report action ${actionKind} for order ${orderId}`,
      newValues: { actionKind, ...impersonationAudit },
      ipAddress: req.ip ?? null,
      userAgent: (req.headers?.['user-agent'] as string | undefined) ?? null,
    });
  }
}
