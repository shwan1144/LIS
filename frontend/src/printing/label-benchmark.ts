import type {
  DepartmentDto,
  OrderDto,
  OrderTestDto,
  SampleDto,
  TestDto,
} from '../api/client';
import { buildLabelPrintingAuditSnapshot, type LabelPrintingAuditSnapshot } from './label-audit';
import { buildSampleLabelViewModels, type LabelSequenceBy } from './label-view-model';
import {
  formatBytes,
  formatDuration,
  measureAsync,
  utf8ByteLength,
} from './label-printing-telemetry';
import {
  resolvePrinterCapabilityProfile,
  type LabelPrinterConfig,
} from './label-printing-spec';
import { buildLabelsPrintElement, renderLabelsToPdf } from './direct-print';
import { generateZebraLabelZpl } from './zebra-label';

export type LabelPrintingBenchmarkRow = {
  generationMs: number;
  labelCount: number;
  notes: string;
  payloadBytes: number;
  strategy: 'pdf_preview' | 'zpl_native' | 'zpl_raster';
};

export type LabelPrintingBenchmarkReport = {
  audit: LabelPrintingAuditSnapshot;
  generatedAt: string;
  markdownTable: string;
  rows: LabelPrintingBenchmarkRow[];
};

export async function benchmarkLabelPrintingStrategies(params: {
  batchSizes?: number[];
  departments?: DepartmentDto[];
  labelSequenceBy?: LabelSequenceBy;
  order?: OrderDto;
  printerConfig?: LabelPrinterConfig | null;
  printerName?: string | null;
} = {}): Promise<LabelPrintingBenchmarkReport> {
  const batchSizes = params.batchSizes ?? [1, 5, 10, 20];
  const rows: LabelPrintingBenchmarkRow[] = [];

  for (const batchSize of batchSizes) {
    const asciiOrder = params.order
      ? cloneOrderForBenchmark(params.order, batchSize)
      : createSyntheticLabelBenchmarkOrder({ labelCount: batchSize });
    const rasterOrder = withRasterizedTextVariant(asciiOrder);
    const profile = resolvePrinterCapabilityProfile({
      printerConfig: params.printerConfig,
      printerName: params.printerName,
    });

    const nativeZplResult = await measureAsync(() =>
      generateZebraLabelZpl({
        departments: params.departments,
        labelSequenceBy: params.labelSequenceBy,
        order: asciiOrder,
        printerConfig: params.printerConfig,
      }),
    );
    rows.push({
      generationMs: nativeZplResult.durationMs,
      labelCount: buildSampleLabelViewModels(asciiOrder).length,
      notes: `profile=${profile.dpiClass}; mostly native text`,
      payloadBytes: utf8ByteLength(nativeZplResult.result),
      strategy: 'zpl_native',
    });

    const rasterZplResult = await measureAsync(() =>
      generateZebraLabelZpl({
        departments: params.departments,
        labelSequenceBy: params.labelSequenceBy,
        order: rasterOrder,
        printerConfig: params.printerConfig,
      }),
    );
    rows.push({
      generationMs: rasterZplResult.durationMs,
      labelCount: buildSampleLabelViewModels(rasterOrder).length,
      notes: 'same layout with Arabic text forcing raster graphics',
      payloadBytes: utf8ByteLength(rasterZplResult.result),
      strategy: 'zpl_raster',
    });

    const pdfResult = await measureAsync(() =>
      renderLabelsToPdf(
        buildLabelsPrintElement({
          departments: params.departments,
          labelSequenceBy: params.labelSequenceBy,
          order: asciiOrder,
        }),
        profile.pageWidthMm,
        profile.pageHeightMm,
      ),
    );
    rows.push({
      generationMs: pdfResult.durationMs,
      labelCount: buildSampleLabelViewModels(asciiOrder).length,
      notes: 'html2canvas + jsPDF preview path; dispatch timing captured only during live prints',
      payloadBytes: pdfResult.result.size,
      strategy: 'pdf_preview',
    });
  }

  return {
    audit: buildLabelPrintingAuditSnapshot({
      departments: params.departments,
      labelSequenceBy: params.labelSequenceBy,
      order: params.order ?? createSyntheticLabelBenchmarkOrder({ labelCount: batchSizes[0] ?? 1 }),
      printerConfig: params.printerConfig,
      printerName: params.printerName,
    }),
    generatedAt: new Date().toISOString(),
    markdownTable: formatLabelPrintingBenchmarkTable(rows),
    rows,
  };
}

