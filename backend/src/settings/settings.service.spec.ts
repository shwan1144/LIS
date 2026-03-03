import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { SettingsService } from './settings.service';
import { Lab } from '../entities/lab.entity';

type MockRepo<T extends object> = Partial<Record<keyof Repository<T>, jest.Mock>>;

function createService(labRepo: MockRepo<Lab>): SettingsService {
  return new SettingsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    labRepo as unknown as Repository<Lab>,
    {} as never,
  );
}

function createLab(overrides: Partial<Lab> = {}): Lab {
  return {
    id: 'lab-id',
    code: 'LAB01',
    name: 'Lab 01',
    labelSequenceBy: 'tube_type',
    sequenceResetBy: 'day',
    enableOnlineResults: true,
    onlineResultWatermarkDataUrl: null,
    onlineResultWatermarkText: null,
    printMethod: 'browser',
    receiptPrinterName: null,
    labelsPrinterName: null,
    reportPrinterName: null,
    reportBannerDataUrl: null,
    reportFooterDataUrl: null,
    reportLogoDataUrl: null,
    reportWatermarkDataUrl: null,
    uiTestGroups: [],
    referringDoctors: [],
    ...overrides,
  } as Lab;
}

describe('SettingsService referringDoctors', () => {
  it('normalizes trim/empty/case-insensitive duplicates when saving', async () => {
    const lab = createLab();
    const findOne = jest.fn().mockResolvedValue(lab);
    const save = jest.fn().mockResolvedValue(lab);
    const service = createService({ findOne, save });

    const result = await service.updateLabSettings('lab-id', {
      referringDoctors: [' Dr Ahmed ', 'dr ahmed', '', 'Dr Sara', '  '],
    });

    expect(save).toHaveBeenCalled();
    expect(result.referringDoctors).toEqual(['Dr Ahmed', 'Dr Sara']);
  });

  it('rejects non-array referringDoctors payload', async () => {
    const lab = createLab();
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });

    await expect(
      service.updateLabSettings('lab-id', {
        referringDoctors: 'Dr Ahmed' as unknown as string[],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects overlong doctor names', async () => {
    const lab = createLab();
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });
    const overlong = 'A'.repeat(81);

    await expect(
      service.updateLabSettings('lab-id', {
        referringDoctors: [overlong],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized doctor list', async () => {
    const lab = createLab();
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });
    const largeList = Array.from({ length: 501 }, (_, idx) => `Doctor ${idx + 1}`);

    await expect(
      service.updateLabSettings('lab-id', {
        referringDoctors: largeList,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes dirty persisted values on read', async () => {
    const tooLong = 'B'.repeat(81);
    const lab = createLab({
      referringDoctors: [' Dr Noor ', '', 'dr noor', tooLong, 5 as unknown as string],
    });
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });

    const result = await service.getLabSettings('lab-id');

    expect(result.referringDoctors).toEqual(['Dr Noor']);
  });
});
