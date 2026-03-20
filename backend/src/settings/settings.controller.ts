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
  StreamableFile,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { ReportStyleConfig } from '../reports/report-style.config';
import { LAB_ROLE_GROUPS } from '../auth/lab-role-matrix';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string; role: string };
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) { }

  @Get('roles')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  getRoles() {
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
  }

  @Get('lab')
  @Roles(...LAB_ROLE_GROUPS.SETTINGS_LAB_READ)
  async getLabSettings(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.getLabSettings(labId);
  }

  @Patch('lab')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async updateLabSettings(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      labelSequenceBy?: string;
      sequenceResetBy?: string;
      enableOnlineResults?: boolean;
      onlineResultWatermarkDataUrl?: string | null;
      printing?: {
        mode?: 'browser' | 'direct_gateway';
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
      reportStyle?: ReportStyleConfig | null;
      uiTestGroups?: { id: string; name: string; testIds: string[] }[] | null;
      referringDoctors?: string[] | null;
      dashboardAnnouncementText?: string | null;
    },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');

    if (Object.keys(body).length === 0) {
      throw new BadRequestException('No settings provided');
    }

    return this.settingsService.updateLabSettings(labId, {
      labelSequenceBy: body.labelSequenceBy,
      sequenceResetBy: body.sequenceResetBy,
      enableOnlineResults: body.enableOnlineResults,
      onlineResultWatermarkDataUrl: body.onlineResultWatermarkDataUrl,
      printing: body.printing,
      reportBranding: body.reportBranding,
      reportStyle: body.reportStyle,
      uiTestGroups: body.uiTestGroups,
      referringDoctors: body.referringDoctors,
      dashboardAnnouncementText: body.dashboardAnnouncementText,
    });
  }

  @Post('lab/report-preview')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async previewLabReportPdf(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      orderId: string;
      previewMode?: 'full' | 'culture_only';
      reportBranding: {
        bannerDataUrl?: string | null;
        footerDataUrl?: string | null;
        logoDataUrl?: string | null;
        watermarkDataUrl?: string | null;
      };
      reportStyle: ReportStyleConfig;
    },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');

    const pdfBuffer = await this.settingsService.generateLabReportPreviewPdf(labId, body);
    return new StreamableFile(pdfBuffer, { type: 'application/pdf' });
  }

  @Get('users')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async getUsers(@Req() req: RequestWithUser) {
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
  }

  @Get('users/:id')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async getUser(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
  }

  @Post('users')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
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
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
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
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async deleteUser(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    throw new ForbiddenException(
      'Lab user management moved to admin panel. Use admin endpoints.',
    );
  }

  @Get('lab/themes')
  @Roles(...LAB_ROLE_GROUPS.SETTINGS_LAB_READ)
  async getReportThemes(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.getReportThemes(labId);
  }

  @Post('lab/themes')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async saveReportTheme(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      name: string;
      reportStyle: ReportStyleConfig;
      reportBranding: {
        bannerDataUrl?: string | null;
        footerDataUrl?: string | null;
        logoDataUrl?: string | null;
        watermarkDataUrl?: string | null;
      };
      onlineResultWatermarkDataUrl: string | null;
    },
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.saveReportTheme(labId, body);
  }

  @Post('lab/themes/:id/apply')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async applyReportTheme(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    return this.settingsService.applyReportTheme(labId, id);
  }

  @Delete('lab/themes/:id')
  @Roles(...LAB_ROLE_GROUPS.ADMIN)
  async deleteReportTheme(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) throw new Error('Lab ID not found in token');
    await this.settingsService.deleteReportTheme(labId, id);
    return { success: true };
  }
}