export function createSyntheticLabelBenchmarkOrder(params: {
  labelCount?: number;
  useRasterText?: boolean;
} = {}): OrderDto {
  const labelCount = Math.max(1, params.labelCount ?? 5);
  const useRasterText = params.useRasterText ?? false;
  const patientName = useRasterText ? 'مريض تجريبي لفحص الطباعة' : 'Benchmark Patient';
  const orderNumber = 'LAB-240001';

  const samples = Array.from({ length: labelCount }, (_, index) =>
    createBenchmarkSample(index, orderNumber, useRasterText),
  );

  return {
    createdAt: '2026-03-11T08:00:00.000Z',
    discountPercent: 0,
    finalAmount: 100,
    id: 'benchmark-order',
    lab: {
      id: 'benchmark-lab',
      labelSequenceBy: 'tube_type',
      name: 'Benchmark Lab',
    } as OrderDto['lab'],
    labId: 'benchmark-lab',
    notes: null,
    orderNumber,
    paidAmount: 100,
    patient: {
      externalId: null,
      fullName: patientName,
      id: 'benchmark-patient',
      nationalId: '99887766',
      patientNumber: 'P-240001',
      sex: 'M',
    } as OrderDto['patient'],
    patientId: 'benchmark-patient',
    patientType: 'WALK_IN',
    paymentStatus: 'paid',
    readyTestsCount: labelCount,
    registeredAt: '2026-03-11T08:00:00.000Z',
    reportReady: true,
    samples,
    shift: null,
    shiftId: null,
    status: 'COMPLETED',
    testsCount: labelCount * 2,
    totalAmount: 100,
    updatedAt: '2026-03-11T08:00:00.000Z',
  };
}

export function formatLabelPrintingBenchmarkTable(rows: LabelPrintingBenchmarkRow[]): string {
  const header = [
    '| Batch | Strategy | Generation | Payload | Notes |',
    '| ---: | --- | ---: | ---: | --- |',
  ];
  const body = rows.map((row) =>
    `| ${row.labelCount} | ${row.strategy} | ${formatDuration(row.generationMs)} | ${formatBytes(row.payloadBytes)} | ${row.notes} |`,
  );
  return [...header, ...body].join('\n');
}

function cloneOrderForBenchmark(order: OrderDto, labelCount: number): OrderDto {
  const sourceSamples = order.samples.length > 0
    ? order.samples
    : createSyntheticLabelBenchmarkOrder({ labelCount: 1 }).samples;

  const samples = Array.from({ length: Math.max(1, labelCount) }, (_, index) => {
    const template = sourceSamples[index % sourceSamples.length];
    const sequenceNumber = index + 1;

    return {
      ...template,
      barcode: template.barcode?.trim() || `BCH${String(sequenceNumber).padStart(4, '0')}`,
      id: `${template.id}-bench-${sequenceNumber}`,
      notes: template.notes ?? null,
      orderTests: (template.orderTests ?? []).map((orderTest, testIndex) =>
        cloneOrderTest(orderTest, sequenceNumber, testIndex),
      ),
      qrCode: template.qrCode ?? null,
      sequenceNumber,
    };
  });

  return {
    ...order,
    samples,
  };
}

function cloneOrderTest(
  orderTest: OrderTestDto,
  sequenceNumber: number,
  testIndex: number,
): OrderTestDto {
  return {
    ...orderTest,
    id: `${orderTest.id}-bench-${sequenceNumber}-${testIndex + 1}`,
    test: {
      ...orderTest.test,
    },
  };
}

function createBenchmarkSample(
  index: number,
  orderNumber: string,
  useRasterText: boolean,
): SampleDto {
  const sequenceNumber = index + 1;
  const firstTest = createBenchmarkTest(
    index % 2 === 0 ? 'CBC' : 'ALT',
    useRasterText ? 'فحص دم كامل' : 'Complete Blood Count',
  );
  const secondTest = createBenchmarkTest(
    index % 2 === 0 ? 'GLU' : 'AST',
    useRasterText ? 'سكر الدم' : 'Blood Glucose',
  );

  return {
    barcode: `${orderNumber}-${String(sequenceNumber).padStart(2, '0')}`,
    collectedAt: null,
    id: `benchmark-sample-${sequenceNumber}`,
    notes: null,
    orderId: 'benchmark-order',
    orderTests: [
      createBenchmarkOrderTest(sequenceNumber, 1, firstTest),
      createBenchmarkOrderTest(sequenceNumber, 2, secondTest),
    ],
    qrCode: null,
    sampleId: null,
    sequenceNumber,
    tubeType: index % 2 === 0 ? 'SERUM' : 'EDTA',
  };
}

function createBenchmarkOrderTest(
  sequenceNumber: number,
  testIndex: number,
  test: TestDto,
): OrderTestDto {
  return {
    comments: null,
    id: `benchmark-order-test-${sequenceNumber}-${testIndex}`,
    orderId: 'benchmark-order',
    parentOrderTestId: null,
    price: null,
    rejectionReason: null,
    sampleId: `benchmark-sample-${sequenceNumber}`,
    status: 'VERIFIED',
    test,
    testId: test.id,
    verifiedAt: null,
    verifiedBy: null,
  } as OrderTestDto;
}

function createBenchmarkTest(code: string, name: string): TestDto {
  return {
    category: 'CHEMISTRY',
    code,
    departmentId: 'chemistry',
    id: `test-${code.toLowerCase()}`,
    name,
  } as TestDto;
}

function withRasterizedTextVariant(order: OrderDto): OrderDto {
  const cloned = cloneOrderForBenchmark(order, order.samples.length);

  return {
    ...cloned,
    patient: {
      ...cloned.patient,
      fullName: 'مريض تجريبي لفحص الطباعة',
    },
    samples: cloned.samples.map((sample, index) => ({
      ...sample,
      orderTests: sample.orderTests.map((orderTest, testIndex) => ({
        ...cloneOrderTest(orderTest, index + 1, testIndex),
        test: {
          ...orderTest.test,
          code: '',
          name: testIndex === 0 ? 'فحص دم كامل' : 'سكر الدم',
        },
      })),
    })),
  };
}
