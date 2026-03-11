import type { Order } from '../../entities/order.entity';
import type { OrderTest } from '../../entities/order-test.entity';
import { TestType } from '../../entities/test.entity';
import {
  DEFAULT_REPORT_STYLE_V1,
  resolveReportFontStackWithArabicFallback,
  resolveReportRtlFontStack,
} from '../report-style.config';
import { buildResultsReportHtml } from './results-report.template';

function countMatches(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function sliceBetween(haystack: string, startMarker: string, endMarker: string): string {
  const start = haystack.indexOf(startMarker);
  if (start < 0) return '';
  const end = haystack.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return haystack.slice(start);
  return haystack.slice(start, end);
}

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderNumber: 'ORD-001',
    registeredAt: new Date('2026-02-26T10:00:00.000Z'),
    patient: {
      fullName: 'Test Patient',
      patientNumber: 'P-000001',
      sex: 'male',
      dateOfBirth: '1990-01-01',
    } as Order['patient'],
    lab: {
      name: 'Main Lab',
      code: 'LAB01',
    } as Order['lab'],
    ...overrides,
  } as unknown as Order;
}

function createOrderTest(
  id: string,
  options: {
    name: string;
    code: string;
    type?: TestType;
    abbreviation?: string;
    parentOrderTestId?: string | null;
    unit?: string | null;
    resultText?: string | null;
    resultValue?: number | null;
    resultParameters?: Record<string, string> | null;
    parameterDefinitions?: Array<{ code: string; label: string; normalOptions?: string[] }>;
    category?: string | null;
    departmentName?: string | null;
    sortOrder?: number;
    resultEntryType?: string | null;
    cultureResult?: unknown;
  },
): OrderTest {
  return {
    id,
    parentOrderTestId: options.parentOrderTestId ?? null,
    resultText: options.resultText ?? null,
    resultValue: options.resultValue ?? null,
    resultParameters: options.resultParameters ?? null,
    cultureResult: options.cultureResult ?? null,
    flag: null,
    test: {
      name: options.name,
      code: options.code,
      abbreviation: options.abbreviation ?? null,
      type: options.type ?? TestType.SINGLE,
      resultEntryType: options.resultEntryType ?? 'NUMERIC',
      unit: options.unit ?? null,
      parameterDefinitions: options.parameterDefinitions ?? [],
      category: options.category ?? null,
      normalText: null,
      normalMin: null,
      normalMax: null,
      sortOrder: options.sortOrder ?? 0,
      department: { name: options.departmentName ?? 'Chemistry' },
    } as unknown as OrderTest['test'],
  } as unknown as OrderTest;
}

function buildRegularResultsHtml(
  resultsTableOverrides: Partial<typeof DEFAULT_REPORT_STYLE_V1.resultsTable> = {},
): string {
  const order = createOrder({
    lab: {
      ...createOrder().lab,
      reportStyle: {
        ...DEFAULT_REPORT_STYLE_V1,
        resultsTable: {
          ...DEFAULT_REPORT_STYLE_V1.resultsTable,
          ...resultsTableOverrides,
        },
      },
    } as Order['lab'],
  });
  const hormoneTsh = createOrderTest('regular-tsh', {
    name: 'TSH',
    code: 'TSH',
    abbreviation: 'TSH',
    resultValue: 2.2,
    unit: 'uIU/mL',
    departmentName: 'Hormone',
    category: 'Thyroid',
    sortOrder: 1,
  });
  const hormoneT3 = createOrderTest('regular-t3', {
    name: 'T3',
    code: 'T3',
    abbreviation: 'T3',
    resultValue: 1.1,
    unit: 'ng/mL',
    departmentName: 'Hormone',
    category: 'Thyroid',
    sortOrder: 2,
  });
  const chemistryUrea = createOrderTest('regular-urea', {
    name: 'Urea',
    code: 'UREA',
    abbreviation: 'UREA',
    resultValue: 25,
    unit: 'mg/dL',
    departmentName: 'Chemistry',
    category: 'Renal',
    sortOrder: 3,
  });

  return buildResultsReportHtml({
    order,
    orderTests: [hormoneTsh, hormoneT3, chemistryUrea],
    reportableCount: 3,
    verifiedCount: 3,
    verifiers: ['Verifier'],
    latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
    comments: [],
  });
}

