import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { WorklistService } from './worklist.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrderTestStatus } from '../entities/order-test.entity';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('worklist')
@UseGuards(JwtAuthGuard)
export class WorklistController {
  constructor(private readonly worklistService: WorklistService) {}

  @Get()
  async getWorklist(
    @Req() req: RequestWithUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('date') date?: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const labId = req.user?.labId;
    const userId = req.user?.userId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }

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
      },
      userId,
    );
  }

  @Get('stats')
  async getStats(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.worklistService.getWorklistStats(labId);
  }

  @Patch(':id/result')
  async enterResult(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      resultValue?: number | null;
      resultText?: string | null;
      comments?: string | null;
      resultParameters?: Record<string, string> | null;
    },
  ) {
    const labId = req.user?.labId;
    const userId = req.user?.userId;
    if (!labId || !userId) {
      throw new Error('User info not found in token');
    }
    return this.worklistService.enterResult(id, labId, userId, body);
  }

  @Patch(':id/verify')
  async verifyResult(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const labId = req.user?.labId;
    const userId = req.user?.userId;
    if (!labId || !userId) {
      throw new Error('User info not found in token');
    }
    return this.worklistService.verifyResult(id, labId, userId);
  }

  @Post('verify-multiple')
  async verifyMultiple(
    @Req() req: RequestWithUser,
    @Body() body: { ids: string[] },
  ) {
    const labId = req.user?.labId;
    const userId = req.user?.userId;
    if (!labId || !userId) {
      throw new Error('User info not found in token');
    }
    return this.worklistService.verifyMultiple(body.ids, labId, userId);
  }

  @Patch(':id/reject')
  async rejectResult(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ) {
    const labId = req.user?.labId;
    const userId = req.user?.userId;
    if (!labId || !userId) {
      throw new Error('User info not found in token');
    }
    return this.worklistService.rejectResult(id, labId, userId, body.reason);
  }
}
