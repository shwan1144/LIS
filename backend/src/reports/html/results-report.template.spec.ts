import type { Order } from '../../entities/order.entity';
import type { OrderTest } from '../../entities/order-test.entity';
import { TestType } from '../../entities/test.entity';
import { DEFAULT_REPORT_STYLE_V1 } from '../report-style.config';
import { buildResultsReportHtml } from './results-report.template';

function countMatches(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
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
  },
): OrderTest {
  return {
    id,
    parentOrderTestId: options.parentOrderTestId ?? null,
    resultText: options.resultText ?? null,
    resultValue: options.resultValue ?? null,
    resultParameters: options.resultParameters ?? null,
    flag: null,
    test: {
      name: options.name,
      code: options.code,
      abbreviation: options.abbreviation ?? null,
      type: options.type ?? TestType.SINGLE,
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
    const order = createOrder();
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

    const html = buildResultsReportHtml({
      order,
      orderTests: [hormoneTsh, hormoneT3, chemistryUrea],
      reportableCount: 3,
      verifiedCount: 3,
      verifiers: ['Verifier'],
      latestVerifiedAt: new Date('2026-02-26T11:00:00.000Z'),
      comments: [],
    });

    const regularHeaderRow =
      '<thead><tr><th style="width:28%;">Test</th><th style="width:14%;">Result</th><th style="width:14%;">Unit</th><th style="width:14%;">Status</th><th style="width:30%;">Reference Value</th></tr></thead>';

    expect(countMatches(html, 'class="regular-results-table"')).toBe(1);
    expect(countMatches(html, regularHeaderRow)).toBe(1);
    expect(countMatches(html, 'class="regular-dept-block"')).toBe(2);
    expect(html).toContain('class="dept-row"');
    expect(html).toContain('class="cat-row"');
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
    expect(html).toContain('font-weight: var(--patient-info-value-weight);');
    expect(html).toContain(
      '.reference-value { color: var(--results-reference-color); white-space: pre-wrap; word-break: break-word; }',
    );
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
    const customStyle = {
      ...DEFAULT_REPORT_STYLE_V1,
      patientInfo: {
        ...DEFAULT_REPORT_STYLE_V1.patientInfo,
        backgroundColor: '#101010',
      },
      resultsTable: {
        ...DEFAULT_REPORT_STYLE_V1.resultsTable,
        statusHighColor: '#AA0000',
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
});
