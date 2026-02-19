import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  Res,
  ParseUUIDPipe,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('orders/:id/receipt')
  async getOrderReceiptPDF(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      return res.status(401).json({ message: 'Lab ID not found in token' });
    }

    try {
      const pdfBuffer = await this.reportsService.generateOrderReceiptPDF(orderId, labId);
      await this.auditService.log({
        labId,
        userId: req.user?.userId ?? null,
        action: AuditAction.REPORT_GENERATE,
        entityType: 'order',
        entityId: orderId,
        description: `Generated order receipt PDF for order ${orderId}`,
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
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      return res.status(401).json({ message: 'Lab ID not found in token' });
    }

    try {
      const pdfBuffer = await this.reportsService.generateTestResultsPDF(orderId, labId);
      await this.auditService.log({
        labId,
        userId: req.user?.userId ?? null,
        action: AuditAction.REPORT_GENERATE,
        entityType: 'order',
        entityId: orderId,
        description: `Generated test results PDF for order ${orderId}`,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="results-${orderId.substring(0, 8)}.pdf"`,
      );
      res.send(pdfBuffer);
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

    await this.auditService.log({
      labId,
      userId: req.user?.userId ?? null,
      action: AuditAction.REPORT_PRINT,
      entityType: 'order',
      entityId: orderId,
      description: `Shared report link via ${body.channel} for order ${orderId}`,
      newValues: { channel: body.channel },
      ipAddress: req.ip ?? null,
      userAgent: (req.headers?.['user-agent'] as string | undefined) ?? null,
    });

    return res.status(201).json({ success: true });
  }
}
