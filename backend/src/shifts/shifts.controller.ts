import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('shifts')
@UseGuards(JwtAuthGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  async findAll(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.shiftsService.findAllByLab(labId);
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.shiftsService.findOne(id, labId);
  }

  @Post()
  async create(@Req() req: RequestWithUser, @Body() body: { code: string; name?: string; startTime?: string; endTime?: string; isEmergency?: boolean }) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.shiftsService.create(labId, body);
  }

  @Patch(':id')
  async update(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { code?: string; name?: string; startTime?: string; endTime?: string; isEmergency?: boolean },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.shiftsService.update(id, labId, body);
  }

  @Delete(':id')
  async delete(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    await this.shiftsService.delete(id, labId);
    return { success: true };
  }
}
