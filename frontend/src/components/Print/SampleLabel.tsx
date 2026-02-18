import { forwardRef, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import dayjs from 'dayjs';
import type { OrderDto, SampleDto } from '../../api/client';
import './print.css';

interface SampleLabelProps {
  order: OrderDto;
  sample: SampleDto;
  index: number;
}

export const SampleLabel = forwardRef<HTMLDivElement, SampleLabelProps>(
  ({ order, sample, index }, ref) => {
    const barcodeRef = useRef<SVGSVGElement>(null);

    const patientName = order.patient.fullName || '';

    // Use stored barcode (YYMMDD + 3-digit) or fallback for old orders without barcode
    const barcodeValue =
      sample.barcode ||
      `${dayjs(order.registeredAt).format('YYMMDD')}${String(index + 1).padStart(3, '0')}`;

    useEffect(() => {
      if (barcodeRef.current) {
        try {
          JsBarcode(barcodeRef.current, barcodeValue, {
            format: 'CODE128',
            width: 1,
            height: 22,
            margin: 8,
            displayValue: true,
            fontSize: 5,
          });
        } catch (e) {
          console.error('Failed to generate barcode:', e);
        }
      }
    }, [barcodeValue]);

    // Get tests for this sample
    const testCodes = sample.orderTests.map((ot) => ot.test.code).join(', ');

    const sexLabel = order.patient.sex === 'M' ? 'Male' : order.patient.sex === 'F' ? 'Female' : (order.patient.sex || '—');
    const patientNumber = order.patient.patientNumber || order.patient.externalId || order.patient.nationalId || order.orderNumber || '—';
    // Sequence number: from backend (tube sequence by type/department) or fallback to barcode suffix
    const sequenceDisplay =
      sample.sequenceNumber != null
        ? String(sample.sequenceNumber)
        : barcodeValue.length >= 3
          ? barcodeValue.slice(-3)
          : String(index + 1).padStart(3, '0');

    return (
      <div ref={ref} className="sample-label">
        {/* Left: vertical Sequence number strip */}
        <div className="label-sequence-strip">
          <span className="label-sequence-text">{sequenceDisplay}</span>
        </div>
        {/* Center: main content */}
        <div className="label-main">
          {/* Top row: Name (gray) | Sex */}
          <div className="label-header-row">
            <div className="label-name-cell">{patientName || 'Name here'}</div>
            <div className="label-sex-cell">{sexLabel}</div>
          </div>
          {/* Middle: thin left margin + Barcode row */}
          <div className="label-body">
            <div className="label-left-margin" />
            <div className="label-content">
              <div className="label-barcode-row">
                <div className="label-barcode">
                  <svg ref={barcodeRef} />
                </div>
              </div>
              <div className="label-test-row">{testCodes || 'Test name'}</div>
            </div>
          </div>
        </div>
        {/* Right: vertical Patient number strip */}
        <div className="label-patient-number-strip">
          <span className="label-patient-number-text">{patientNumber}</span>
        </div>
      </div>
    );
  }
);

SampleLabel.displayName = 'SampleLabel';

// Component to print all labels for an order
interface AllSampleLabelsProps {
  order: OrderDto;
}

export const AllSampleLabels = forwardRef<HTMLDivElement, AllSampleLabelsProps>(
  ({ order }, ref) => {
    return (
      <div ref={ref} className="all-labels-container">
        {order.samples.map((sample, index) => (
          <SampleLabel
            key={sample.id}
            order={order}
            sample={sample}
            index={index}
          />
        ))}
      </div>
    );
  }
);

AllSampleLabels.displayName = 'AllSampleLabels';
