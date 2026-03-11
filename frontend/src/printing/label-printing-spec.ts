import type { CSSProperties } from 'react';

const DEFAULT_DPI = 203;
const CSS_MM_TO_PX = 96 / 25.4;

export type LabelPrinterConfig = {
  mediaHeightMm?: number | null;
  mediaWidthMm?: number | null;
  resolutionXDpi?: number | null;
  resolutionYDpi?: number | null;
};

export type ZebraLabelGeometry = {
  dpiX: number;
  dpiY: number;
  pageHeightMm: number;
  pageWidthMm: number;
  widthDots: number;
  heightDots: number;
};

export type LabelLayoutSpec = {
  pageWidthMm: number;
  pageHeightMm: number;
  borderThicknessRatio: number;
  paddingXmm: number;
  paddingYmm: number;
  headerHeightMm: number;
  leftStripWidthMm: number;
  leftStripMetaWidthRatio: number;
  rightStripWidthMm: number;
  innerLeftMarginMm: number;
  sexWidthRatio: number;
  nameSexGapMm: number;
  bodyTopGapMm: number;
  barcodeTextGapMm: number;
  testRowHeightMm: number;
  previewFontFamily: string;
  previewHeaderNameFontPx: number;
  previewHeaderSexFontPx: number;
  previewSideStripFontPx: number;
  previewSideMetaFontPx: number;
  previewTestFontPx: number;
};

export type BarcodeSpec = {
  symbology: 'CODE128';
  previewFormat: 'CODE128';
  target: 'internal_lab';
  humanReadableText: 'match_payload';
  allowedPayload: 'printable_ascii_without_zpl_control_chars';
  minimumQuietZoneMm: number;
  quietZoneModules: number;
  heightMm: number;
  textHeightMm: number;
  previewModuleWidthMm: number;
  previewHeightPx: number;
  previewTextFontPx: number;
  previewTextMarginPx: number;
  maxZplModuleWidthDots: number;
};

export type PrinterCapabilityProfile = ZebraLabelGeometry & {
  barcode: BarcodeSpec;
  dpiClass: '203dpi_class' | '300dpi_or_higher';
  hasExplicitDpi: boolean;
  hasExplicitMediaSize: boolean;
  isZebra: boolean;
  layout: LabelLayoutSpec;
  preferRawZpl: boolean;
  printerName: string | null;
  supportsRawZpl: boolean;
  textRendering: 'native_zpl_with_raster_fallback';
};

export const DEFAULT_LABEL_LAYOUT_SPEC: LabelLayoutSpec = {
  barcodeTextGapMm: 0.2,
  bodyTopGapMm: 1,
  borderThicknessRatio: 0.01,
  headerHeightMm: 4.6,
  innerLeftMarginMm: 0.05,
  leftStripWidthMm: 5.3,
  leftStripMetaWidthRatio: 0.34,
  nameSexGapMm: 0.2,
  paddingXmm: 0.2,
  paddingYmm: 0.5,
  pageHeightMm: 25,
  pageWidthMm: 50,
  previewFontFamily: '"LIS Noto Sans Arabic", Arial, sans-serif',
  previewHeaderNameFontPx: 8.6,
  previewHeaderSexFontPx: 8,
  previewSideStripFontPx: 8.1,
  previewSideMetaFontPx: 5.9,
  previewTestFontPx: 6.8,
  rightStripWidthMm: 2.9,
  sexWidthRatio: 0.12,
  testRowHeightMm: 6.4,
};

export const DEFAULT_LABEL_BARCODE_SPEC: BarcodeSpec = {
  allowedPayload: 'printable_ascii_without_zpl_control_chars',
  heightMm: 8.8,
  humanReadableText: 'match_payload',
  maxZplModuleWidthDots: 3,
  minimumQuietZoneMm: 1.5,
  previewFormat: 'CODE128',
  previewHeightPx: 34,
  previewModuleWidthMm: 0.24,
  previewTextFontPx: 7,
  previewTextMarginPx: -1,
  quietZoneModules: 10,
  symbology: 'CODE128',
  target: 'internal_lab',
  textHeightMm: 2.1,
};

export function createPreviewLabelStyleVariables(
  layoutSpec: LabelLayoutSpec = DEFAULT_LABEL_LAYOUT_SPEC,
  barcodeSpec: BarcodeSpec = DEFAULT_LABEL_BARCODE_SPEC,
): CSSProperties {
  return {
    '--label-barcode-max-height': `${getBarcodeRowHeightMm(layoutSpec, barcodeSpec)}mm`,
    '--label-barcode-quiet-zone': `${barcodeSpec.minimumQuietZoneMm}mm`,
    '--label-barcode-row-height': `${getBarcodeRowHeightMm(layoutSpec, barcodeSpec)}mm`,
    '--label-body-top-gap': `${layoutSpec.bodyTopGapMm}mm`,
    '--label-header-gap': `${layoutSpec.nameSexGapMm}mm`,
    '--label-header-height': `${layoutSpec.headerHeightMm}mm`,
    '--label-height': `${layoutSpec.pageHeightMm}mm`,
    '--label-inner-left-margin': `${layoutSpec.innerLeftMarginMm}mm`,
    '--label-left-strip-width': `${layoutSpec.leftStripWidthMm}mm`,
    '--label-left-strip-meta-width-ratio': String(layoutSpec.leftStripMetaWidthRatio),
    '--label-name-font-size': `${layoutSpec.previewHeaderNameFontPx}px`,
    '--label-preview-font-family': layoutSpec.previewFontFamily,
    '--label-right-strip-width': `${layoutSpec.rightStripWidthMm}mm`,
    '--label-sex-font-size': `${layoutSpec.previewHeaderSexFontPx}px`,
    '--label-sex-width-ratio': String(layoutSpec.sexWidthRatio),
    '--label-side-meta-font-size': `${layoutSpec.previewSideMetaFontPx}px`,
    '--label-side-strip-font-size': `${layoutSpec.previewSideStripFontPx}px`,
    '--label-test-font-size': `${layoutSpec.previewTestFontPx}px`,
    '--label-test-row-height': `${layoutSpec.testRowHeightMm}mm`,
    '--label-width': `${layoutSpec.pageWidthMm}mm`,
  } as CSSProperties;
}

