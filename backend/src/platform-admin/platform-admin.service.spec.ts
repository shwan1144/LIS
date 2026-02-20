import { BadRequestException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';
import type { CreateLabDto } from './dto/create-lab.dto';

describe('PlatformAdminService', () => {
  it('requires explicit labId for drill-down orders endpoint', async () => {
    const service = new PlatformAdminService(
      {
        withPlatformAdminContext: jest.fn(),
      } as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.listOrdersByLab({ labId: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes code/subdomain when creating lab', async () => {
    const save = jest.fn().mockResolvedValue({
      id: 'lab-id',
      code: 'LAB02',
      name: 'Lab 02',
      subdomain: 'lab02',
    });
    const create = jest.fn((payload: unknown) => payload);
    const findOne = jest.fn().mockResolvedValue(null);

    const withPlatformAdminContext = jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
      fn({
        getRepository: () => ({ save, create, findOne }),
      }),
    );

    const service = new PlatformAdminService(
      {
        withPlatformAdminContext,
      } as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const input: CreateLabDto = {
      code: 'lab02',
      name: 'Lab 02',
    };
    await service.createLab(input);

    expect(findOne).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'LAB02',
        subdomain: 'lab02',
      }),
    );
    expect(save).toHaveBeenCalled();
  });
});
