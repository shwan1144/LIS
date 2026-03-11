import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminHostGuard } from '../tenant/admin-host.guard';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  BulkMessagingService,
  type PlatformActorContext,
} from './bulk-messaging.service';

interface RequestWithPlatformUser {
  user: {
    platformUserId: string;
    role: string;
  };
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@Controller('admin/api/bulk-messaging')
@UseGuards(AdminHostGuard, AdminJwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'AUDITOR')
export class BulkMessagingController {
  constructor(private readonly bulkMessagingService: BulkMessagingService) {}

  @Get('labs/:labId/config')
  async getLabConfig(@Param('labId', ParseUUIDPipe) labId: string) {
    return this.bulkMessagingService.getLabConfig(labId);
  }

  @Patch('labs/:labId/config')
  @Roles('SUPER_ADMIN')
  async updateLabConfig(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
    @Body() body: { channels?: Record<string, unknown> },
  ) {
    return this.bulkMessagingService.updateLabConfig(labId, body, this.getActorContext(req));
  }

  @Get('labs/:labId/templates')
  async getLabTemplates(@Param('labId', ParseUUIDPipe) labId: string) {
    return this.bulkMessagingService.getLabTemplates(labId);
  }

  @Patch('labs/:labId/templates')
  @Roles('SUPER_ADMIN')
  async updateLabTemplates(
    @Req() req: RequestWithPlatformUser,
    @Param('labId', ParseUUIDPipe) labId: string,
    @Body() body: { templates?: Record<string, string | null | undefined> },
  ) {
    return this.bulkMessagingService.updateLabTemplates(labId, body, this.getActorContext(req));
  }

  @Post('preview')
  async preview(
    @Body()
    body: {
      labId: string;
      status?: string;
      q?: string;
      dateFrom?: string;
      dateTo?: string;
      excludedPhones?: string[] | string;
    },
  ) {
    return this.bulkMessagingService.preview(body);
  }

  @Post('send')
  @Roles('SUPER_ADMIN')
  async send(
    @Req() req: RequestWithPlatformUser,
    @Body()
    body: {
      labId: string;
      status?: string;
      q?: string;
      dateFrom?: string;
      dateTo?: string;
      excludedPhones?: string[] | string;
      channels: string[];
      templateOverrides?: Record<string, string | null | undefined>;
    },
  ) {
    return this.bulkMessagingService.send(body, this.getActorContext(req));
  }

  @Get('jobs')
  async listJobs(
    @Query('labId') labId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.bulkMessagingService.listJobs({
      labId,
      status,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  @Get('jobs/:batchId')
  async getJobDetail(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.bulkMessagingService.getJobDetail(batchId, {
      status,
      channel,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  private getActorContext(req: RequestWithPlatformUser): PlatformActorContext {
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
