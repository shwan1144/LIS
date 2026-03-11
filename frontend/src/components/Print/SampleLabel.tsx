import { forwardRef, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import type { DepartmentDto, OrderDto } from '../../api/client';
import {
  buildSampleLabelViewModels,
  type LabelSequenceBy,
  type SampleLabelViewModel,
} from '../../printing/label-view-model';
import {
  createPreviewLabelStyleVariables,
  getPreviewBarcodeOptions,
} from '../../printing/label-printing-spec';
import './print.css';

interface SampleLabelProps {
  label: SampleLabelViewModel;
}

const sampleLabelStyle = createPreviewLabelStyleVariables();

export const SampleLabel = forwardRef<HTMLDivElement, SampleLabelProps>(
  ({ label }, ref) => {
    const barcodeRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
      if (barcodeRef.current) {
        try {
          JsBarcode(
            barcodeRef.current,
            label.barcodeValue,
            getPreviewBarcodeOptions(label.barcodeText),
          );
          barcodeRef.current.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        } catch (error) {
          console.error('Failed to generate barcode:', error);
        }
      }
    }, [label.barcodeText, label.barcodeValue]);

    return (
      <div ref={ref} className="sample-label" style={sampleLabelStyle}>
        <div className="label-sequence-strip">
          <div className="label-side-band label-side-band-main">
            <span className="label-side-rotated-text label-sequence-text">{label.sequenceLabel}</span>
          </div>
          <div className="label-side-band label-side-band-meta">
            <span className="label-side-rotated-text label-sequence-meta-text">{label.registeredAtLabel}</span>
          </div>
        </div>

        <div className="label-main">
          <div className="label-header-row">
            <div className="label-name-cell">{label.patientName || 'Name here'}</div>
            <div className="label-sex-cell">{label.sexLabel}</div>
          </div>

          <div className="label-body">
            <div className="label-left-margin" />
            <div className="label-content">
              <div className="label-barcode-row">
                <div className="label-barcode">
                  <svg ref={barcodeRef} />
                </div>
              </div>
              <div className="label-test-row">{label.testCodes || 'Test code'}</div>
            </div>
          </div>
        </div>

        <div className="label-patient-number-strip">
          <span className="label-patient-number-text">{label.patientGlobalId}</span>
        </div>
      </div>
    );
  });

SampleLabel.displayName = 'SampleLabel';

interface AllSampleLabelsProps {
  order: OrderDto;
  labelSequenceBy?: LabelSequenceBy;
  departments?: DepartmentDto[];
}

export const AllSampleLabels = forwardRef<HTMLDivElement, AllSampleLabelsProps>(
  ({ order, labelSequenceBy, departments }, ref) => {
    const labels = buildSampleLabelViewModels(order, { departments, labelSequenceBy });

    return (
      <div ref={ref} className="all-labels-container">
        {labels.map((label, index) => (
          <SampleLabel
            key={order.samples[index]?.id ?? `${order.id}-${index}`}
            label={label}
          />
        ))}
      </div>
    );
  });

AllSampleLabels.displayName = 'AllSampleLabels';