export function getBarcodeRowHeightMm(
  layoutSpec: LabelLayoutSpec = DEFAULT_LABEL_LAYOUT_SPEC,
  barcodeSpec: BarcodeSpec = DEFAULT_LABEL_BARCODE_SPEC,
): number {
  return layoutSpec.bodyTopGapMm + barcodeSpec.heightMm + barcodeSpec.textHeightMm;
}

export function getCode128QuietZoneDots(
  moduleWidth: number,
  dpi: number,
  barcodeSpec: BarcodeSpec = DEFAULT_LABEL_BARCODE_SPEC,
): number {
  return Math.max(
    mmToDots(barcodeSpec.minimumQuietZoneMm, dpi),
    moduleWidth * barcodeSpec.quietZoneModules,
  );
}

export function getPreviewBarcodeOptions(
  text: string,
  barcodeSpec: BarcodeSpec = DEFAULT_LABEL_BARCODE_SPEC,
): {
  displayValue: boolean;
  fontSize: number;
  format: 'CODE128';
  height: number;
  lineColor: '#000000';
  margin: number;
  text: string;
  textMargin: number;
  width: number;
} {
  return {
    displayValue: true,
    fontSize: barcodeSpec.previewTextFontPx,
    format: barcodeSpec.previewFormat,
    height: barcodeSpec.previewHeightPx,
    lineColor: '#000000',
    margin: 0,
    text,
    textMargin: barcodeSpec.previewTextMarginPx,
    width: roundTo(barcodeSpec.previewModuleWidthMm * CSS_MM_TO_PX, 2),
  };
}

export function mmToDots(valueMm: number, dpi: number): number {
  return Math.round((valueMm / 25.4) * dpi);
}

export function resolveLabelGeometry(
  printerConfig?: LabelPrinterConfig | null,
  layoutSpec: LabelLayoutSpec = DEFAULT_LABEL_LAYOUT_SPEC,
): ZebraLabelGeometry {
  const rawWidthMm = toPositiveNumber(printerConfig?.mediaWidthMm) ?? layoutSpec.pageWidthMm;
  const rawHeightMm = toPositiveNumber(printerConfig?.mediaHeightMm) ?? layoutSpec.pageHeightMm;
  const pageWidthMm = Math.max(rawWidthMm, rawHeightMm);
  const pageHeightMm = Math.min(rawWidthMm, rawHeightMm);
  const dpiX =
    toPositiveNumber(printerConfig?.resolutionXDpi) ??
    toPositiveNumber(printerConfig?.resolutionYDpi) ??
    DEFAULT_DPI;
  const dpiY =
    toPositiveNumber(printerConfig?.resolutionYDpi) ??
    toPositiveNumber(printerConfig?.resolutionXDpi) ??
    DEFAULT_DPI;

  return {
    dpiX,
    dpiY,
    heightDots: Math.max(1, mmToDots(pageHeightMm, dpiY)),
    pageHeightMm,
    pageWidthMm,
    widthDots: Math.max(1, mmToDots(pageWidthMm, dpiX)),
  };
}

export function resolvePrinterCapabilityProfile(params: {
  barcodeSpec?: BarcodeSpec;
  layoutSpec?: LabelLayoutSpec;
  printerConfig?: LabelPrinterConfig | null;
  printerName?: string | null;
}): PrinterCapabilityProfile {
  const barcode = params.barcodeSpec ?? DEFAULT_LABEL_BARCODE_SPEC;
  const layout = params.layoutSpec ?? DEFAULT_LABEL_LAYOUT_SPEC;
  const geometry = resolveLabelGeometry(params.printerConfig, layout);
  const normalizedPrinterName = String(params.printerName ?? '').trim();
  const isZebra = /zebra|zdesigner/i.test(normalizedPrinterName);
  const hasExplicitMediaSize =
    toPositiveNumber(params.printerConfig?.mediaWidthMm) != null &&
    toPositiveNumber(params.printerConfig?.mediaHeightMm) != null;
  const hasExplicitDpi =
    toPositiveNumber(params.printerConfig?.resolutionXDpi) != null ||
    toPositiveNumber(params.printerConfig?.resolutionYDpi) != null;

  return {
    ...geometry,
    barcode,
    dpiClass:
      geometry.dpiX >= 300 || geometry.dpiY >= 300 ? '300dpi_or_higher' : '203dpi_class',
    hasExplicitDpi,
    hasExplicitMediaSize,
    isZebra,
    layout,
    preferRawZpl: isZebra,
    printerName: normalizedPrinterName || null,
    supportsRawZpl: isZebra,
    textRendering: 'native_zpl_with_raster_fallback',
  };
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function toPositiveNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
