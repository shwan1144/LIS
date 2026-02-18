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

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('tests')
@UseGuards(JwtAuthGuard)
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  async findAll(@Query('active') active?: string) {
    const activeOnly = active === 'true';
    return this.testsService.findAll(activeOnly);
  }

  // Seed routes must be before :id routes so "seed" is not captured as id
  @Post('seed/all')
  async seedAll() {
    const cbc = await this.testsService.seedCBCTests();
    const chem = await this.testsService.seedChemistryTests();
    return {
      cbc,
      chemistry: chem,
      total: { created: cbc.created + chem.created, skipped: cbc.skipped + chem.skipped },
    };
  }

  @Post('seed/cbc')
  async seedCBC() {
    return this.testsService.seedCBCTests();
  }

  @Post('seed/chemistry')
  async seedChemistry() {
    return this.testsService.seedChemistryTests();
  }

  @Get(':id/pricing')
  async getPricing(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.testsService.getPricingForTest(id, labId);
  }

  @Patch(':id/pricing')
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
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.testsService.findOne(id);
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@Body() dto: CreateTestDto) {
    return this.testsService.create(dto);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTestDto,
  ) {
    return this.testsService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.testsService.delete(id);
    return { success: true };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.testsService.toggleActive(id);
  }
}
