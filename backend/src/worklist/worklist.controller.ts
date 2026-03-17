import {
  Controller,
  Delete,
  Get,
  ForbiddenException,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  ParseEnumPipe,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  WorklistEntryStatus,
  WorklistOrderMode,
  WorklistService,
  WorklistVerificationStatus,
  WorklistView,
} from './worklist.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CultureResultPayload, OrderTestStatus } from '../entities/order-test.entity';
import { buildLabActorContext } from '../types/lab-actor-context';
import {
  assertWorklistModeAllowed,
  assertWorklistViewAllowed,
  LAB_ROLE_GROUPS,
} from '../auth/lab-role-matrix';
import type { Response } from 'express';

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

type UploadedResultDocumentFile = {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
};

@Controller('worklist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorklistController {
  constructor(private readonly worklistService: WorklistService) { }

  @Get()
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_LANE_READ)
  async getWorklist(
    @Req() req: RequestWithUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('date') date?: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('view', new ParseEnumPipe(WorklistView, { optional: true }))
    view?: WorklistView,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    const selectedView = view ?? WorklistView.FULL;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    if (!req.user?.role) {
      throw new ForbiddenException('Missing role in token');
    }
    assertWorklistViewAllowed(req.user.role, selectedView);

    // Parse status filter
    let statuses: OrderTestStatus[] | undefined;
    if (status) {
      statuses = status.split(',').filter((s) =>
        Object.values(OrderTestStatus).includes(s as OrderTestStatus)
      ) as OrderTestStatus[];
    }

    return this.worklistService.getWorklist(
      labId,
      {
        status: statuses,
        search,
        date,
        departmentId,
        page: page ? parseInt(page, 10) : undefined,
        size: size ? parseInt(size, 10) : undefined,
        view: selectedView,
      },
      actor.userId ?? undefined,
    );
  }

  @Get('orders')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_LANE_READ)
  async getWorklistOrders(
    @Req() req: RequestWithUser,
    @Query('search') search?: string,
    @Query('date') date?: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('mode', new ParseEnumPipe(WorklistOrderMode, { optional: true }))
    mode?: WorklistOrderMode,
    @Query('entryStatus', new ParseEnumPipe(WorklistEntryStatus, { optional: true }))
    entryStatus?: WorklistEntryStatus,
    @Query(
      'verificationStatus',
      new ParseEnumPipe(WorklistVerificationStatus, { optional: true }),
    )
    verificationStatus?: WorklistVerificationStatus,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    const selectedMode = mode ?? WorklistOrderMode.ENTRY;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    if (!req.user?.role) {
      throw new ForbiddenException('Missing role in token');
    }
    assertWorklistModeAllowed(req.user.role, selectedMode);

    return this.worklistService.getWorklistOrders(
      labId,
      {
        search,
        date,
        departmentId,
        page: page ? parseInt(page, 10) : undefined,
        size: size ? parseInt(size, 10) : undefined,
        mode: selectedMode,
        entryStatus,
        verificationStatus,
      },
      actor.userId ?? undefined,
    );
  }

  @Get('orders/:orderId/tests')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_LANE_READ)
  async getWorklistOrderTests(
    @Req() req: RequestWithUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query('departmentId') departmentId?: string,
    @Query('mode', new ParseEnumPipe(WorklistOrderMode, { optional: true }))
    mode?: WorklistOrderMode,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    const selectedMode = mode ?? WorklistOrderMode.ENTRY;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    if (!req.user?.role) {
      throw new ForbiddenException('Missing role in token');
    }
    assertWorklistModeAllowed(req.user.role, selectedMode);

    return this.worklistService.getWorklistOrderTests(
      orderId,
      labId,
      {
        departmentId,
        mode: selectedMode,
      },
      actor.userId ?? undefined,
    );
  }

  @Get('culture-entry-history')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_LANE_READ)
  async getCultureEntryHistory(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.getCultureEntryHistory(labId);
  }

  @Get(':id/detail')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_LANE_READ)
  async getWorklistItemDetail(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.getWorklistItemDetail(id, labId, actor.userId ?? undefined);
  }

  @Get('stats')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_STATS_READ)
  async getStats(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.getWorklistStats(labId);
  }

  @Patch(':id/result')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_ENTRY)
  async enterResult(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      resultValue?: number | null;
      resultText?: string | null;
      comments?: string | null;
      resultParameters?: Record<string, string> | null;
      cultureResult?: CultureResultPayload | null;
      forceEditVerified?: boolean;
    },
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.enterResult(id, labId, actor, body, req.user?.role);
  }

  @Patch('batch-result')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_ENTRY)
  async batchEnterResults(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      updates: Array<{
        orderTestId: string;
        resultValue?: number | null;
        resultText?: string | null;
        comments?: string | null;
        resultParameters?: Record<string, string> | null;
        cultureResult?: CultureResultPayload | null;
        forceEditVerified?: boolean;
      }>;
    },
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.batchEnterResults(labId, actor, req.user?.role, body.updates);
  }

  @Post('order-tests/:id/result-document')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_ENTRY)
  @UseInterceptors(FileInterceptor('file'))
  async uploadResultDocument(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedResultDocumentFile | undefined,
    @Body('forceEditVerified') forceEditVerified?: string | boolean,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.uploadResultDocument(
      id,
      labId,
      actor,
      req.user?.role,
      file,
      { forceEditVerified: forceEditVerified === true || forceEditVerified === 'true' },
    );
  }

  @Delete('order-tests/:id/result-document')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_ENTRY)
  async removeResultDocument(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('forceEditVerified') forceEditVerified?: string,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.removeResultDocument(id, labId, actor, req.user?.role, {
      forceEditVerified: forceEditVerified === 'true',
    });
  }

  @Get('order-tests/:id/result-document')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_LANE_READ)
  async downloadResultDocument(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download?: string,
    @Res() res?: Response,
  ) {
    const labId = req.user?.labId;
    if (!labId || !res) {
      throw new Error('Lab ID not found in token');
    }
    const result = await this.worklistService.getResultDocumentForLab(id, labId);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${download === 'true' ? 'attachment' : 'inline'}; filename="${encodeURIComponent(result.fileName)}"`,
    );
    return res.send(result.buffer);
  }

  @Patch(':id/verify')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_VERIFY)
  async verifyResult(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.verifyResult(id, labId, actor);
  }

  @Post('verify-multiple')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_VERIFY)
  async verifyMultiple(
    @Req() req: RequestWithUser,
    @Body() body: { ids: string[] },
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.verifyMultiple(body.ids, labId, actor);
  }

  @Patch(':id/reject')
  @Roles(...LAB_ROLE_GROUPS.WORKLIST_VERIFY)
  async rejectResult(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.rejectResult(id, labId, actor, body.reason);
  }
}
