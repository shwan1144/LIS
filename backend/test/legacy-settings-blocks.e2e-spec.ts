import { ForbiddenException } from '@nestjs/common';
import { SettingsController } from '../src/settings/settings.controller';

describe('Legacy settings endpoints blocked (e2e-style)', () => {
  it('returns Forbidden for legacy user-management endpoints moved to admin panel', async () => {
    const controller = new SettingsController({} as never);
    const req = {
      user: { userId: 'u1', username: 'admin', labId: 'lab-1', role: 'LAB_ADMIN' },
    };

    expect(() => controller.getRoles()).toThrow(ForbiddenException);
    await expect(controller.getUsers(req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getUser(req, '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      controller.createUser(req, {
        username: 'user1',
        password: 'password123',
        role: 'LAB_ADMIN',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.updateUser(
        req,
        '11111111-1111-4111-8111-111111111111',
        { fullName: 'Name' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.deleteUser(req, '11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks online-result and report-design mutation from lab settings endpoint', async () => {
    const updateLabSettings = jest.fn();
    const controller = new SettingsController({ updateLabSettings } as never);
    const req = {
      user: { userId: 'u1', username: 'admin', labId: 'lab-1', role: 'LAB_ADMIN' },
    };

    await expect(
      controller.updateLabSettings(req, {
        enableOnlineResults: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      controller.updateLabSettings(req, {
        reportBranding: { bannerDataUrl: 'data:image/png;base64,AAAA' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(updateLabSettings).not.toHaveBeenCalled();
  });
});

