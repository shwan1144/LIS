import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LAB_ROLE_GROUPS } from '../auth/lab-role-matrix';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(...LAB_ROLE_GROUPS.PATIENTS)
  async search(
    @Query('search') search?: string,
    @Query('nationalId') nationalId?: string,
    @Query('phone') phone?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.patientsService.search({
      search,
      nationalId,
      phone,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  @Get('today')
  @Roles(...LAB_ROLE_GROUPS.PATIENTS)
  async getTodayPatients() {
    return this.patientsService.getTodayPatients();
  }

  @Get(':id')
  @Roles(...LAB_ROLE_GROUPS.PATIENTS)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientsService.findOne(id);
  }

  @Post()
  @Roles(...LAB_ROLE_GROUPS.PATIENTS)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Patch(':id')
  @Roles(...LAB_ROLE_GROUPS.PATIENTS)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }
}
