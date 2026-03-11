import { buildLabelPrintingAuditSnapshot } from './label-audit';
import {
  benchmarkLabelPrintingStrategies,
  createSyntheticLabelBenchmarkOrder,
} from './label-benchmark';
import {
  DEFAULT_LABEL_BARCODE_SPEC,
  DEFAULT_LABEL_LAYOUT_SPEC,
} from './label-printing-spec';

declare global {
  interface Window {
    __lisLabelPrintingDevtools__?: {
      benchmarkLabelPrintingStrategies: typeof benchmarkLabelPrintingStrategies;
      buildLabelPrintingAuditSnapshot: typeof buildLabelPrintingAuditSnapshot;
      createSyntheticLabelBenchmarkOrder: typeof createSyntheticLabelBenchmarkOrder;
      defaultBarcodeSpec: typeof DEFAULT_LABEL_BARCODE_SPEC;
      defaultLayoutSpec: typeof DEFAULT_LABEL_LAYOUT_SPEC;
    };
  }
}

export function installLabelPrintingDevtools(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.__lisLabelPrintingDevtools__ = {
    benchmarkLabelPrintingStrategies,
    buildLabelPrintingAuditSnapshot,
    createSyntheticLabelBenchmarkOrder,
    defaultBarcodeSpec: DEFAULT_LABEL_BARCODE_SPEC,
    defaultLayoutSpec: DEFAULT_LABEL_LAYOUT_SPEC,
  };

  console.info(
    '[label-print] devtools ready on window.__lisLabelPrintingDevtools__',
  );
}
