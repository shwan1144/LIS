import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  it('passes report design and dashboard settings through for the current lab', async () => {
    const settingsService = {
      updateLabSettings: jest.fn().mockResolvedValue(undefined),
    } as unknown as SettingsService;
    const controller = new SettingsController(settingsService);
    const req = {
      user: {
        userId: 'user-id',
        username: 'lab-admin',
        labId: 'lab-id',
        role: 'LAB_ADMIN',
      },
    };
    const body = {
      dashboardAnnouncementText: 'System maintenance at 8 PM',
      reportStyle: {} as never,
      reportBranding: {
        logoDataUrl: 'data:image/png;base64,AAAA',
      },
    };

    await controller.updateLabSettings(req, body);

    expect(settingsService.updateLabSettings).toHaveBeenCalledWith('lab-id', {
      labelSequenceBy: undefined,
      sequenceResetBy: undefined,
      enableOnlineResults: undefined,
      onlineResultWatermarkDataUrl: undefined,
      printing: undefined,
      reportBranding: {
        logoDataUrl: 'data:image/png;base64,AAAA',
      },
      reportStyle: body.reportStyle,
      uiTestGroups: undefined,
      referringDoctors: undefined,
      dashboardAnnouncementText: 'System maintenance at 8 PM',
    });
  });
});
