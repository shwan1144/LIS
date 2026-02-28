import type { Order } from '../../entities/order.entity';
import type { OrderTest } from '../../entities/order-test.entity';
import { TestType } from '../../entities/test.entity';
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
      normalText: null,
      normalMin: null,
      normalMax: null,
      sortOrder: 0,
      department: { name: 'Chemistry' },
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
    expect(firstPageIndex).toBe(firstPanelIndex);
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

    expect(html).toContain('.panel-page table { page-break-inside: auto; break-inside: auto; }');
    expect(html).toContain('.panel-page tr { page-break-inside: avoid; break-inside: avoid; }');
  });
});
