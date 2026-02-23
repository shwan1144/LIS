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
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  InstrumentsService,
  CreateInstrumentDto,
  CreateMappingDto,
  SendInstrumentTestOrderDto,
} from './instruments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('instruments')
@UseGuards(JwtAuthGuard)
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get()
  async findAll(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.findAll(labId);
  }

  @Get('mappings-by-test/:testId')
  async getMappingsByTest(
    @Req() req: RequestWithUser,
    @Param('testId', ParseUUIDPipe) testId: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.getMappingsByTestId(testId, labId);
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.findOne(id, labId);
  }

  @Post()
  async create(@Req() req: RequestWithUser, @Body() dto: CreateInstrumentDto) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.create(labId, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateInstrumentDto>,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.update(id, labId, dto);
  }

  @Delete(':id')
  async delete(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.delete(id, labId);
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.toggleActive(id, labId);
  }

  @Post(':id/restart')
  async restartConnection(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    const success = await this.instrumentsService.restartConnection(id, labId);
    return { success };
  }

  @Post(':id/send-test-order')
  async sendTestOrder(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendInstrumentTestOrderDto,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.sendTestOrder(id, labId, dto);
  }

  // Mappings
  @Get(':id/mappings')
  async getMappings(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.getMappings(id, labId);
  }

  @Post(':id/mappings')
  async createMapping(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMappingDto,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.createMapping(id, labId, dto);
  }

  @Patch(':id/mappings/:mappingId')
  async updateMapping(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @Body() dto: Partial<CreateMappingDto>,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.updateMapping(id, mappingId, labId, dto);
  }

  @Delete(':id/mappings/:mappingId')
  async deleteMapping(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.deleteMapping(id, mappingId, labId);
  }

  // Messages
  @Get(':id/messages')
  async getMessages(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('direction') direction?: 'IN' | 'OUT',
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.getMessages(id, labId, {
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
      direction,
    });
  }

  // Simulate receiving a message (for testing)
  @Post(':id/simulate')
  async simulateMessage(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { rawMessage: string },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found');
    return this.instrumentsService.simulateMessage(id, labId, body.rawMessage);
  }
}
