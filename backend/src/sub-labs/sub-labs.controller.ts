import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LAB_ROLE_GROUPS } from '../auth/lab-role-matrix';
import { SaveSubLabDto } from './dto/save-sub-lab.dto';
import { SubLabsService } from './sub-labs.service';
import { OrderStatus } from '../entities/order.entity';
import { OrderResultStatus } from '../orders/dto/create-order-response.dto';
import { StatisticsQueryDto } from '../dashboard/dto/statistics-query.dto';
import {
  addDaysToDateKey,
  formatDateKeyForTimeZone,
  getUtcRangeForLabDate,
} from '../database/lab-timezone.util';
import { DashboardService } from '../dashboard/dashboard.service';

interface RequestWithUser {
  user: {
    userId?: string | null;
    username: string;
    labId: string;
    role?: string;
    subLabId?: string | null;
  };
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubLabsController {
  constructor(
    private readonly subLabsService: SubLabsService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('settings/sub-labs')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async listSubLabs(@Req() req: RequestWithUser) {
    return this.subLabsService.listForLab(req.user.labId);
  }

  @Get('settings/sub-labs/options')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  async listSubLabOptions(@Req() req: RequestWithUser) {
    return this.subLabsService.listActiveOptions(req.user.labId);
  }

  @Get('settings/sub-labs/:id')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async getSubLab(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subLabsService.getForLab(req.user.labId, id);
  }

  @Post('settings/sub-labs')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createSubLab(
    @Req() req: RequestWithUser,
    @Body() dto: SaveSubLabDto,
  ) {
    return this.subLabsService.createForLab(req.user.labId, dto);
  }

  @Patch('settings/sub-labs/:id')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateSubLab(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveSubLabDto,
  ) {
    return this.subLabsService.updateForLab(req.user.labId, id, dto);
  }

  @Delete('settings/sub-labs/:id')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async archiveSubLab(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subLabsService.archiveForLab(req.user.labId, id);
  }

  @Get('sub-lab/profile')
  @Roles(...LAB_ROLE_GROUPS.SUB_LAB_PORTAL)
  async getPortalProfile(@Req() req: RequestWithUser) {
    return this.subLabsService.getPortalProfile(
      req.user.labId,
      req.user.subLabId ?? '',
    );
  }

  @Get('sub-lab/orders')
  @Roles(...LAB_ROLE_GROUPS.SUB_LAB_PORTAL)
  async listPortalOrders(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('shiftId') shiftId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('dateFilterTimeZone') dateFilterTimeZone?: string,
    @Query('resultStatus', new ParseEnumPipe(OrderResultStatus, { optional: true }))
    resultStatus?: OrderResultStatus,
  ) {
    return this.subLabsService.listPortalOrders(req.user.labId, req.user.subLabId ?? '', {
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
      search,
      status: status as OrderStatus | undefined,
      patientId,
      shiftId,
      startDate,
      endDate,
      dateFilterTimeZone,
      resultStatus,
    });
  }

  @Get('sub-lab/orders/:id')
  @Roles(...LAB_ROLE_GROUPS.SUB_LAB_PORTAL)
  async getPortalOrderDetail(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subLabsService.getPortalOrderDetail(req.user.labId, req.user.subLabId ?? '', id);
  }

  @Get('sub-lab/orders/:id/results')
  @Roles(...LAB_ROLE_GROUPS.SUB_LAB_PORTAL)
  async downloadPortalOrderResults(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.subLabsService.generatePortalResultsPdf(
      req.user.labId,
      req.user.subLabId ?? '',
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="results-${id.substring(0, 8)}.pdf"`,
    );
    return res.send(pdf);
  }

  @Get('sub-lab/statistics')
  @Roles(...LAB_ROLE_GROUPS.SUB_LAB_PORTAL)
  async getPortalStatistics(
    @Req() req: RequestWithUser,
    @Query() query: StatisticsQueryDto,
  ) {
    const timeZone = await this.dashboardService.getLabTimeZone(req.user.labId);
    const { startDate, endDate } = this.resolveRange(timeZone, query.startDate, query.endDate);
    return this.subLabsService.getPortalStatistics(
      req.user.labId,
      req.user.subLabId ?? '',
      startDate,
      endDate,
    );
  }

  private resolveRange(
    timeZone: string,
    startDateStr?: string,
    endDateStr?: string,
  ): { startDate: Date; endDate: Date } {
    const endDateLabel = endDateStr?.trim() || formatDateKeyForTimeZone(new Date(), timeZone);
    const startDateLabel = startDateStr?.trim() || addDaysToDateKey(endDateLabel, -30);
    const { startDate } = getUtcRangeForLabDate(startDateLabel, timeZone);
    const { endDate } = getUtcRangeForLabDate(endDateLabel, timeZone);
    return { startDate, endDate };
  }
}
