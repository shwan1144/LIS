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
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string; role: string };
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('LAB_ADMIN', 'SUPER_ADMIN')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('roles')
  getRoles() {
    return this.settingsService.getRoles();
  }

  @Get('lab')
  async getLabSettings(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.getLabSettings(labId);
  }

  @Patch('lab')
  async updateLabSettings(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      labelSequenceBy?: string;
      sequenceResetBy?: string;
      enableOnlineResults?: boolean;
      onlineResultWatermarkDataUrl?: string | null;
      onlineResultWatermarkText?: string | null;
      reportBranding?: {
        bannerDataUrl?: string | null;
        footerDataUrl?: string | null;
        logoDataUrl?: string | null;
        watermarkDataUrl?: string | null;
      };
    },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.updateLabSettings(labId, body);
  }

  @Get('users')
  async getUsers(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.getUsersForLab(labId);
  }

  @Get('users/:id')
  async getUser(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.getUserWithDetails(id, labId);
  }

  @Post('users')
  async createUser(@Req() req: RequestWithUser, @Body() body: {
    username: string;
    password: string;
    fullName?: string;
    email?: string;
    role: string;
    shiftIds?: string[];
    departmentIds?: string[];
  }) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.createUser(labId, body);
  }

  @Patch('users/:id')
  async updateUser(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      fullName?: string;
      email?: string;
      role?: string;
      defaultLabId?: string;
      isActive?: boolean;
      shiftIds?: string[];
      departmentIds?: string[];
      password?: string;
    },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.updateUser(id, labId, body);
  }

  @Delete('users/:id')
  async deleteUser(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const labId = req.user?.labId;
    const currentUserId = req.user?.userId;
    if (!labId || !currentUserId) throw new Error('User info not found in token');
    await this.settingsService.deleteUser(id, labId, currentUserId);
    return { success: true };
  }
}
