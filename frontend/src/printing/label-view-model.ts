import type { DepartmentDto, OrderDto, SampleDto } from '../api/client';
import { formatPatientAgeCompactDisplay } from '../utils/patient-age';

export type LabelSequenceBy = 'tube_type' | 'department';

export type SampleLabelViewModel = {
  patientName: string;
  patientGlobalId: string;
  barcodeValue: string;
  barcodeText: string;
  registeredAtLabel: string;
  sexLabel: string;
  sequenceDisplay: string;
  scopeLabel: string;
  sequenceLabel: string;
  testCodes: string;
};

type BuildSampleLabelOptions = {
  departmentsById?: Map<string, DepartmentDto>;
  labelSequenceBy?: LabelSequenceBy;
};

type BuildSampleLabelsOptions = {
  departments?: DepartmentDto[] | Map<string, DepartmentDto>;
  labelSequenceBy?: LabelSequenceBy;
};

export function buildSampleLabelViewModels(
  order: OrderDto,
  options: BuildSampleLabelsOptions = {},
): SampleLabelViewModel[] {
  const departmentsById = normalizeDepartmentsById(options.departments);
  return (order.samples ?? []).map((sample, index) =>
    buildSampleLabelViewModel(order, sample, index, {
      departmentsById,
      labelSequenceBy: options.labelSequenceBy,
    }),
  );
}

export function buildSampleLabelViewModel(
  order: OrderDto,
  sample: SampleDto,
  index: number,
  options: BuildSampleLabelOptions = {},
): SampleLabelViewModel {
  const patientName = order.patient.fullName?.trim() || '';
  const patientGlobalId = getPatientGlobalId(order);
  const trimmedOrderNumber = order.orderNumber?.trim() || '';
  const sampleBarcode = sample.barcode?.trim() || '';
  const barcodeValue = trimmedOrderNumber || sampleBarcode || deriveSampleBarcodeFallback(sample.id);
  const barcodeText = trimmedOrderNumber || barcodeValue;
  const registeredAtLabel = formatRegisteredAtLabel(order.registeredAt);
  // Keep age stable across reprints by computing it at order registration time.
  const sexLabel = formatSexLabel(
    order.patient.sex,
    order.patient.dateOfBirth,
    order.registeredAt,
  );
  const sequenceDisplay = getSequenceDisplay(sample, barcodeValue, index);
  const effectiveLabelSequenceBy = options.labelSequenceBy ?? order.lab?.labelSequenceBy ?? 'tube_type';
  const scopeLabel =
    effectiveLabelSequenceBy === 'department'
      ? getDepartmentScope(sample, options.departmentsById)
      : formatTubeType(sample.tubeType);
  const testCodes = (sample.orderTests ?? [])
    .filter((orderTest) => !orderTest.parentOrderTestId)
    .map((orderTest) => orderTest.test.code?.trim() || orderTest.test.name?.trim() || '')
    .filter(Boolean)
    .join(', ');

  return {
    barcodeText,
    barcodeValue,
    patientGlobalId,
    patientName,
    registeredAtLabel,
    scopeLabel,
    sequenceDisplay,
    sequenceLabel: `${scopeLabel} - ${sequenceDisplay}`,
    sexLabel,
    testCodes,
  };
}

function normalizeDepartmentsById(
  departments?: DepartmentDto[] | Map<string, DepartmentDto>,
): Map<string, DepartmentDto> | undefined {
  if (!departments) {
    return undefined;
  }
  if (departments instanceof Map) {
    return departments;
  }
  return new Map(departments.map((department) => [department.id, department]));
}

function getPatientGlobalId(order: OrderDto): string {
  const candidates = [
    order.patient.patientNumber,
    order.patient.externalId,
    order.patient.nationalId,
    order.patient.id,
  ];
  for (const candidate of candidates) {
    const trimmed = String(candidate ?? '').trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return '-';
}

function formatSexLabel(
  value: string | null | undefined,
  dateOfBirth: string | null | undefined,
  referenceDate: string | null | undefined,
): string {
  const normalized = String(value ?? '').trim();
  const sexCode = normalizeSexCode(normalized);
  const ageLabel = formatPatientAgeCompactDisplay(dateOfBirth, referenceDate);

  if (sexCode && ageLabel) {
    return `${sexCode}/${ageLabel}`;
  }
  if (sexCode) {
    return sexCode;
  }
  if (ageLabel) {
    return ageLabel;
  }
  return '-';
}

function normalizeSexCode(value: string): string {
  if (!value) {
    return '';
  }

  const upper = value.toUpperCase();
  if (upper === 'M' || upper === 'MALE') {
    return 'M';
  }
  if (upper === 'F' || upper === 'FEMALE') {
    return 'F';
  }

  return value;
}

function getSequenceDisplay(sample: SampleDto, barcodeValue: string, index: number): string {
  if (sample.sequenceNumber != null) {
    return String(sample.sequenceNumber);
  }
  if (barcodeValue.length >= 3) {
    return barcodeValue.slice(-3);
  }
  return String(index + 1).padStart(3, '0');
}

function deriveSampleBarcodeFallback(sampleId: string): string {
  const normalized = sampleId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (normalized) {
    return `S${normalized.slice(-8)}`;
  }
  return 'SAMPLE';
}

function formatTubeType(tubeType: string | null | undefined): string {
  if (!tubeType) {
    return 'TUBE';
  }
  return tubeType.replace(/_/g, ' ');
}

function getDepartmentScope(
  sample: SampleDto,
  departmentsById?: Map<string, DepartmentDto>,
): string {
  const departmentIdCandidates = Array.from(
    new Set(
      (sample.orderTests ?? [])
        .map((orderTest) => orderTest.test?.departmentId?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (departmentIdCandidates.length === 1) {
    const departmentId = departmentIdCandidates[0];
    const department = departmentsById?.get(departmentId);
    if (department?.name?.trim()) {
      return department.name.trim().toUpperCase();
    }
    return departmentId.toUpperCase();
  }
  if (departmentIdCandidates.length > 1) {
    return 'MULTI DEPT';
  }

  const categoryCandidates = Array.from(
    new Set(
      (sample.orderTests ?? [])
        .map((orderTest) => orderTest.test?.category?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (categoryCandidates.length === 1) {
    return categoryCandidates[0].toUpperCase();
  }
  if (categoryCandidates.length > 1) {
    return 'MULTI DEPT';
  }

  return 'NO DEPT';
}

function formatRegisteredAtLabel(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '-';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}
