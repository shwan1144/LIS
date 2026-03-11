import type { DepartmentDto, OrderDto } from '../api/client';
import { buildSampleLabelViewModels, type LabelSequenceBy } from './label-view-model';
import {
  DEFAULT_LABEL_BARCODE_SPEC,
  resolvePrinterCapabilityProfile,
  type LabelPrinterConfig,
  type PrinterCapabilityProfile,
} from './label-printing-spec';

export type LabelAuditField = {
  fallbackChain: string;
  field: 'barcodeText' | 'barcodeValue' | 'patientGlobalId' | 'patientName' | 'sequenceLabel' | 'sexLabel' | 'testCodes';
  sampleValue: string;
  source: string;
};

export type LabelPrintingAuditSnapshot = {
  barcode: {
    allowedPayload: string;
    longestPayloadLength: number;
    payloadSamples: string[];
    primaryIdentityMode: 'order_number_primary' | 'sample_barcode_primary' | 'sample_id_fallback';
    quietZoneMm: number;
    symbology: 'CODE128';
    target: 'internal_lab';
    textMatchesPayloadAcrossLabels: boolean;
  };
  capabilityProfile: PrinterCapabilityProfile;
  fields: LabelAuditField[];
  labelCount: number;
  previewRenderer: string;
  zebraRenderer: string;
};

export function buildLabelPrintingAuditSnapshot(params: {
  departments?: DepartmentDto[];
  labelSequenceBy?: LabelSequenceBy;
  order: OrderDto;
  printerConfig?: LabelPrinterConfig | null;
  printerName?: string | null;
}): LabelPrintingAuditSnapshot {
  const labels = buildSampleLabelViewModels(params.order, {
    departments: params.departments,
    labelSequenceBy: params.labelSequenceBy,
  });
  const firstLabel = labels[0];
  const orderNumber = params.order.orderNumber?.trim();
  const capabilityProfile = resolvePrinterCapabilityProfile({
    printerConfig: params.printerConfig,
    printerName: params.printerName,
  });

  return {
    barcode: {
      allowedPayload: DEFAULT_LABEL_BARCODE_SPEC.allowedPayload,
      longestPayloadLength: labels.reduce(
        (longest, label) => Math.max(longest, label.barcodeValue.length),
        0,
      ),
      payloadSamples: labels.slice(0, 3).map((label) => label.barcodeValue),
      primaryIdentityMode: orderNumber
        ? 'order_number_primary'
        : labels.some((label) => label.barcodeValue.startsWith('S'))
          ? 'sample_id_fallback'
          : 'sample_barcode_primary',
      quietZoneMm: DEFAULT_LABEL_BARCODE_SPEC.minimumQuietZoneMm,
      symbology: DEFAULT_LABEL_BARCODE_SPEC.symbology,
      target: DEFAULT_LABEL_BARCODE_SPEC.target,
      textMatchesPayloadAcrossLabels: labels.every(
        (label) => label.barcodeText === label.barcodeValue,
      ),
    },
    capabilityProfile,
    fields: [
      {
        fallbackChain: 'order.patient.fullName -> ""',
        field: 'patientName',
        sampleValue: firstLabel?.patientName ?? '',
        source: 'order.patient.fullName',
      },
      {
        fallbackChain:
          'order.patient.patientNumber -> externalId -> nationalId -> patient.id -> "-"',
        field: 'patientGlobalId',
        sampleValue: firstLabel?.patientGlobalId ?? '',
        source: 'order.patient identifiers',
      },
      {
        fallbackChain: 'order.orderNumber -> sample.barcode -> sample.id derived fallback',
        field: 'barcodeValue',
        sampleValue: firstLabel?.barcodeValue ?? '',
        source: 'order.orderNumber / sample.barcode',
      },
      {
        fallbackChain: 'order.orderNumber -> barcodeValue',
        field: 'barcodeText',
        sampleValue: firstLabel?.barcodeText ?? '',
        source: 'order.orderNumber / barcodeValue',
      },
      {
        fallbackChain: 'patient.sex -> normalized string -> "-"',
        field: 'sexLabel',
        sampleValue: firstLabel?.sexLabel ?? '',
        source: 'order.patient.sex',
      },
      {
        fallbackChain: 'tube type or department scope -> sequence number / barcode suffix / index',
        field: 'sequenceLabel',
        sampleValue: firstLabel?.sequenceLabel ?? '',
        source: 'sample scope + sequence',
      },
      {
        fallbackChain: 'top-level orderTests -> test.code -> test.name -> ""',
        field: 'testCodes',
        sampleValue: firstLabel?.testCodes ?? '',
        source: 'sample.orderTests[].test',
      },
    ],
    labelCount: labels.length,
    previewRenderer: 'JsBarcode SVG + CSS millimeter layout',
    zebraRenderer: 'Native ZPL ^BC barcode + dot geometry + raster fallback for non-ASCII text',
  };
}
