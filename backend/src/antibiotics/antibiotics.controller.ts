import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AntibioticsService } from './antibiotics.service';
import { CreateAntibioticDto } from './dto/create-antibiotic.dto';
import { UpdateAntibioticDto } from './dto/update-antibiotic.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LAB_ROLE_GROUPS } from '../auth/lab-role-matrix';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('antibiotics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AntibioticsController {
  constructor(private readonly antibioticsService: AntibioticsService) {}

  @Get()
  @Roles(...LAB_ROLE_GROUPS.ANTIBIOTICS_READ)
  async findAll(
    @Req() req: RequestWithUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.antibioticsService.findAll(labId, includeInactive === 'true');
  }

  @Get(':id')
  @Roles(...LAB_ROLE_GROUPS.ANTIBIOTICS_READ)
  async findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.antibioticsService.findOne(id, labId);
  }

  @Post()
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@Req() req: RequestWithUser, @Body() dto: CreateAntibioticDto) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.antibioticsService.create(labId, dto);
  }

  @Patch(':id')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAntibioticDto,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.antibioticsService.update(id, labId, dto);
  }

  @Delete(':id')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async remove(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    await this.antibioticsService.softDelete(id, labId);
    return { success: true };
  }
}
