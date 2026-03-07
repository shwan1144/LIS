import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { SettingsService } from './settings.service';
import { Lab } from '../entities/lab.entity';
import { DEFAULT_REPORT_STYLE_V1 } from '../reports/report-style.config';

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
    reportStyle: null,
    uiTestGroups: [],
    referringDoctors: [],
    dashboardAnnouncementText: null,
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

  it('reads dashboard announcement text when present', async () => {
    const lab = createLab({
      dashboardAnnouncementText: 'System maintenance at 8 PM',
    });
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });

    const result = await service.getLabSettings('lab-id');

    expect(result.dashboardAnnouncementText).toBe('System maintenance at 8 PM');
  });

  it('trims dashboard announcement text when saving', async () => {
    const lab = createLab();
    const findOne = jest.fn().mockResolvedValue(lab);
    const save = jest.fn().mockImplementation(async (entity: Lab) => entity);
    const service = createService({ findOne, save });

    const result = await service.updateLabSettings('lab-id', {
      dashboardAnnouncementText: '  System maintenance at 8 PM  ',
    });

    expect(save).toHaveBeenCalled();
    expect(result.dashboardAnnouncementText).toBe('System maintenance at 8 PM');
  });

  it('clears dashboard announcement text when blank string is saved', async () => {
    const lab = createLab({
      dashboardAnnouncementText: 'Old message',
    });
    const findOne = jest.fn().mockResolvedValue(lab);
    const save = jest.fn().mockImplementation(async (entity: Lab) => entity);
    const service = createService({ findOne, save });

    const result = await service.updateLabSettings('lab-id', {
      dashboardAnnouncementText: '   ',
    });

    expect(result.dashboardAnnouncementText).toBeNull();
  });

  it('rejects overlong dashboard announcement text', async () => {
    const lab = createLab();
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });

    await expect(
      service.updateLabSettings('lab-id', {
        dashboardAnnouncementText: 'A'.repeat(256),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('defaults department and category report rows to visible', () => {
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.showDepartmentRow).toBe(true);
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.showCategoryRow).toBe(true);
  });

  it('saves validated reportStyle config', async () => {
    const lab = createLab();
    const findOne = jest.fn().mockResolvedValue(lab);
    const save = jest.fn().mockResolvedValue(lab);
    const service = createService({ findOne, save });
    const nextStyle = {
      ...DEFAULT_REPORT_STYLE_V1,
      resultsTable: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable,
        showDepartmentRow: false,
        showCategoryRow: true,
      },
    };

    const result = await service.updateLabSettings('lab-id', {
      reportStyle: nextStyle,
    });

    expect(save).toHaveBeenCalled();
    expect(result.reportStyle).toEqual(nextStyle);
    expect(result.reportDesignFingerprint).toMatch(/^[a-f0-9]{40}$/);
  });

  it('reads reportStyle when persisted as JSON string', async () => {
    const lab = createLab({
      reportStyle: JSON.stringify(DEFAULT_REPORT_STYLE_V1) as unknown as Lab['reportStyle'],
    });
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });

    const result = await service.getLabSettings('lab-id');

    expect(result.reportStyle).toEqual(DEFAULT_REPORT_STYLE_V1);
    expect(result.reportDesignFingerprint).toMatch(/^[a-f0-9]{40}$/);
  });

  it('backfills report row toggles when persisted reportStyle is older JSON', async () => {
    const {
      showDepartmentRow: _showDepartmentRow,
      showCategoryRow: _showCategoryRow,
      ...legacyResultsTable
    } = DEFAULT_REPORT_STYLE_V1.resultsTable;
    const legacyStyle = {
      ...DEFAULT_REPORT_STYLE_V1,
      resultsTable: legacyResultsTable,
    };
    const lab = createLab({
      reportStyle: JSON.stringify(legacyStyle) as unknown as Lab['reportStyle'],
    });
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });

    const result = await service.getLabSettings('lab-id');

    expect(result.reportStyle).toEqual(DEFAULT_REPORT_STYLE_V1);
    expect(result.reportStyle?.resultsTable.showDepartmentRow).toBe(true);
    expect(result.reportStyle?.resultsTable.showCategoryRow).toBe(true);
  });

  it('persists and reads back reportStyle when DB stores it as JSON string', async () => {
    let persistedLab = createLab();
    const findOne = jest.fn().mockImplementation(async () => persistedLab);
    const save = jest.fn().mockImplementation(async (entity: Lab) => {
      persistedLab = createLab({
        ...persistedLab,
        ...entity,
        reportStyle:
          entity.reportStyle == null
            ? null
            : (JSON.stringify(entity.reportStyle) as unknown as Lab['reportStyle']),
      });
      return persistedLab;
    });
    const service = createService({ findOne, save });

    const nextStyle = {
      ...DEFAULT_REPORT_STYLE_V1,
      resultsTable: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable,
        headerBackgroundColor: '#101010',
      },
    };
    const result = await service.updateLabSettings('lab-id', {
      reportStyle: nextStyle,
    });

    expect(result.reportStyle).toEqual(nextStyle);
    expect(result.reportDesignFingerprint).toMatch(/^[a-f0-9]{40}$/);
  });

  it('persists report branding/style and returns matching design payload', async () => {
    const lab = createLab();
    const findOne = jest.fn().mockResolvedValue(lab);
    const save = jest.fn().mockImplementation(async (entity: Lab) => entity);
    const service = createService({ findOne, save });

    const branding = {
      bannerDataUrl: 'data:image/png;base64,AAAA',
      footerDataUrl: 'data:image/png;base64,BBBB',
      logoDataUrl: 'data:image/png;base64,CCCC',
      watermarkDataUrl: 'data:image/png;base64,DDDD',
    };
    const style = {
      ...DEFAULT_REPORT_STYLE_V1,
      patientInfo: {
        ...DEFAULT_REPORT_STYLE_V1.patientInfo,
        backgroundColor: '#EDEDED',
      },
    };

    const result = await service.updateLabSettings('lab-id', {
      reportBranding: branding,
      reportStyle: style,
    });

    expect(result.reportBranding).toEqual(branding);
    expect(result.reportStyle).toEqual(style);
    expect(result.reportDesignFingerprint).toMatch(/^[a-f0-9]{40}$/);
  });

  it('changes reportDesignFingerprint when report design changes', async () => {
    const lab = createLab();
    const findOne = jest.fn().mockResolvedValue(lab);
    const save = jest.fn().mockImplementation(async (entity: Lab) => entity);
    const service = createService({ findOne, save });

    const first = await service.updateLabSettings('lab-id', {
      reportStyle: DEFAULT_REPORT_STYLE_V1,
    });

    const second = await service.updateLabSettings('lab-id', {
      reportStyle: {
        ...DEFAULT_REPORT_STYLE_V1,
        resultsTable: {
          ...DEFAULT_REPORT_STYLE_V1.resultsTable,
          headerBackgroundColor: '#101010',
        },
      },
    });

    expect(second.reportDesignFingerprint).not.toBe(first.reportDesignFingerprint);
  });

  it('changes reportDesignFingerprint when department/category row visibility changes', async () => {
    const lab = createLab();
    const findOne = jest.fn().mockResolvedValue(lab);
    const save = jest.fn().mockImplementation(async (entity: Lab) => entity);
    const service = createService({ findOne, save });

    const baseline = await service.updateLabSettings('lab-id', {
      reportStyle: DEFAULT_REPORT_STYLE_V1,
    });
    const departmentHidden = await service.updateLabSettings('lab-id', {
      reportStyle: {
        ...DEFAULT_REPORT_STYLE_V1,
        resultsTable: {
          ...DEFAULT_REPORT_STYLE_V1.resultsTable,
          showDepartmentRow: false,
        },
      },
    });
    const categoryHidden = await service.updateLabSettings('lab-id', {
      reportStyle: {
        ...DEFAULT_REPORT_STYLE_V1,
        resultsTable: {
          ...DEFAULT_REPORT_STYLE_V1.resultsTable,
          showCategoryRow: false,
        },
      },
    });

    expect(departmentHidden.reportDesignFingerprint).not.toBe(baseline.reportDesignFingerprint);
    expect(categoryHidden.reportDesignFingerprint).not.toBe(baseline.reportDesignFingerprint);
    expect(categoryHidden.reportDesignFingerprint).not.toBe(departmentHidden.reportDesignFingerprint);
  });

  it('keeps reportDesignFingerprint stable when unrelated settings change', async () => {
    const lab = createLab();
    const findOne = jest.fn().mockResolvedValue(lab);
    const save = jest.fn().mockImplementation(async (entity: Lab) => entity);
    const service = createService({ findOne, save });

    const baseline = await service.updateLabSettings('lab-id', {
      reportStyle: DEFAULT_REPORT_STYLE_V1,
      reportBranding: {
        bannerDataUrl: 'data:image/png;base64,AAAA',
      },
    });

    const afterUnrelatedUpdate = await service.updateLabSettings('lab-id', {
      enableOnlineResults: false,
      printing: {
        mode: 'browser',
        reportPrinterName: 'Main Printer',
      },
    });

    expect(afterUnrelatedUpdate.reportDesignFingerprint).toBe(
      baseline.reportDesignFingerprint,
    );
  });

  it('throws when report design cannot be read back after save', async () => {
    const persistedLab = createLab({
      reportBannerDataUrl: 'data:image/png;base64,AAAA',
      reportStyle: DEFAULT_REPORT_STYLE_V1,
    });
    const staleReadLab = createLab({
      reportBannerDataUrl: null,
      reportStyle: null,
    });

    const findOne = jest
      .fn()
      .mockResolvedValueOnce(persistedLab)
      .mockResolvedValueOnce(staleReadLab);
    const save = jest.fn().mockImplementation(async (entity: Lab) => entity);
    const service = createService({ findOne, save });

    await expect(
      service.updateLabSettings('lab-id', {
        reportBranding: {
          bannerDataUrl: 'data:image/png;base64,BBBB',
        },
      }),
    ).rejects.toThrow('Server did not persist report design');
  });

  it('rejects malformed reportStyle config', async () => {
    const lab = createLab();
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });

    await expect(
      service.updateLabSettings('lab-id', {
        reportStyle: {
          version: 1,
          patientInfo: {
            ...DEFAULT_REPORT_STYLE_V1.patientInfo,
            backgroundColor: 'red',
          },
          resultsTable: DEFAULT_REPORT_STYLE_V1.resultsTable,
        } as unknown as typeof DEFAULT_REPORT_STYLE_V1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown keys in reportStyle config', async () => {
    const lab = createLab();
    const service = createService({
      findOne: jest.fn().mockResolvedValue(lab),
      save: jest.fn().mockResolvedValue(lab),
    });

    await expect(
      service.updateLabSettings('lab-id', {
        reportStyle: {
          ...DEFAULT_REPORT_STYLE_V1,
          resultsTable: {
            ...DEFAULT_REPORT_STYLE_V1.resultsTable,
            extraKey: '#FFFFFF',
          },
        } as unknown as typeof DEFAULT_REPORT_STYLE_V1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
