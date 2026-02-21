import {
  BadRequestException,
  Controller,
  ForbiddenException,
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
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
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
      printing?: {
        mode?: 'browser' | 'direct_qz';
        receiptPrinterName?: string | null;
        labelsPrinterName?: string | null;
        reportPrinterName?: string | null;
      };
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

    // Lab panel can update label/sequence and printing settings.
    if (
      body.enableOnlineResults !== undefined ||
      body.onlineResultWatermarkDataUrl !== undefined ||
      body.onlineResultWatermarkText !== undefined ||
      body.reportBranding !== undefined
    ) {
      throw new ForbiddenException(
        'Online result and report design settings moved to admin panel.',
      );
    }

    if (Object.keys(body).length === 0) {
      throw new BadRequestException('No settings provided');
    }

    return this.settingsService.updateLabSettings(labId, {
      labelSequenceBy: body.labelSequenceBy,
      sequenceResetBy: body.sequenceResetBy,
      printing: body.printing,
    });
  }

  @Get('users')
  async getUsers(@Req() req: RequestWithUser) {
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
  }

  @Get('users/:id')
  async getUser(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
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
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
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
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
  }

  @Delete('users/:id')
  async deleteUser(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
  }
}
