import {
  DEFAULT_REPORT_STYLE_V1,
  resolveReportStyleConfig,
  validateAndNormalizeReportStyleConfig,
} from './report-style.config';

describe('report-style.config', () => {
  it('provides populated section styles for results table defaults', () => {
    expect(DEFAULT_REPORT_STYLE_V1.reportTitle.paddingYpx).toBe(0);
    expect(DEFAULT_REPORT_STYLE_V1.reportTitle.paddingXpx).toBe(0);
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.headerStyle).toEqual({
      backgroundColor: '#F2F2F2',
      textColor: '#333333',
      borderColor: '#EEEEEE',
      fontFamily: 'system-sans',
      fontSizePx: 12,
      textAlign: 'left',
      paddingYpx: 6,
      paddingXpx: 8,
    });
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.bodyStyle).toEqual({
      textColor: '#333333',
      borderColor: '#EEEEEE',
      fontFamily: 'system-sans',
      fontSizePx: 12,
      textAlign: 'left',
      paddingYpx: 6,
      paddingXpx: 8,
    });
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.departmentRowStyle.fontFamily).toBe('system-sans');
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.departmentRowStyle.paddingYpx).toBe(8);
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.departmentRowStyle.paddingXpx).toBe(12);
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.categoryRowStyle.fontFamily).toBe('system-sans');
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.categoryRowStyle.paddingYpx).toBe(6);
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.categoryRowStyle.paddingXpx).toBe(12);
    expect(DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle).toEqual({
      backgroundColor: '#F3F6FB',
      textColor: '#1F2937',
      borderColor: '#D6DFEA',
      fontFamily: 'system-sans',
      fontSizePx: 12,
      textAlign: 'left',
      bold: true,
      borderWidthPx: 1,
      borderRadiusPx: 6,
      paddingYpx: 6,
      paddingXpx: 10,
      marginTopPx: 10,
      marginBottomPx: 6,
    });
    expect(DEFAULT_REPORT_STYLE_V1.cultureSection.noGrowthPaddingYpx).toBe(8);
    expect(DEFAULT_REPORT_STYLE_V1.cultureSection.noGrowthPaddingXpx).toBe(10);
    expect(DEFAULT_REPORT_STYLE_V1.cultureSection.notesPaddingYpx).toBe(6);
    expect(DEFAULT_REPORT_STYLE_V1.cultureSection.notesPaddingXpx).toBe(0);
  });

  it('rejects invalid nested section font families', () => {
    expect(() =>
      validateAndNormalizeReportStyleConfig({
        ...DEFAULT_REPORT_STYLE_V1,
        resultsTable: {
          ...DEFAULT_REPORT_STYLE_V1.resultsTable,
          bodyStyle: {
            ...DEFAULT_REPORT_STYLE_V1.resultsTable.bodyStyle,
            fontFamily: 'invalid-font',
          },
        },
      }),
    ).toThrow('reportStyle.resultsTable.bodyStyle.fontFamily must be one of');
  });

  it('rejects invalid nested section padding values', () => {
    expect(() =>
      validateAndNormalizeReportStyleConfig({
        ...DEFAULT_REPORT_STYLE_V1,
        resultsTable: {
          ...DEFAULT_REPORT_STYLE_V1.resultsTable,
          bodyStyle: {
            ...DEFAULT_REPORT_STYLE_V1.resultsTable.bodyStyle,
            paddingXpx: 25,
          },
        },
      }),
    ).toThrow('reportStyle.resultsTable.bodyStyle.paddingXpx must be between 0 and 24');
  });

  it('rejects invalid report title padding values', () => {
    expect(() =>
      validateAndNormalizeReportStyleConfig({
        ...DEFAULT_REPORT_STYLE_V1,
        reportTitle: {
          ...DEFAULT_REPORT_STYLE_V1.reportTitle,
          paddingYpx: 21,
        },
      }),
    ).toThrow('reportStyle.reportTitle.paddingYpx must be between 0 and 20');
  });

  it('upgrades legacy flat resultsTable styling into nested section styles', () => {
    const legacyStyle = {
      ...DEFAULT_REPORT_STYLE_V1,
      resultsTable: {
        headerBackgroundColor: '#010203',
        headerTextColor: '#111111',
        headerFontSizePx: 13,
        headerTextAlign: 'center',
        bodyTextColor: '#222222',
        bodyFontSizePx: 11,
        fontFamily: 'verdana',
        cellTextAlign: 'right',
        borderColor: '#AABBCC',
        rowStripeEnabled: DEFAULT_REPORT_STYLE_V1.resultsTable.rowStripeEnabled,
        rowStripeColor: DEFAULT_REPORT_STYLE_V1.resultsTable.rowStripeColor,
        abnormalRowBackgroundColor: DEFAULT_REPORT_STYLE_V1.resultsTable.abnormalRowBackgroundColor,
        referenceValueColor: DEFAULT_REPORT_STYLE_V1.resultsTable.referenceValueColor,
        showStatusColumn: DEFAULT_REPORT_STYLE_V1.resultsTable.showStatusColumn,
        showDepartmentRow: DEFAULT_REPORT_STYLE_V1.resultsTable.showDepartmentRow,
        departmentRowBackgroundColor: '#303030',
        departmentRowTextColor: '#FAFAFA',
        departmentRowFontSizePx: 14,
        departmentRowTextAlign: 'left',
        showCategoryRow: DEFAULT_REPORT_STYLE_V1.resultsTable.showCategoryRow,
        categoryRowBackgroundColor: '#EFEFEF',
        categoryRowTextColor: '#454545',
        categoryRowFontSizePx: 12,
        categoryRowTextAlign: 'center',
        statusNormalColor: DEFAULT_REPORT_STYLE_V1.resultsTable.statusNormalColor,
        statusHighColor: DEFAULT_REPORT_STYLE_V1.resultsTable.statusHighColor,
        statusLowColor: DEFAULT_REPORT_STYLE_V1.resultsTable.statusLowColor,
        regularDepartmentBlockBreak: DEFAULT_REPORT_STYLE_V1.resultsTable.regularDepartmentBlockBreak,
        regularRowBreak: DEFAULT_REPORT_STYLE_V1.resultsTable.regularRowBreak,
        panelTableBreak: DEFAULT_REPORT_STYLE_V1.resultsTable.panelTableBreak,
        panelRowBreak: DEFAULT_REPORT_STYLE_V1.resultsTable.panelRowBreak,
      },
    };

    const normalized = resolveReportStyleConfig(legacyStyle);

    expect(normalized.resultsTable.headerStyle).toEqual({
      backgroundColor: '#010203',
      textColor: '#111111',
      borderColor: '#AABBCC',
      fontFamily: 'verdana',
      fontSizePx: 13,
      textAlign: 'center',
      paddingYpx: 6,
      paddingXpx: 8,
    });
    expect(normalized.resultsTable.bodyStyle).toEqual({
      textColor: '#222222',
      borderColor: '#AABBCC',
      fontFamily: 'verdana',
      fontSizePx: 11,
      textAlign: 'right',
      paddingYpx: 6,
      paddingXpx: 8,
    });
    expect(normalized.resultsTable.departmentRowStyle.borderColor).toBe('#303030');
    expect(normalized.resultsTable.departmentRowStyle.paddingYpx).toBe(8);
    expect(normalized.resultsTable.departmentRowStyle.paddingXpx).toBe(12);
    expect(normalized.resultsTable.categoryRowStyle.borderColor).toBe('#AABBCC');
    expect(normalized.resultsTable.categoryRowStyle.paddingYpx).toBe(6);
    expect(normalized.resultsTable.categoryRowStyle.paddingXpx).toBe(12);
    expect(normalized.resultsTable.testColumn.textAlign).toBe('right');
    expect(normalized.resultsTable.panelSectionStyle).toEqual({
      ...DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle,
      borderColor: '#AABBCC',
      fontFamily: 'verdana',
    });
  });

  it('accepts explicit panel section styling and applies defaults for missing values', () => {
    const normalized = validateAndNormalizeReportStyleConfig({
      ...DEFAULT_REPORT_STYLE_V1,
      resultsTable: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable,
        panelSectionStyle: {
          backgroundColor: '#EEF7FF',
          textColor: '#102A43',
          borderColor: '#7AB8FF',
          fontFamily: 'verdana',
          fontSizePx: 13,
          textAlign: 'center',
          bold: false,
          borderWidthPx: 2,
          borderRadiusPx: 10,
          paddingYpx: 8,
          paddingXpx: 12,
          marginTopPx: 7,
          marginBottomPx: 5,
        },
      },
    });

    expect(normalized.resultsTable.panelSectionStyle).toEqual({
      backgroundColor: '#EEF7FF',
      textColor: '#102A43',
      borderColor: '#7AB8FF',
      fontFamily: 'verdana',
      fontSizePx: 13,
      textAlign: 'center',
      bold: false,
      borderWidthPx: 2,
      borderRadiusPx: 10,
      paddingYpx: 8,
      paddingXpx: 12,
      marginTopPx: 7,
      marginBottomPx: 5,
    });
  });

  it('upgrades legacy flat panel section styling keys', () => {
    const normalized = resolveReportStyleConfig({
      ...DEFAULT_REPORT_STYLE_V1,
      resultsTable: {
        rowStripeEnabled: DEFAULT_REPORT_STYLE_V1.resultsTable.rowStripeEnabled,
        rowStripeColor: DEFAULT_REPORT_STYLE_V1.resultsTable.rowStripeColor,
        abnormalRowBackgroundColor: DEFAULT_REPORT_STYLE_V1.resultsTable.abnormalRowBackgroundColor,
        referenceValueColor: DEFAULT_REPORT_STYLE_V1.resultsTable.referenceValueColor,
        showStatusColumn: DEFAULT_REPORT_STYLE_V1.resultsTable.showStatusColumn,
        showDepartmentRow: DEFAULT_REPORT_STYLE_V1.resultsTable.showDepartmentRow,
        showCategoryRow: DEFAULT_REPORT_STYLE_V1.resultsTable.showCategoryRow,
        statusNormalColor: DEFAULT_REPORT_STYLE_V1.resultsTable.statusNormalColor,
        statusHighColor: DEFAULT_REPORT_STYLE_V1.resultsTable.statusHighColor,
        statusLowColor: DEFAULT_REPORT_STYLE_V1.resultsTable.statusLowColor,
        regularDepartmentBlockBreak: DEFAULT_REPORT_STYLE_V1.resultsTable.regularDepartmentBlockBreak,
        regularRowBreak: DEFAULT_REPORT_STYLE_V1.resultsTable.regularRowBreak,
        panelTableBreak: DEFAULT_REPORT_STYLE_V1.resultsTable.panelTableBreak,
        panelRowBreak: DEFAULT_REPORT_STYLE_V1.resultsTable.panelRowBreak,
        panelSectionBackgroundColor: '#E8F4FF',
        panelSectionTextColor: '#123456',
        panelSectionBorderColor: '#8EC5FF',
        panelSectionFontSizePx: 14,
        panelSectionTextAlign: 'center',
        panelSectionBold: false,
        panelSectionBorderWidthPx: 3,
        panelSectionBorderRadiusPx: 11,
        panelSectionPaddingYpx: 9,
        panelSectionPaddingXpx: 14,
        panelSectionMarginTopPx: 8,
        panelSectionMarginBottomPx: 6,
      },
    });

    expect(normalized.resultsTable.panelSectionStyle).toEqual({
      ...DEFAULT_REPORT_STYLE_V1.resultsTable.panelSectionStyle,
      backgroundColor: '#E8F4FF',
      textColor: '#123456',
      borderColor: '#8EC5FF',
      fontFamily: 'system-sans',
      fontSizePx: 14,
      textAlign: 'center',
      bold: false,
      borderWidthPx: 3,
      borderRadiusPx: 11,
      paddingYpx: 9,
      paddingXpx: 14,
      marginTopPx: 8,
      marginBottomPx: 6,
    });
  });
});
