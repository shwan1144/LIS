import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditAction } from '../entities/audit-log.entity';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(
    @Req() req: RequestWithUser,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }

    // Parse action - can be comma-separated
    let actions: AuditAction | AuditAction[] | undefined;
    if (action) {
      const actionList = action.split(',').filter((a) =>
        Object.values(AuditAction).includes(a as AuditAction),
      ) as AuditAction[];
      actions = actionList.length === 1 ? actionList[0] : actionList;
    }

    return this.auditService.findAll(labId, {
      userId,
      action: actions,
      entityType,
      entityId,
      startDate,
      endDate,
      search,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  @Get('actions')
  async getActions() {
    return this.auditService.getActions();
  }

  @Get('entity-types')
  async getEntityTypes(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.auditService.getEntityTypes(labId);
  }
}
