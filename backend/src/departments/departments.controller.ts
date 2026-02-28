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
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async findAll(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.departmentsService.findAllByLab(labId);
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.departmentsService.findOne(id, labId);
  }

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body() body: { code: string; name?: string },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.departmentsService.create(labId, body);
  }

  @Patch(':id')
  async update(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { code?: string; name?: string },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.departmentsService.update(id, labId, body);
  }

  @Delete(':id')
  async delete(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    await this.departmentsService.delete(id, labId);
    return { success: true };
  }
}
