import { forwardRef, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import dayjs from 'dayjs';
import type { DepartmentDto, OrderDto, SampleDto } from '../../api/client';
import './print.css';

interface SampleLabelProps {
  order: OrderDto;
  sample: SampleDto;
  index: number;
  labelSequenceBy?: 'tube_type' | 'department';
  departmentsById?: Map<string, DepartmentDto>;
}

function formatTubeType(tubeType: string | null | undefined): string {
  if (!tubeType) return 'TUBE';
  return tubeType.replace(/_/g, ' ');
}

function getDepartmentScope(
  sample: SampleDto,
  departmentsById?: Map<string, DepartmentDto>,
): string {
  const deptIdCandidates = Array.from(
    new Set(
      (sample.orderTests ?? [])
        .map((ot) => ot.test?.departmentId?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (deptIdCandidates.length === 1) {
    const departmentId = deptIdCandidates[0];
    const department = departmentsById?.get(departmentId);
    if (department?.name?.trim()) return department.name.trim().toUpperCase();
    return departmentId.toUpperCase();
  }
  if (deptIdCandidates.length > 1) return 'MULTI DEPT';

  const categoryCandidates = Array.from(
    new Set(
      (sample.orderTests ?? [])
        .map((ot) => ot.test?.category?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (categoryCandidates.length === 1) return categoryCandidates[0].toUpperCase();
  if (categoryCandidates.length > 1) return 'MULTI DEPT';

  return 'NO DEPT';
}

export const SampleLabel = forwardRef<HTMLDivElement, SampleLabelProps>(
  ({ order, sample, index, labelSequenceBy, departmentsById }, ref) => {
  const barcodeRef = useRef<SVGSVGElement>(null);

  const patientName = order.patient.fullName || '';
  const patientGlobalId =
    order.patient.patientNumber ||
    order.patient.externalId ||
    order.patient.nationalId ||
    order.patient.id ||
    '-';

  const barcodeValue =
    (order.orderNumber && order.orderNumber.trim()) ||
    sample.barcode ||
    `${dayjs(order.registeredAt).format('YYMMDD')}${String(index + 1).padStart(3, '0')}`;
  const barcodeText = (order.orderNumber && order.orderNumber.trim()) || barcodeValue;

  useEffect(() => {
    if (barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: 'CODE128',
          width: 0.9,
          height: 16,
          margin: 0,
          displayValue: true,
          text: barcodeText,
          fontSize: 5,
          textMargin: 0,
          lineColor: '#000000',
        });
      } catch (error) {
        console.error('Failed to generate barcode:', error);
      }
    }
  }, [barcodeValue, barcodeText]);

  const testCodes = sample.orderTests
    .map((ot) => ot.test.code || ot.test.name)
    .filter(Boolean)
    .join(', ');

  const sexLabel = order.patient.sex === 'M' ? 'Male' : order.patient.sex === 'F' ? 'Female' : order.patient.sex || '-';

  const sequenceDisplay =
    sample.sequenceNumber != null
      ? String(sample.sequenceNumber)
      : barcodeValue.length >= 3
        ? barcodeValue.slice(-3)
        : String(index + 1).padStart(3, '0');

  const effectiveLabelSequenceBy = labelSequenceBy ?? order.lab?.labelSequenceBy ?? 'tube_type';
  const scopeLabel =
    effectiveLabelSequenceBy === 'department'
      ? getDepartmentScope(sample, departmentsById)
      : formatTubeType(sample.tubeType);

  const sequenceLabel = `${scopeLabel} - ${sequenceDisplay}`;

  return (
    <div ref={ref} className="sample-label">
      <div className="label-sequence-strip">
        <span className="label-sequence-text">{sequenceLabel}</span>
      </div>

      <div className="label-main">
        <div className="label-header-row">
          <div className="label-name-cell">{patientName || 'Name here'}</div>
          <div className="label-sex-cell">{sexLabel}</div>
        </div>

        <div className="label-body">
          <div className="label-left-margin" />
          <div className="label-content">
            <div className="label-barcode-row">
              <div className="label-barcode">
                <svg ref={barcodeRef} />
              </div>
            </div>
            <div className="label-test-row">{testCodes || 'Test code'}</div>
          </div>
        </div>
      </div>

      <div className="label-patient-number-strip">
        <span className="label-patient-number-text">{patientGlobalId}</span>
      </div>
    </div>
  );
});

SampleLabel.displayName = 'SampleLabel';

interface AllSampleLabelsProps {
  order: OrderDto;
  labelSequenceBy?: 'tube_type' | 'department';
  departments?: DepartmentDto[];
}

export const AllSampleLabels = forwardRef<HTMLDivElement, AllSampleLabelsProps>(
  ({ order, labelSequenceBy, departments }, ref) => {
  const departmentsById = new Map((departments ?? []).map((department) => [department.id, department]));

  return (
    <div ref={ref} className="all-labels-container">
      {order.samples.map((sample, index) => (
        <SampleLabel
          key={sample.id}
          order={order}
          sample={sample}
          index={index}
          labelSequenceBy={labelSequenceBy}
          departmentsById={departmentsById}
        />
      ))}
    </div>
  );
});

AllSampleLabels.displayName = 'AllSampleLabels';
