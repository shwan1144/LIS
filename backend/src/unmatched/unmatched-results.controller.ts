import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UnmatchedResultsService, ResolveUnmatchedDto } from './unmatched-results.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { buildLabActorContext } from '../types/lab-actor-context';

interface RequestWithUser {
  user: {
    userId?: string | null;
    platformUserId?: string | null;
    isImpersonation?: boolean;
    username: string;
    labId: string;
  };
}

@Controller('unmatched-results')
@UseGuards(JwtAuthGuard)
export class UnmatchedResultsController {
  constructor(private readonly unmatchedService: UnmatchedResultsService) {}

  @Get()
  async findAll(
    @Req() req: RequestWithUser,
    @Query('status') status?: 'PENDING' | 'RESOLVED' | 'DISCARDED',
    @Query('instrumentId') instrumentId?: string,
    @Query('reason') reason?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');

    return this.unmatchedService.findAll(labId, {
      status,
      instrumentId,
      reason: reason as any,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  @Get('stats')
  async getStats(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.unmatchedService.getStats(labId);
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.unmatchedService.findOne(id, labId);
  }

  @Post(':id/resolve')
  async resolve(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveUnmatchedDto,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) throw new Error('Lab ID not found');
    return this.unmatchedService.resolve(id, labId, actor, dto);
  }
}
