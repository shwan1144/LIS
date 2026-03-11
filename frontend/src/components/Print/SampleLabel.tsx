import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import type { DepartmentDto, OrderDto } from '../../api/client';
import {
  buildSampleLabelViewModels,
  type LabelSequenceBy,
  type SampleLabelViewModel,
} from '../../printing/label-view-model';
import {
  DEFAULT_LABEL_LAYOUT_SPEC,
  createPreviewLabelStyleVariables,
  getPreviewBarcodeOptions,
} from '../../printing/label-printing-spec';
import { fitSingleLineFontSize } from '../../printing/label-text-fit';
import './print.css';

interface SampleLabelProps {
  label: SampleLabelViewModel;
}

const sampleLabelStyle = createPreviewLabelStyleVariables();

export const SampleLabel = forwardRef<HTMLDivElement, SampleLabelProps>(
  ({ label }, ref) => {
    const barcodeRef = useRef<SVGSVGElement>(null);
    const nameRef = useRef<HTMLDivElement>(null);
    const [nameFontSizePx, setNameFontSizePx] = useState(DEFAULT_LABEL_LAYOUT_SPEC.previewHeaderNameFontPx);

    useLayoutEffect(() => {
      const nameElement = nameRef.current;
      const patientName = label.patientName || 'Name here';
      if (!nameElement) {
        return;
      }

      const updateFontSize = () => {
        const nextFontSize = fitSingleLineFontSize({
          fontFamily: DEFAULT_LABEL_LAYOUT_SPEC.previewFontFamily,
          fontSize: DEFAULT_LABEL_LAYOUT_SPEC.previewHeaderNameFontPx,
          fontWeight: 700,
          maxWidth: Math.max(1, nameElement.clientWidth - 1),
          minFontSize: 6.2,
          text: patientName,
        });
        setNameFontSizePx((current) => (Math.abs(current - nextFontSize) < 0.01 ? current : nextFontSize));
      };

      updateFontSize();
      document.fonts?.ready.then(updateFontSize).catch(() => undefined);
    }, [label.patientName]);

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
            <div
              ref={nameRef}
              className="label-name-cell"
              style={{ fontSize: `${nameFontSizePx}px` }}
            >
              {label.patientName || 'Name here'}
            </div>
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
