import { ForbiddenException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  it('rejects dashboard announcement updates from the lab panel', async () => {
    const settingsService = {
      updateLabSettings: jest.fn(),
    } as unknown as SettingsService;
    const controller = new SettingsController(settingsService);

    await expect(
      controller.updateLabSettings(
        {
          user: {
            userId: 'user-id',
            username: 'lab-admin',
            labId: 'lab-id',
            role: 'LAB_ADMIN',
          },
        },
        {
          dashboardAnnouncementText: 'System maintenance at 8 PM',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
