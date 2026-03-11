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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LAB_ROLE_GROUPS } from '../auth/lab-role-matrix';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Roles(...LAB_ROLE_GROUPS.DEPARTMENTS_READ)
  async findAll(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.departmentsService.findAllByLab(labId);
  }

  @Get(':id')
  @Roles(...LAB_ROLE_GROUPS.DEPARTMENTS_READ)
  async findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.departmentsService.findOne(id, labId);
  }

  @Post()
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async create(
    @Req() req: RequestWithUser,
    @Body() body: { code: string; name?: string },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.departmentsService.create(labId, body);
  }

  @Patch(':id')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
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
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async delete(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    await this.departmentsService.delete(id, labId);
    return { success: true };
  }
}
