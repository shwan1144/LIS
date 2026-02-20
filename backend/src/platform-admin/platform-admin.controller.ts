import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminHostGuard } from '../tenant/admin-host.guard';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformAdminService } from './platform-admin.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { SetLabStatusDto } from './dto/set-lab-status.dto';
import { ExportAuditLogsDto } from './dto/export-audit-logs.dto';
import { ResetLabUserPasswordDto } from './dto/reset-lab-user-password.dto';
import { StartImpersonationDto } from './dto/start-impersonation.dto';

interface RequestWithPlatformUser {
  user: {
    platformUserId: string;
    role: string;
    impersonatedLabId?: string | null;
    impersonationStartedAt?: string | null;
  };
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@Controller('admin/api')
@UseGuards(AdminHostGuard, AdminJwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'AUDITOR')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get('labs')
  async listLabs() {
    return this.platformAdminService.listLabs();
  }

  @Get('labs/list')
  async listLabsPaged(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.platformAdminService.listLabsPaged({
      q,
      status,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  @Get('impersonation')
  async getImpersonationStatus(@Req() req: RequestWithPlatformUser) {
    return this.platformAdminService.getImpersonationStatus(req.user);
  }

  @Post('impersonation/start')
  @Roles('SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async startImpersonation(
    @Req() req: RequestWithPlatformUser,
    @Body() dto: StartImpersonationDto,
  ) {
    return this.platformAdminService.startImpersonation(dto, {
      ...this.getActorContext(req),
      impersonatedLabId: req.user.impersonatedLabId ?? null,
    });
  }

  @Post('impersonation/stop')
  @Roles('SUPER_ADMIN')
  async stopImpersonation(@Req() req: RequestWithPlatformUser) {
    return this.platformAdminService.stopImpersonation({
      ...this.getActorContext(req),
      impersonatedLabId: req.user.impersonatedLabId ?? null,
    });
  }

  @Post('impersonation/open-lab')
  @Roles('SUPER_ADMIN')
  async openImpersonatedLabPortal(@Req() req: RequestWithPlatformUser) {
    return this.platformAdminService.createImpersonatedLabPortalToken({
      ...this.getActorContext(req),
      impersonatedLabId: req.user.impersonatedLabId ?? null,
    });
  }

  @Post('labs')
  @Roles('SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createLab(@Req() req: RequestWithPlatformUser, @Body() dto: CreateLabDto) {
    return this.platformAdminService.createLab(dto, this.getActorContext(req));
  }

  @Get('labs/:labId')
  async getLab(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
  ) {
    return this.platformAdminService.getLab(labId, this.getActorContext(req));
  }

  @Patch('labs/:labId')
  @Roles('SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateLab(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
    @Body() dto: UpdateLabDto,
  ) {
    return this.platformAdminService.updateLab(labId, dto, this.getActorContext(req));
  }

  @Post('labs/:labId/status')
  @Roles('SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async setLabStatus(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
    @Body() dto: SetLabStatusDto,
  ) {
    return this.platformAdminService.setLabStatus(labId, dto, this.getActorContext(req));
  }

  @Get('dashboard/summary')
  async getSummary(
    @Req() req: RequestWithPlatformUser,
    @Query('labId') labId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.platformAdminService.getSummary(
      { labId, dateFrom, dateTo },
      this.getActorContext(req),
    );
  }

  @Get('settings/roles')
  async getSettingsRoles() {
    return this.platformAdminService.getSettingsRoles();
  }

  @Get('labs/:labId/settings')
  async getLabSettings(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
  ) {
    return this.platformAdminService.getLabSettings(labId, this.getActorContext(req));
  }

  @Patch('labs/:labId/settings')
  @Roles('SUPER_ADMIN')
  async updateLabSettings(
    @Param('labId', ParseUUIDPipe) labId: string,
    @Body()
    body: {
      labelSequenceBy?: string;
      sequenceResetBy?: string;
      enableOnlineResults?: boolean;
      onlineResultWatermarkDataUrl?: string | null;
      onlineResultWatermarkText?: string | null;
      reportBranding?: {
        bannerDataUrl?: string | null;
        footerDataUrl?: string | null;
        logoDataUrl?: string | null;
        watermarkDataUrl?: string | null;
      };
    },
  ) {
    return this.platformAdminService.updateLabSettings(labId, body);
  }

  @Get('labs/:labId/users')
  async getLabUsers(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
  ) {
    return this.platformAdminService.getLabUsers(labId, this.getActorContext(req));
  }

  @Get('labs/:labId/users/:id')
  async getLabUser(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.platformAdminService.getLabUser(id, labId, this.getActorContext(req));
  }

  @Post('labs/:labId/users')
  @Roles('SUPER_ADMIN')
  async createLabUser(
    @Param('labId', ParseUUIDPipe) labId: string,
    @Body()
    body: {
      username: string;
      password: string;
      fullName?: string;
      email?: string;
      role: string;
      shiftIds?: string[];
      departmentIds?: string[];
    },
  ) {
    return this.platformAdminService.createLabUser(labId, body);
  }

  @Patch('labs/:labId/users/:id')
  @Roles('SUPER_ADMIN')
  async updateLabUser(
    @Param('labId', ParseUUIDPipe) labId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      role?: string;
      defaultLabId?: string;
      isActive?: boolean;
      shiftIds?: string[];
      departmentIds?: string[];
      password?: string;
    },
  ) {
    return this.platformAdminService.updateLabUser(id, labId, body);
  }

  @Delete('labs/:labId/users/:id')
  @Roles('SUPER_ADMIN')
  async deleteLabUser(
    @Param('labId', ParseUUIDPipe) labId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.platformAdminService.deleteLabUser(id, labId);
  }

  @Post('labs/:labId/users/:id/reset-password')
  @Roles('SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async resetLabUserPassword(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetLabUserPasswordDto,
  ) {
    return this.platformAdminService.resetLabUserPassword(
      id,
      labId,
      dto,
      this.getActorContext(req),
    );
  }

  @Get('labs/:labId/shifts')
  async getLabShifts(@Param('labId', ParseUUIDPipe) labId: string) {
    return this.platformAdminService.getLabShifts(labId);
  }

  @Get('labs/:labId/departments')
  async getLabDepartments(@Param('labId', ParseUUIDPipe) labId: string) {
    return this.platformAdminService.getLabDepartments(labId);
  }

  @Get('orders')
  async listOrders(
    @Req() req: RequestWithPlatformUser,
    @Query('labId') labId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.platformAdminService.listOrders({
      labId,
      status,
      q,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    }, this.getActorContext(req));
  }

  @Get('orders/:orderId')
  async getOrderDetail(
    @Req() req: RequestWithPlatformUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.platformAdminService.getOrderDetail(orderId, this.getActorContext(req));
  }

  @Get('orders/:orderId/results')
  @Roles('SUPER_ADMIN')
  async getOrderResultsPdf(
    @Req() req: RequestWithPlatformUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    try {
      const { pdfBuffer, fileName } = await this.platformAdminService.generateOrderResultsPdf(
        orderId,
        this.getActorContext(req),
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
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
      return res.status(500).json({ message: 'Failed to generate results PDF' });
    }
  }

  @Get('audit-logs')
  async listAuditLogs(
    @Query('labId') labId?: string,
    @Query('actorType') actorType?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.platformAdminService.listAuditLogs({
      labId,
      actorType,
      action,
      entityType,
      search,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  @Post('audit-logs/export')
  @Roles('SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async exportAuditLogs(
    @Req() req: RequestWithPlatformUser,
    @Body() dto: ExportAuditLogsDto,
    @Res() res: Response,
  ) {
    try {
      const { csvBuffer, fileName } = await this.platformAdminService.exportAuditLogsCsv(
        dto,
        this.getActorContext(req),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csvBuffer);
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: string | string[] }).message ?? error.message);
        return res.status(error.getStatus()).json({ message });
      }
      return res.status(500).json({ message: 'Failed to export audit logs' });
    }
  }

  @Get('audit-logs/actions')
  async getAuditActions() {
    return this.platformAdminService.getAuditActionOptions();
  }

  @Get('audit-logs/entity-types')
  async getAuditEntityTypes(@Query('labId') labId?: string) {
    return this.platformAdminService.getAuditEntityTypeOptions({ labId });
  }

  @Get('system-health')
  async getSystemHealth() {
    return this.platformAdminService.getSystemHealth();
  }

  @Get('settings/platform')
  async getPlatformSettingsOverview() {
    return this.platformAdminService.getPlatformSettingsOverview();
  }

  private getActorContext(req: RequestWithPlatformUser) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : (forwardedFor?.split(',')[0]?.trim() ?? req.ip ?? null);
    const userAgentHeader = req.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader.join('; ')
      : (userAgentHeader ?? null);

    return {
      platformUserId: req.user.platformUserId,
      role: req.user.role,
      ipAddress,
      userAgent,
    };
  }
}
