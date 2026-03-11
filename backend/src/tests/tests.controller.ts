import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { TestsService } from './tests.service';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

interface RequestWithUser {
  user: { userId: string | null; username: string; labId: string };
}

@Controller('tests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  async findAll(@Req() req: RequestWithUser, @Query('active') active?: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    const activeOnly = active === 'true';
    return this.testsService.findAll(labId, activeOnly);
  }

  // Seed routes must be before :id routes so "seed" is not captured as id
  @Post('seed/all')
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async seedAll(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    const cbc = await this.testsService.seedCBCTests(labId);
    const chem = await this.testsService.seedChemistryTests(labId);
    const urinalysis = await this.testsService.seedUrinalysisTests(labId);
    return {
      cbc,
      chemistry: chem,
      urinalysis,
      total: {
        created: cbc.created + chem.created + urinalysis.created,
        skipped: cbc.skipped + chem.skipped + urinalysis.skipped,
      },
    };
  }

  @Post('seed/cbc')
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async seedCBC(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.seedCBCTests(labId);
  }

  @Post('seed/chemistry')
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async seedChemistry(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.seedChemistryTests(labId);
  }

  @Post('seed/urinalysis')
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async seedUrinalysis(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.seedUrinalysisTests(labId);
  }

  @Get(':id/pricing')
  async getPricing(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.getPricingForTest(id, labId);
  }

  @Patch(':id/pricing')
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async setPricing(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { prices: { shiftId: string | null; price: number }[] },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    await this.testsService.setPricingForTest(id, labId, body.prices ?? []);
    return { success: true };
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.findOne(id, labId);
  }

  @Post()
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@Req() req: RequestWithUser, @Body() dto: CreateTestDto) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.create(labId, dto);
  }

  @Patch(':id')
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTestDto,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.update(id, labId, dto);
  }

  @Delete(':id')
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async delete(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    await this.testsService.delete(id, labId);
    return { success: true };
  }

  @Patch(':id/toggle-active')
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async toggleActive(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.toggleActive(id, labId);
  }
}