describe('buildResultsReportHtml panel page isolation', () => {
  it('keeps panel children out of regular section and renders them on panel-only pages', () => {
    const order = createOrder();
    const panelParent = createOrderTest('panel-1', {
      name: 'CBC Panel',
      code: 'CBC',
      type: TestType.PANEL,
    });
    const panelChild = createOrderTest('panel-child-1', {
      name: 'Hemoglobin',
      code: 'HGB',
      parentOrderTestId: panelParent.id,
      resultValue: 13.4,
      unit: 'g/dL',
    });
    const regular = createOrderTest('regular-1', {
      name: 'Glucose',
      code: 'GLU',
      resultValue: 102,
      unit: 'mg/dL',
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [panelParent, panelChild, regular],
      reportableCount: 3,
      verifiedCount: 3,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: ['Reviewed'],
    });

    const regularStart = html.indexOf('<div class="page">');
    const firstPanelStart = html.indexOf('<div class="page panel-page"');
    expect(regularStart).toBeGreaterThanOrEqual(0);
    expect(firstPanelStart).toBeGreaterThan(regularStart);

    const regularChunk = html.slice(regularStart, firstPanelStart);
    expect(regularChunk).toContain('Glucose');
    expect(regularChunk).not.toContain('Hemoglobin');

    const panelChunk = html.slice(firstPanelStart);
    expect(panelChunk).toContain('CBC Panel');
    expect(panelChunk).toContain('Hemoglobin');
  });

  it('renders one dedicated panel page per panel parent and comments once at the end', () => {
    const order = createOrder();
    const cbcPanel = createOrderTest('panel-cbc', {
      name: 'CBC Panel',
      code: 'CBC',
      type: TestType.PANEL,
    });
    const cbcChild = createOrderTest('panel-cbc-child', {
      name: 'Hemoglobin',
      code: 'HGB',
      parentOrderTestId: cbcPanel.id,
      resultValue: 12.9,
      unit: 'g/dL',
    });
    const guePanel = createOrderTest('panel-gue', {
      name: 'GUE Panel',
      code: 'GUE',
      type: TestType.PANEL,
      resultParameters: { color: 'yellow' },
      parameterDefinitions: [
        { code: 'color', label: 'Color', normalOptions: ['yellow'] },
      ],
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [cbcPanel, cbcChild, guePanel],
      reportableCount: 3,
      verifiedCount: 3,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: ['Final note'],
    });

    expect(countMatches(html, 'class="page panel-page"')).toBe(2);
    expect(countMatches(html, 'class="panel-page-title">CBC Panel')).toBe(1);
    expect(countMatches(html, 'class="panel-page-title">GUE Panel')).toBe(1);
    expect(countMatches(html, '<strong>Comments:</strong>')).toBe(1);

    const commentsIndex = html.indexOf('<strong>Comments:</strong>');
    const lastPanelIndex = html.lastIndexOf('class="panel-page-title">GUE Panel');
    expect(commentsIndex).toBeGreaterThan(lastPanelIndex);
  });

  it('produces panel-only output when order contains only panels', () => {
    const order = createOrder();
    const panelParent = createOrderTest('panel-only-parent', {
      name: 'GUE Panel',
      code: 'GUE',
      type: TestType.PANEL,
    });
    const panelChild = createOrderTest('panel-only-child', {
      name: 'WBC',
      code: 'WBC',
      parentOrderTestId: panelParent.id,
      resultValue: 5.2,
      unit: 'x10^9/L',
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [panelParent, panelChild],
      reportableCount: 2,
      verifiedCount: 2,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });

    const firstPageIndex = html.indexOf('<div class="page">');
    const firstPanelIndex = html.indexOf('<div class="page panel-page"');
    expect(firstPageIndex).toBe(-1);
    expect(firstPanelIndex).toBeGreaterThanOrEqual(0);
    expect(countMatches(html, 'class="page panel-page"')).toBe(1);
  });

  it('keeps non-panel-only reports unchanged and emits no panel pages', () => {
    const order = createOrder();
    const glu = createOrderTest('regular-glu', {
      name: 'Glucose',
      code: 'GLU',
      resultValue: 101,
      unit: 'mg/dL',
    });
    const urea = createOrderTest('regular-urea', {
      name: 'Urea',
      code: 'UREA',
      resultValue: 28,
      unit: 'mg/dL',
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [glu, urea],
      reportableCount: 2,
      verifiedCount: 2,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: ['Stable'],
    });

    expect(countMatches(html, 'class="page panel-page"')).toBe(0);
    expect(html).toContain('Glucose');
    expect(html).toContain('Urea');
    expect(countMatches(html, '<strong>Comments:</strong>')).toBe(1);
  });

  it('renders regular results with one table header and department tbody blocks', () => {
    const html = buildRegularResultsHtml();

    const regularHeaderRow =
      '<thead><tr><th style="width:28%;">Test</th><th style="width:14%;">Result</th><th style="width:14%;">Unit</th><th style="width:14%;">Status</th><th style="width:30%;">Reference Value</th></tr></thead>';

    expect(countMatches(html, 'class="regular-results-table"')).toBe(1);
    expect(countMatches(html, regularHeaderRow)).toBe(1);
    expect(countMatches(html, 'class="regular-dept-block"')).toBe(2);
    expect(html).toContain('class="dept-row"');
    expect(html).toContain('class="cat-row"');
  });

  it('renders regular results without a status column when hidden', () => {
    const html = buildRegularResultsHtml({ showStatusColumn: false });

    const regularHeaderRow =
      '<thead><tr><th style="width:28%;">Test</th><th style="width:18%;">Result</th><th style="width:18%;">Unit</th><th style="width:36%;">Reference Value</th></tr></thead>';

    expect(countMatches(html, 'class="regular-results-table"')).toBe(1);
    expect(countMatches(html, regularHeaderRow)).toBe(1);
    expect(html).not.toContain('<th style="width:14%;">Status</th>');
    expect(html).toContain('<tr class="dept-row"><td colspan="4">Hormone</td></tr>');
    expect(html).toContain('<tr class="cat-row"><td colspan="4">Thyroid</td></tr>');
  });

  it('renders only category rows when department rows are hidden', () => {
    const html = buildRegularResultsHtml({ showDepartmentRow: false, showCategoryRow: true });

    expect(html).not.toContain('class="dept-row"');
    expect(html).toContain('class="cat-row"');
    expect(countMatches(html, 'class="regular-dept-block"')).toBe(2);
  });

  it('renders only department rows when category rows are hidden', () => {
    const html = buildRegularResultsHtml({ showDepartmentRow: true, showCategoryRow: false });

    expect(html).toContain('class="dept-row"');
    expect(html).not.toContain('class="cat-row"');
    expect(countMatches(html, 'class="regular-dept-block"')).toBe(2);
  });

  it('renders only test rows when both department and category rows are hidden', () => {
    const html = buildRegularResultsHtml({ showDepartmentRow: false, showCategoryRow: false });

    expect(html).not.toContain('class="dept-row"');
    expect(html).not.toContain('class="cat-row"');
    expect(html).toContain('TSH');
    expect(html).toContain('UREA');
    expect(countMatches(html, 'class="regular-dept-block"')).toBe(2);
  });

  it('does not duplicate the regular header row in the regular page markup chunk', () => {
    const order = createOrder();
    const regular = createOrderTest('regular-glu', {
      name: 'Glucose',
      code: 'GLU',
      resultValue: 100,
      unit: 'mg/dL',
      departmentName: 'Chemistry',
      category: 'Main',
    });
    const panelParent = createOrderTest('panel-1', {
      name: 'CBC Panel',
      code: 'CBC',
      type: TestType.PANEL,
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [regular, panelParent],
      reportableCount: 2,
      verifiedCount: 2,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });

    const regularHeaderRow =
      '<thead><tr><th style="width:28%;">Test</th><th style="width:14%;">Result</th><th style="width:14%;">Unit</th><th style="width:14%;">Status</th><th style="width:30%;">Reference Value</th></tr></thead>';
    const firstPanelStart = html.indexOf('<div class="page panel-page"');
    const regularChunk = firstPanelStart >= 0 ? html.slice(0, firstPanelStart) : html;

    expect(countMatches(regularChunk, regularHeaderRow)).toBe(1);
  });

  it('renders panel child tables without a status column when hidden', () => {
    const order = createOrder({
      lab: {
        ...createOrder().lab,
        reportStyle: {
          ...DEFAULT_REPORT_STYLE_V1,
          resultsTable: {
            ...DEFAULT_REPORT_STYLE_V1.resultsTable,
            showStatusColumn: false,
          },
        },
      } as Order['lab'],
    });
    const panelParent = createOrderTest('panel-cbc', {
      name: 'CBC Panel',
      code: 'CBC',
      type: TestType.PANEL,
    });
    const panelChild = createOrderTest('panel-cbc-child', {
      name: 'Hemoglobin',
      code: 'HGB',
      parentOrderTestId: panelParent.id,
      resultValue: 13.4,
      unit: 'g/dL',
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [panelParent, panelChild],
      reportableCount: 2,
      verifiedCount: 2,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });

    const panelHeaderRow =
      '<thead><tr><th style="width:28%;">Test</th><th style="width:18%;">Result</th><th style="width:18%;">Unit</th><th style="width:36%;">Reference Value</th></tr></thead>';

    expect(html).toContain('class="panel-results-table"');
    expect(countMatches(html, panelHeaderRow)).toBe(1);
    expect(html).not.toContain('<th style="width:14%;">Status</th>');
  });

  it('renders GUE/GSE parameter tables without a status column and keeps fallback colspans aligned', () => {
    const order = createOrder({
      lab: {
        ...createOrder().lab,
        reportStyle: {
          ...DEFAULT_REPORT_STYLE_V1,
          resultsTable: {
            ...DEFAULT_REPORT_STYLE_V1.resultsTable,
            showStatusColumn: false,
          },
        },
      } as Order['lab'],
    });
    const noParametersPanel = createOrderTest('panel-gue-empty', {
      name: 'GUE Panel',
      code: 'GUE',
      type: TestType.PANEL,
      resultParameters: { color: '   ' },
    });
    const rawParametersPanel = createOrderTest('panel-gue-raw', {
      name: 'GUE Raw Panel',
      code: 'GUE',
      type: TestType.PANEL,
      resultParameters: { color: 'yellow' },
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [noParametersPanel, rawParametersPanel],
      reportableCount: 2,
      verifiedCount: 2,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });

    const parameterHeaderRow =
      '<thead><tr><th style="width:28%;">Test</th><th style="width:36%;">Result</th><th style="width:36%;">Reference Value</th></tr></thead>';

    expect(countMatches(html, parameterHeaderRow)).toBe(2);
    expect(html).not.toContain('<th style="width:24%;">Status</th>');
    expect(html).toContain('<tr><td colspan="3">No parameters</td></tr>');
    expect(html).toContain('<td style="width:28%;font-weight:600;">color</td>');
    expect(html).toContain('<td style="width:36%;">yellow</td>');
    expect(html).toContain('<td style="width:36%;" class="reference-value">-</td>');
  });

  it('renders culture susceptibility isolates in four S/I/R/R columns with duplicate Resistance headers', () => {
    const order = createOrder();
    const culture = createOrderTest('culture-1', {
      name: 'Urine Culture and Sensitivity',
      code: 'UCUL',
      resultEntryType: 'CULTURE_SENSITIVITY',
      cultureResult: {
        noGrowth: false,
        isolates: [
          {
            isolateKey: 'iso-1',
            organism: 'E. coli',
            source: 'Urine',
            condition: 'Pure growth',
            colonyCount: '10^5 CFU/mL',
            antibiotics: [
              { antibioticName: 'Gentamicin', interpretation: 'S' },
              { antibioticName: 'Amikacin', interpretation: 'S' },
              { antibioticName: 'Aztreonam', interpretation: 'I' },
              { antibioticName: 'Cefepime', interpretation: 'UNK' },
            ],
          },
        ],
      },
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [culture],
      reportableCount: 1,
      verifiedCount: 1,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });

    expect(countMatches(html, 'class="page culture-page"')).toBe(1);
    expect(countMatches(html, 'class="culture-ast-column-title">Sensitive')).toBe(1);
    expect(countMatches(html, 'class="culture-ast-column-title">Intermediate')).toBe(1);
    expect(countMatches(html, 'class="culture-ast-column-title">Resistance')).toBe(1);
    expect(html).toContain('<strong>Source:</strong> Urine');
    expect(html).toContain('<strong>Condition:</strong> Pure growth');
    expect(html).toContain('<strong>Colony count:</strong> 10^5 CFU/mL');
    expect(html).toContain('class="culture-ast-grid culture-ast-grid-three"');
    expect(html).not.toContain(
      'class="culture-ast-column culture-ast-column-resistance-secondary"',
    );
    expect(html).not.toContain('class="culture-ast-table"');
    expect(html).not.toContain('<th>Interpretation</th>');
    expect(html).not.toContain('<th>MIC</th>');

    const sensitiveChunk = sliceBetween(
      html,
      'culture-ast-column culture-ast-column-sensitive',
      'culture-ast-column culture-ast-column-intermediate',
    );
    expect(sensitiveChunk.indexOf('Amikacin')).toBeGreaterThanOrEqual(0);
    expect(sensitiveChunk.indexOf('Gentamicin')).toBeGreaterThanOrEqual(0);
    expect(sensitiveChunk.indexOf('Amikacin')).toBeLessThan(
      sensitiveChunk.indexOf('Gentamicin'),
    );

    const intermediateChunk = sliceBetween(
      html,
      'culture-ast-column culture-ast-column-intermediate',
      'culture-ast-column culture-ast-column-resistance-primary',
    );
    expect(intermediateChunk).toContain('Aztreonam');
    expect(intermediateChunk).not.toContain('Cefepime');

    const resistanceChunk = sliceBetween(
      html,
      'culture-ast-column culture-ast-column-resistance-primary',
      'class="report-footer',
    );
    expect(resistanceChunk).toContain('Cefepime');
  });

  it('splits sorted resistance antibiotics into two sequential resistance columns', () => {
    const order = createOrder();
    const culture = createOrderTest('culture-r-split', {
      name: 'Urine Culture and Sensitivity',
      code: 'UCUL',
      resultEntryType: 'CULTURE_SENSITIVITY',
      cultureResult: {
        noGrowth: false,
        isolates: [
          {
            isolateKey: 'iso-1',
            organism: 'Klebsiella',
            antibiotics: Array.from({ length: 26 }, (_, index) => ({
              antibioticName: `Drug ${String(index + 1).padStart(2, '0')}`,
              interpretation: 'R',
            })),
          },
        ],
      },
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [culture],
      reportableCount: 1,
      verifiedCount: 1,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });
    expect(countMatches(html, 'class="culture-ast-column-title">Resistance')).toBe(2);
    expect(html).toContain('class="culture-ast-grid culture-ast-grid-four"');

    const resistancePrimaryChunk = sliceBetween(
      html,
      'culture-ast-column culture-ast-column-resistance-primary',
      'culture-ast-column culture-ast-column-resistance-secondary',
    );
    expect(resistancePrimaryChunk).toContain('Drug 01');
    expect(resistancePrimaryChunk).toContain('Drug 24');
    expect(resistancePrimaryChunk).not.toContain('Drug 25');
    expect(resistancePrimaryChunk.indexOf('Drug 01')).toBeLessThan(
      resistancePrimaryChunk.indexOf('Drug 24'),
    );

    const resistanceSecondaryChunk = sliceBetween(
      html,
      'culture-ast-column culture-ast-column-resistance-secondary',
      'class="report-footer',
    );
    expect(resistanceSecondaryChunk).toContain('Drug 25');
    expect(resistanceSecondaryChunk).toContain('Drug 26');
    expect(resistanceSecondaryChunk.indexOf('Drug 25')).toBeLessThan(
      resistanceSecondaryChunk.indexOf('Drug 26'),
    );
  });

  it('renders no-growth culture section with only result, source, and comment fields', () => {
    const order = createOrder();
    const culture = createOrderTest('culture-no-growth', {
      name: 'Blood Culture and Sensitivity',
      code: 'BCUL',
      resultEntryType: 'CULTURE_SENSITIVITY',
      cultureResult: {
        noGrowth: true,
        noGrowthResult: 'No growth of microorganizm',
        notes: 'No pathogen detected',
        isolates: [
          {
            isolateKey: 'iso-1',
            source: 'Urine',
            comment: 'No pathogenic colonies',
            antibiotics: [],
          },
        ],
      },
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [culture],
      reportableCount: 1,
      verifiedCount: 1,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });

    expect(html).toContain('<div class="culture-no-growth-result">Result: No growth of microorganizm</div>');
    expect(html).toContain('<strong>Source:</strong> Urine');
    expect(html).toContain('<strong>Comment:</strong> No pathogenic colonies');
    expect(html).not.toContain('class="culture-ast-grid');
    expect(html).not.toContain('class="culture-isolate-title-label">Microorganism:</span>');
    expect(html).not.toContain('<strong>Condition:</strong>');
    expect(html).not.toContain('<strong>Colony count:</strong>');
    expect(countMatches(html, '<strong>Notes:</strong>')).toBe(0);
  });

  it('renders one culture page per isolate for multi-isolate results', () => {
    const order = createOrder();
    const culture = createOrderTest('culture-multi-isolate', {
      name: 'Urine Culture and Sensitivity',
      code: 'UCUL',
      resultEntryType: 'CULTURE_SENSITIVITY',
      cultureResult: {
        noGrowth: false,
        notes: 'General note',
        isolates: [
          {
            isolateKey: 'iso-1',
            organism: 'E. coli',
            antibiotics: [{ antibioticName: 'Amikacin', interpretation: 'S' }],
          },
          {
            isolateKey: 'iso-2',
            organism: 'Klebsiella pneumoniae',
            antibiotics: [{ antibioticName: 'Cefepime', interpretation: 'R' }],
          },
        ],
      },
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [culture],
      reportableCount: 1,
      verifiedCount: 1,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });

    expect(countMatches(html, 'class="page culture-page"')).toBe(2);
    expect(countMatches(html, 'class="culture-isolate-title-label">Microorganism:</span>')).toBe(2);
    expect(countMatches(html, 'class="culture-isolate-title-value">E. coli</span>')).toBe(1);
    expect(countMatches(html, 'class="culture-isolate-title-value">Klebsiella pneumoniae</span>')).toBe(1);
    expect(countMatches(html, '<strong>Notes:</strong>')).toBe(1);
  });

  it('contains panel overflow-safe page-break CSS rules', () => {
    const html = buildResultsReportHtml({
      order: createOrder(),
      orderTests: [],
      reportableCount: 0,
      verifiedCount: 0,
      verifiers: [],
      latestVerifiedAt: null,
      comments: [],
    });

    expect(html).toContain('--results-regular-dept-break: avoid;');
    expect(html).toContain('--results-regular-row-break: avoid;');
    expect(html).toContain('--results-panel-table-break: auto;');
    expect(html).toContain('--results-panel-row-break: avoid;');
    expect(html).toContain('.panel-page table { page-break-inside: var(--results-panel-table-break); break-inside: var(--results-panel-table-break); }');
    expect(html).toContain('.panel-page tr { page-break-inside: var(--results-panel-row-break); break-inside: var(--results-panel-row-break); }');
    expect(html).toContain('.regular-results-table thead {');
    expect(html).toContain('display: table-header-group;');
    expect(html).toContain('.regular-results-table tbody.regular-dept-block {');
    expect(html).toContain('page-break-inside: var(--results-regular-dept-break);');
  });

  it('keeps result tables at full width with fixed layout CSS', () => {
    const html = buildRegularResultsHtml({ showStatusColumn: false });

    expect(html).toContain('.regular-results-table,');
    expect(html).toContain('.panel-results-table,');
    expect(html).toContain('.gue-gse-table {');
    expect(html).toContain('width: 100%;');
    expect(html).toContain('table-layout: fixed;');
  });

  it('uses contain footer rendering and updated footer height CSS', () => {
    const html = buildResultsReportHtml({
      order: createOrder(),
      orderTests: [],
      reportableCount: 0,
      verifiedCount: 0,
      verifiers: [],
      latestVerifiedAt: null,
      comments: [],
    });

    expect(html).toContain('--footer-height: 18mm;');
    expect(html).toContain('.footer-image {');
    expect(html).toContain('object-fit: contain;');
    expect(html).not.toContain('object-fit: fill;');
  });

  it('injects style variables for patient and results sections', () => {
    const html = buildResultsReportHtml({
      order: createOrder(),
      orderTests: [],
      reportableCount: 0,
      verifiedCount: 0,
      verifiers: [],
      latestVerifiedAt: null,
      comments: [],
    });

    expect(html).toContain(`--patient-info-bg: ${DEFAULT_REPORT_STYLE_V1.patientInfo.backgroundColor};`);
    expect(html).toContain(`--results-header-bg: ${DEFAULT_REPORT_STYLE_V1.resultsTable.headerBackgroundColor};`);
    expect(html).toContain(
      `--patient-info-font-family: ${resolveReportFontStackWithArabicFallback(
        DEFAULT_REPORT_STYLE_V1.patientInfo.fontFamily,
      )};`,
    );
    expect(html).toContain(
      `--results-font-family: ${resolveReportFontStackWithArabicFallback(
        DEFAULT_REPORT_STYLE_V1.resultsTable.fontFamily,
      )};`,
    );
    expect(html).toContain('font-weight: var(--patient-info-value-weight);');
    expect(html).toContain('font-family: var(--patient-info-font-family);');
    expect(html).toContain('font-family: var(--results-font-family);');
    expect(html).toContain(
      '.reference-value { color: var(--results-reference-color); white-space: pre-wrap; word-break: break-word; }',
    );
  });

  it('injects culture section style variables and hooks CSS to them', () => {
    const customStyle: typeof DEFAULT_REPORT_STYLE_V1 = {
      ...DEFAULT_REPORT_STYLE_V1,
      cultureSection: {
        ...DEFAULT_REPORT_STYLE_V1.cultureSection,
        fontFamily: 'verdana',
        sectionTitleColor: '#102030',
        astResistanceBackgroundColor: '#FFECEC',
      },
    };
    const order = createOrder({
      lab: {
        ...createOrder().lab,
        reportStyle: customStyle,
      } as Order['lab'],
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [],
      reportableCount: 0,
      verifiedCount: 0,
      verifiers: [],
      latestVerifiedAt: null,
      comments: [],
    });

    expect(html).toContain(
      `--culture-font-family: ${resolveReportFontStackWithArabicFallback(
        customStyle.cultureSection.fontFamily,
      )};`,
    );
    expect(html).toContain('--culture-section-title-color: #102030;');
    expect(html).toContain('--culture-ast-resistance-bg: #FFECEC;');
    expect(html).toContain('.culture-page .panel-page-title {');
    expect(html).toContain('font-family: var(--culture-font-family);');
    expect(html).toContain('background: var(--culture-ast-resistance-bg);');
  });

  it('renders an order QR in patient info when orderQrDataUrl is provided', () => {
    const html = buildResultsReportHtml({
      order: createOrder(),
      orderTests: [],
      reportableCount: 0,
      verifiedCount: 0,
      verifiers: [],
      latestVerifiedAt: null,
      comments: [],
      orderQrDataUrl: 'data:image/png;base64,abc123',
    });

    expect(html).toContain('class="patient-info has-order-qr"');
    expect(html).toContain('class="patient-info-qr-image" src="data:image/png;base64,abc123" alt="Order QR Code"');
    expect(html).toContain('class="patient-info-qr-caption">Order QR</div>');
  });

  it('uses lab reportStyle values when provided', () => {
    const customStyle: typeof DEFAULT_REPORT_STYLE_V1 = {
      ...DEFAULT_REPORT_STYLE_V1,
      patientInfo: {
        ...DEFAULT_REPORT_STYLE_V1.patientInfo,
        backgroundColor: '#101010',
        fontFamily: 'georgia',
      },
      resultsTable: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable,
        statusHighColor: '#AA0000',
        fontFamily: 'courier-new',
      },
    };
    const order = createOrder({
      lab: {
        ...createOrder().lab,
        reportStyle: customStyle,
      } as Order['lab'],
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [],
      reportableCount: 0,
      verifiedCount: 0,
      verifiers: [],
      latestVerifiedAt: null,
      comments: [],
    });

    expect(html).toContain('--patient-info-bg: #101010;');
    expect(html).toContain('--results-status-high-color: #AA0000;');
    expect(html).toContain(
      `--patient-info-rtl-font-family: ${resolveReportRtlFontStack(customStyle.patientInfo.fontFamily)};`,
    );
    expect(html).toContain(
      `--results-font-family: ${resolveReportFontStackWithArabicFallback(
        customStyle.resultsTable.fontFamily,
      )};`,
    );
  });

  it('prefers order notes for Referred By over patient address fallback', () => {
    const order = createOrder();
    (order as unknown as { notes?: string }).notes = 'Dr Ahmed Ali';
    (order.patient as unknown as { address?: string }).address = 'Patient Address';

    const html = buildResultsReportHtml({
      order,
      orderTests: [],
      reportableCount: 0,
      verifiedCount: 0,
      verifiers: [],
      latestVerifiedAt: null,
      comments: [],
    });

    expect(html).toContain(
      '<span class="label">Referred By:</span><span class="name-value ">Dr Ahmed Ali</span>',
    );
    expect(html).not.toContain(
      '<span class="label">Referred By:</span><span class="name-value ">Patient Address</span>',
    );
  });

  it('renders infant age display against the order registration date', () => {
    const order = createOrder({
      registeredAt: new Date('2026-03-09T10:00:00.000Z'),
      patient: {
        ...createOrder().patient,
        sex: 'M',
        dateOfBirth: '2026-03-04',
      } as Order['patient'],
    });

    const html = buildResultsReportHtml({
      order,
      orderTests: [],
      reportableCount: 0,
      verifiedCount: 0,
      verifiers: [],
      latestVerifiedAt: null,
      comments: [],
    });

    expect(html).toContain('<span class="label">Age/Sex:</span>5 days/Male');
  });
});
