import type { DepartmentDto, OrderDto } from '../api/client';
import html2canvas from 'html2canvas';
import arabicBoldFontUrl from '../assets/fonts/NotoSansArabic-Bold.ttf';
import arabicRegularFontUrl from '../assets/fonts/NotoSansArabic-Regular.ttf';
import {
  buildSampleLabelViewModels,
  type LabelSequenceBy,
  type SampleLabelViewModel,
} from './label-view-model';
import {
  DEFAULT_LABEL_BARCODE_SPEC,
  DEFAULT_LABEL_LAYOUT_SPEC,
  getCode128QuietZoneDots,
  mmToDots,
  resolveLabelGeometry,
  type LabelPrinterConfig as ZebraLabelPrinterConfig,
  type ZebraLabelGeometry,
} from './label-printing-spec';
import { fitSingleLineFontSize } from './label-text-fit';

const TEXT_THRESHOLD = 232;
const ARABIC_TEXT_THRESHOLD = 246;
const TEXT_RENDER_SCALE = 4;
const EMBEDDED_ARABIC_FONT_FAMILY = 'LIS Noto Sans Arabic';
const EMBEDDED_ARABIC_FONT_STACK = `"${EMBEDDED_ARABIC_FONT_FAMILY}", "Noto Sans Arabic", "Noto Naskh Arabic", Tahoma, "Segoe UI", Arial, sans-serif`;
const DEFAULT_CANVAS_FONT_STACK = 'Tahoma, Arial, sans-serif';

type TextAlignMode = 'center' | 'end' | 'start';

type TextGraphicOptions = {
  align?: TextAlignMode;
  fontSize: number;
  fontWeight?: number;
  height: number;
  lineHeight?: number;
  maxLines?: number;
  minFontSize?: number;
  rotation?: 0 | 90 | 180 | 270;
  shrinkToFitWidth?: boolean;
  text: string;
  width: number;
};

type GfaGraphic = {
  height: number;
  hex: string;
  rowBytes: number;
  totalBytes: number;
  width: number;
};

const textGraphicCache = new Map<string, GfaGraphic>();
const textGraphicInFlightCache = new Map<string, Promise<GfaGraphic>>();
const compositeLayerGraphicCache = new Map<string, GfaGraphic>();
const compositeLayerGraphicInFlightCache = new Map<string, Promise<GfaGraphic>>();

type LayoutMetrics = {
  barcodeBoxWidth: number;
  barcodeHeight: number;
  barcodeTextHeight: number;
  barcodeTextY: number;
  barcodeX: number;
  barcodeY: number;
  borderThickness: number;
  headerBottomY: number;
  headerGap: number;
  leftStripWidth: number;
  nameHeight: number;
  nameSexDividerX: number;
  nameWidth: number;
  paddingX: number;
  paddingY: number;
  patientIdX: number;
  rightStripWidth: number;
  sexHeight: number;
  sexWidth: number;
  sexX: number;
  sequenceMainWidth: number;
  sequenceMetaWidth: number;
  sequenceMetaX: number;
  sequenceX: number;
  testHeight: number;
  testY: number;
  textLeftX: number;
  topRowHeight: number;
};

type CompositeRasterLabelLayerParams = {
  geometry: ZebraLabelGeometry;
  label: SampleLabelViewModel;
  layout: LayoutMetrics;
  patientIdText: string;
  patientIdTopOffset: number;
  patientNameText: string;
  nameTopOffset: number;
  registeredAtText: string;
  sequenceText: string;
  sexText: string;
  sexTopOffset: number;
  testCodesText: string;
};

export type { ZebraLabelPrinterConfig, ZebraLabelGeometry };

export async function generateZebraLabelZpl(params: {
  departments?: DepartmentDto[];
  labelSequenceBy?: LabelSequenceBy;
  order: OrderDto;
  printerConfig?: ZebraLabelPrinterConfig | null;
}): Promise<string> {
  const geometry = resolveZebraLabelGeometry(params.printerConfig);
  const labels = buildSampleLabelViewModels(params.order, {
    departments: params.departments,
    labelSequenceBy: params.labelSequenceBy,
  });

  const documents = await Promise.all(labels.map((label) => buildZplDocument(label, geometry)));
  return documents.join('\n');
}

export function resolveZebraLabelGeometry(
  printerConfig?: ZebraLabelPrinterConfig | null,
): ZebraLabelGeometry {
  return resolveLabelGeometry(printerConfig, DEFAULT_LABEL_LAYOUT_SPEC);
}

export function clearLabelGraphicCache(): void {
  textGraphicCache.clear();
  textGraphicInFlightCache.clear();
  compositeLayerGraphicCache.clear();
  compositeLayerGraphicInFlightCache.clear();
}

async function buildZplDocument(
  label: SampleLabelViewModel,
  geometry: ZebraLabelGeometry,
): Promise<string> {
  const layout = computeLayout(geometry);
  const patientNameText = collapseWhitespace(label.patientName) || '-';
  const testCodesText = collapseWhitespace(label.testCodes);
  const sequenceText = label.sequenceLabel || '-';
  const registeredAtText = label.registeredAtLabel || '-';
  const patientIdText = label.patientGlobalId || '-';
  const sexText = collapseWhitespace(label.sexLabel) || '-';
  const patientNameFontSize = Math.max(15, Math.round(geometry.heightDots * 0.098));
  const patientNameMinFontSize = Math.max(11, Math.round(patientNameFontSize * 0.72));
  const patientNameShouldRenderGraphic = true;
  const useEnglishVerticalTweaks = !containsArabic(`${patientNameText} ${sexText}`);
  const englishDownShiftDots = useEnglishVerticalTweaks
    ? Math.max(1, mmToDots(0.3, geometry.dpiY))
    : 0;
  const englishUpShiftDots = useEnglishVerticalTweaks
    ? Math.max(1, mmToDots(0.25, geometry.dpiY))
    : 0;

  if (requiresCompositeRasterLabelLayer([
    patientNameText,
    registeredAtText,
    testCodesText,
    sequenceText,
    patientIdText,
    sexText,
  ])) {
    try {
      return await buildCompositeRasterLabelDocument({
        geometry,
        label,
        layout,
        patientIdText,
        patientNameText,
        registeredAtText,
        sequenceText,
        sexText,
        testCodesText,
        patientIdTopOffset: -englishUpShiftDots,
        nameTopOffset: englishDownShiftDots,
        sexTopOffset: englishDownShiftDots,
      });
    } catch {
      // Fall back to field-by-field text graphics if the composite DOM layer fails.
    }
  }

  const [
    patientNameGraphic,
    registeredAtGraphic,
    testCodesGraphic,
    sequenceGraphic,
    patientIdGraphic,
  ] = await Promise.all([
    patientNameShouldRenderGraphic
      ? cachedRenderTextGraphic({
        align: 'start',
        fontSize: patientNameFontSize,
        fontWeight: 700,
        height: layout.nameHeight,
        minFontSize: patientNameMinFontSize,
        shrinkToFitWidth: true,
        text: patientNameText,
        width: layout.nameWidth,
      })
      : Promise.resolve(null),
    cachedRenderTextGraphic({
      align: 'center',
      fontSize: Math.max(11, Math.round(geometry.heightDots * 0.062)),
      fontWeight: 600,
      height: geometry.heightDots - (layout.borderThickness * 2),
      rotation: 270,
      text: registeredAtText,
      width: layout.sequenceMetaWidth,
    }),
    testCodesText
      ? cachedRenderTextGraphic({
        align: 'center',
        fontSize: Math.max(11, Math.round(geometry.heightDots * 0.066)),
        fontWeight: 700,
        height: layout.testHeight,
        lineHeight: 1.05,
        maxLines: 2,
        text: testCodesText,
        width: layout.barcodeBoxWidth,
      })
      : Promise.resolve(null),
    cachedRenderTextGraphic({
      align: 'center',
      fontSize: Math.max(13, Math.round(geometry.heightDots * 0.076)),
      fontWeight: 700,
      height: geometry.heightDots - (layout.borderThickness * 2),
      rotation: 270,
      text: sequenceText,
      width: layout.sequenceMainWidth,
    }),
    needsRasterText(patientIdText)
      ? cachedRenderTextGraphic({
        align: 'center',
        fontSize: Math.max(14, Math.round(geometry.heightDots * 0.078)),
        fontWeight: 700,
        height: geometry.heightDots - (layout.borderThickness * 2),
        rotation: 270,
        text: patientIdText,
        width: layout.rightStripWidth - (layout.borderThickness * 2),
      })
      : Promise.resolve(null),
  ]);

  const moduleWidth = pickCode128ModuleWidth(
    label.barcodeValue,
    layout.barcodeBoxWidth,
    geometry.dpiX,
  );
  const estimatedBarcodeWidth = estimateCode128Width(label.barcodeValue, moduleWidth);
  const quietZoneDots = getCode128QuietZoneDots(
    moduleWidth,
    geometry.dpiX,
    DEFAULT_LABEL_BARCODE_SPEC,
  );
  const centeredBarcodeX = layout.barcodeX + Math.max(
    quietZoneDots,
    Math.floor((layout.barcodeBoxWidth - estimatedBarcodeWidth) / 2),
  );

  const lines = [
    '^XA',
    `^PW${geometry.widthDots}`,
    `^LL${geometry.heightDots}`,
    '^LH0,0',
    '^LT0',

    // Left Strip (Sequence)
    graphicToZpl(layout.sequenceX, layout.borderThickness, sequenceGraphic),
    graphicToZpl(layout.sequenceMetaX, layout.borderThickness, registeredAtGraphic),

    // Right Strip (Patient ID)
    patientIdGraphic
      ? graphicToZpl(
        layout.patientIdX,
        Math.max(0, layout.borderThickness - englishUpShiftDots),
        patientIdGraphic,
      )
      : nativeTextField({
        align: 'C',
        fontHeight: Math.max(19, Math.round(geometry.heightDots * 0.086)),
        fontWidth: Math.max(15, Math.round(geometry.heightDots * 0.074)),
        orientation: 'R',
        text: patientIdText,
        width: geometry.heightDots,
        x: layout.patientIdX + Math.round(layout.rightStripWidth / 2) - 6,
        y: Math.max(0, layout.borderThickness - englishUpShiftDots),
      }),

    // Patient Name
    patientNameGraphic
      ? graphicToZpl(
        layout.textLeftX,
        layout.paddingY + englishDownShiftDots,
        patientNameGraphic,
      )
      : nativeTextField({
        align: 'L',
        fontHeight: Math.max(19, Math.round(geometry.heightDots * 0.122)),
        fontWidth: Math.max(15, Math.round(geometry.heightDots * 0.094)),
        text: patientNameText,
        width: layout.nameWidth,
        x: layout.textLeftX,
        y: Math.max(0, layout.paddingY - 1 + englishDownShiftDots),
      }),

    // Sex
    nativeTextField({
      align: 'C',
      fontHeight: Math.max(18, Math.round(geometry.heightDots * 0.11)),
      fontWidth: Math.max(14, Math.round(geometry.heightDots * 0.085)),
      text: sexText,
      width: layout.sexWidth,
      x: layout.sexX,
      y: Math.max(0, layout.paddingY + englishDownShiftDots),
    }),

    // Barcode
    `^BY${moduleWidth},2,${layout.barcodeHeight}`,
    `^FO${centeredBarcodeX},${layout.barcodeY}^BCN,${layout.barcodeHeight},N,N,N^FD${sanitizeBarcodeValue(label.barcodeValue)}^FS`,

    // Barcode Text
    nativeTextField({
      align: 'C',
      fontHeight: Math.max(12, Math.round(geometry.heightDots * 0.07)),
      fontWidth: Math.max(10, Math.round(geometry.heightDots * 0.055)),
      text: label.barcodeText,
      width: layout.barcodeBoxWidth,
      x: layout.barcodeX,
      y: layout.barcodeTextY,
    }),

    // Test Codes
    testCodesGraphic
      ? graphicToZpl(layout.barcodeX, layout.testY, testCodesGraphic)
      : nativeTextField({
        align: 'C',
        fontHeight: Math.max(12, Math.round(geometry.heightDots * 0.07)),
        fontWidth: Math.max(10, Math.round(geometry.heightDots * 0.058)),
        lineSpacing: 0,
        maxLines: 2,
        text: testCodesText,
        width: layout.barcodeBoxWidth,
        x: layout.barcodeX,
        y: layout.testY + Math.max(0, Math.round(layout.testHeight * 0.08)),
      }),
    '^XZ',
  ];

  return lines.filter(Boolean).join('\n');
}

async function buildCompositeRasterLabelDocument(
  params: CompositeRasterLabelLayerParams,
): Promise<string> {
  const textLayerGraphic = await renderCompositeRasterLabelLayer(params);
  const moduleWidth = pickCode128ModuleWidth(
    params.label.barcodeValue,
    params.layout.barcodeBoxWidth,
    params.geometry.dpiX,
  );
  const estimatedBarcodeWidth = estimateCode128Width(params.label.barcodeValue, moduleWidth);
  const quietZoneDots = getCode128QuietZoneDots(
    moduleWidth,
    params.geometry.dpiX,
    DEFAULT_LABEL_BARCODE_SPEC,
  );
  const centeredBarcodeX = params.layout.barcodeX + Math.max(
    quietZoneDots,
    Math.floor((params.layout.barcodeBoxWidth - estimatedBarcodeWidth) / 2),
  );

  return [
    '^XA',
    `^PW${params.geometry.widthDots}`,
    `^LL${params.geometry.heightDots}`,
    '^LH0,0',
    '^LT0',
    graphicToZpl(0, 0, textLayerGraphic),
    `^BY${moduleWidth},2,${params.layout.barcodeHeight}`,
    `^FO${centeredBarcodeX},${params.layout.barcodeY}^BCN,${params.layout.barcodeHeight},N,N,N^FD${sanitizeBarcodeValue(params.label.barcodeValue)}^FS`,
    '^XZ',
  ].join('\n');
}

async function renderCompositeRasterLabelLayer(
  params: CompositeRasterLabelLayerParams,
): Promise<GfaGraphic> {
  const cacheKey = buildCompositeLayerCacheKey(params);
  const cached = compositeLayerGraphicCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = compositeLayerGraphicInFlightCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = renderCompositeRasterLabelLayerUncached(params)
    .then((graphic) => {
      compositeLayerGraphicCache.set(cacheKey, graphic);
      return graphic;
    })
    .catch((error) => {
      compositeLayerGraphicCache.delete(cacheKey);
      throw error;
    })
    .finally(() => {
      compositeLayerGraphicInFlightCache.delete(cacheKey);
    });
  compositeLayerGraphicInFlightCache.set(cacheKey, promise);
  return promise;
}

async function renderCompositeRasterLabelLayerUncached(
  params: CompositeRasterLabelLayerParams,
): Promise<GfaGraphic> {
  const allText = [
    params.patientNameText,
    params.sexText,
    params.sequenceText,
    params.registeredAtText,
    params.patientIdText,
    params.label.barcodeText,
    params.testCodesText,
  ].filter(Boolean).join(' ');
  const lineWidth = Math.max(1, params.layout.borderThickness);
  const root = document.createElement('div');
  const host = document.createElement('div');

  await ensureBrowserFontsReady(allText);

  applyInlineStyles(host, {
    background: '#ffffff',
    height: `${params.geometry.heightDots}px`,
    left: '-100000px',
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'fixed',
    top: '0',
    width: `${params.geometry.widthDots}px`,
    zIndex: '-1',
  });
  applyInlineStyles(root, {
    background: '#ffffff',
    boxSizing: 'border-box',
    height: `${params.geometry.heightDots}px`,
    overflow: 'hidden',
    position: 'relative',
    width: `${params.geometry.widthDots}px`,
  });

  appendTextBox(root, {
    align: 'center',
    fontFamily: getCanvasFontFamily(params.sequenceText),
    fontSize: Math.max(14, Math.round(params.geometry.heightDots * 0.08)),
    fontWeight: 700,
    height: params.geometry.heightDots - (lineWidth * 2),
    left: lineWidth,
    rotateVertical: true,
    text: params.sequenceText,
    top: lineWidth,
    width: params.layout.sequenceMainWidth,
  });
  appendTextBox(root, {
    align: 'center',
    fontFamily: DEFAULT_CANVAS_FONT_STACK,
    fontSize: Math.max(11, Math.round(params.geometry.heightDots * 0.062)),
    fontWeight: 600,
    height: params.geometry.heightDots - (lineWidth * 2),
    left: params.layout.sequenceMetaX,
    rotateVertical: true,
    text: params.registeredAtText,
    top: lineWidth,
    width: params.layout.sequenceMetaWidth,
  });
  appendTextBox(root, {
    align: 'center',
    fontFamily: getCanvasFontFamily(params.patientIdText),
    fontSize: Math.max(15, Math.round(params.geometry.heightDots * 0.08)),
    fontWeight: 600,
    height: params.geometry.heightDots - (lineWidth * 2),
    left: params.geometry.widthDots - params.layout.rightStripWidth + lineWidth,
    rotateVertical: true,
    text: params.patientIdText,
    top: Math.max(0, lineWidth + params.patientIdTopOffset),
    width: params.layout.rightStripWidth - (lineWidth * 2),
  });
  appendTextBox(root, {
    align: 'start',
    autoShrinkToFit: true,
    fontFamily: getCanvasFontFamily(params.patientNameText),
    fontSize: Math.max(19, Math.round(params.geometry.heightDots * 0.122)),
    fontWeight: 700,
    height: params.layout.nameHeight,
    left: params.layout.textLeftX,
    minFontSize: Math.max(11, Math.round(Math.max(19, Math.round(params.geometry.heightDots * 0.122)) * 0.72)),
    text: params.patientNameText,
    top: Math.max(0, params.layout.paddingY - 1 + params.nameTopOffset),
    width: params.layout.nameWidth,
  });
  appendTextBox(root, {
    align: 'center',
    fontFamily: getCanvasFontFamily(params.sexText),
    fontSize: Math.max(18, Math.round(params.geometry.heightDots * 0.11)),
    fontWeight: 600,
    height: params.layout.sexHeight,
    left: params.layout.sexX,
    text: params.sexText,
    top: Math.max(0, params.layout.paddingY + params.sexTopOffset),
    width: params.layout.sexWidth,
  });
  appendTextBox(root, {
    align: 'center',
    fontFamily: DEFAULT_CANVAS_FONT_STACK,
    fontSize: Math.max(12, Math.round(params.geometry.heightDots * 0.07)),
    fontWeight: 700,
    height: params.layout.barcodeTextHeight,
    left: params.layout.barcodeX,
    text: params.label.barcodeText,
    top: params.layout.barcodeTextY,
    width: params.layout.barcodeBoxWidth,
  });
  appendTextBox(root, {
    align: 'center',
    fontFamily: getCanvasFontFamily(params.testCodesText),
    fontSize: Math.max(11, Math.round(params.geometry.heightDots * 0.066)),
    fontWeight: 700,
    height: params.layout.testHeight,
    lineHeight: 1.05,
    left: params.layout.barcodeX,
    maxLines: 2,
    text: params.testCodesText,
    top: params.layout.testY + Math.max(0, Math.round(params.layout.testHeight * 0.08)),
    width: params.layout.barcodeBoxWidth,
  });

  host.appendChild(root);
  document.body.appendChild(host);
  try {
    const sourceCanvas = await html2canvas(root, {
      backgroundColor: '#ffffff',
      logging: false,
      scale: TEXT_RENDER_SCALE,
      useCORS: true,
    });
    const targetCanvas = createCanvas(params.geometry.widthDots, params.geometry.heightDots);
    const targetContext = targetCanvas.getContext('2d', { willReadFrequently: true });
    if (!targetContext) {
      throw new Error('Unable to create a target canvas for the Zebra text layer.');
    }

    const emphasizesArabicStrokes = containsArabic(allText);
    targetContext.fillStyle = '#ffffff';
    targetContext.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetContext.imageSmoothingEnabled = !emphasizesArabicStrokes;
    targetContext.imageSmoothingQuality = emphasizesArabicStrokes ? 'medium' : 'high';
    targetContext.drawImage(
      sourceCanvas,
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height,
      0,
      0,
      targetCanvas.width,
      targetCanvas.height,
    );

    thresholdCanvas(
      targetCanvas,
      emphasizesArabicStrokes ? ARABIC_TEXT_THRESHOLD : TEXT_THRESHOLD,
    );
    return canvasToGfa(targetCanvas);
  } finally {
    host.remove();
  }
}

function requiresCompositeRasterLabelLayer(values: string[]): boolean {
  return values.some((value) => needsRasterText(value));
}

function appendTextBox(
  parent: HTMLElement,
  options: {
    align: TextAlignMode;
    autoShrinkToFit?: boolean;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    height: number;
    lineHeight?: number;
    left: number;
    maxLines?: number;
    minFontSize?: number;
    rotateVertical?: boolean;
    text: string;
    top: number;
    width: number;
  },
): void {
  const box = document.createElement('div');
  const content = document.createElement('div');
  const normalizedText = collapseWhitespace(options.text);
  const isRtl = containsArabic(normalizedText);
  const horizontalPadding = Math.max(1, Math.round(options.width * 0.025));
  const maxLines = Math.max(1, options.maxLines ?? 1);
  const isMultiline = !options.rotateVertical && maxLines > 1;
  const lineHeight = options.lineHeight ?? 1.05;
  const textAlign = resolveCssTextAlign(options.align, isRtl);
  const fittedFontSize = options.autoShrinkToFit && !options.rotateVertical && maxLines === 1
    ? fitSingleLineFontSize({
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
      fontWeight: options.fontWeight,
      maxWidth: Math.max(1, options.width - (horizontalPadding * 2)),
      minFontSize: options.minFontSize ?? Math.max(8, options.fontSize * 0.72),
      text: normalizedText,
    })
    : options.fontSize;

  applyInlineStyles(box, {
    height: `${Math.max(1, options.height)}px`,
    left: `${Math.max(0, options.left)}px`,
    overflow: 'hidden',
    position: 'absolute',
    top: `${Math.max(0, options.top)}px`,
    width: `${Math.max(1, options.width)}px`,
  });
  applyInlineStyles(content, {
    boxSizing: 'border-box',
    color: '#000000',
    direction: isRtl ? 'rtl' : 'ltr',
    display: isMultiline ? '-webkit-box' : 'flex',
    fontFamily: options.fontFamily,
    fontSize: `${Math.max(8, fittedFontSize)}px`,
    fontWeight: String(options.fontWeight),
    height: '100%',
    justifyContent: isMultiline ? 'initial' : resolveCssJustifyContent(options.align, isRtl),
    lineHeight: String(lineHeight),
    overflow: 'hidden',
    padding: options.rotateVertical ? '1px 0' : `0 ${horizontalPadding}px`,
    textAlign,
    textOverflow: isMultiline ? 'clip' : 'ellipsis',
    textRendering: 'optimizeLegibility',
    unicodeBidi: 'plaintext',
    whiteSpace: isMultiline ? 'normal' : 'nowrap',
    width: '100%',
  });
  if (!isMultiline) {
    applyInlineStyles(content, {
      alignItems: 'center',
    });
  } else {
    applyInlineStyles(content, {
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: String(maxLines),
      overflowWrap: 'anywhere',
    });
  }

  if (options.rotateVertical) {
    applyInlineStyles(content, {
      height: `${Math.max(1, options.width)}px`,
      justifyContent: 'center',
      left: '50%',
      padding: `0 ${Math.max(1, Math.round(options.width * 0.06))}px`,
      position: 'absolute',
      top: '50%',
      textAlign: 'center',
      transform: 'translate(-50%, -50%) rotate(-90deg)',
      transformOrigin: 'center center',
      whiteSpace: 'nowrap',
      width: `${Math.max(1, options.height)}px`,
    });
  }

  content.textContent = normalizedText || '-';
  box.appendChild(content);
  parent.appendChild(box);
}

function applyInlineStyles(
  element: HTMLElement,
  styles: Record<string, string>,
): void {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(
      property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`),
      value,
    );
  }
}

function computeLayout(geometry: ZebraLabelGeometry): LayoutMetrics {
  const { dpiX, dpiY, heightDots, widthDots } = geometry;
  const layoutSpec = DEFAULT_LABEL_LAYOUT_SPEC;
  const borderThickness = Math.max(
    1,
    Math.round(Math.min(widthDots, heightDots) * layoutSpec.borderThicknessRatio),
  );
  const leftStripWidth = Math.max(
    borderThickness * 2 + 8,
    mmToDots(layoutSpec.leftStripWidthMm, dpiX),
  );
  const rightStripWidth = Math.max(
    borderThickness * 2 + 6,
    mmToDots(layoutSpec.rightStripWidthMm, dpiX),
  );
  const paddingX = Math.max(3, mmToDots(layoutSpec.paddingXmm, dpiX));
  const paddingY = Math.max(2, mmToDots(layoutSpec.paddingYmm, dpiY));
  const topRowHeight = Math.max(
    16,
    mmToDots(layoutSpec.headerHeightMm, dpiY),
  );
  const innerLeftMargin = Math.max(
    2,
    mmToDots(layoutSpec.innerLeftMarginMm, dpiX),
  );
  const availableMainWidth = Math.max(
    80,
    widthDots - leftStripWidth - rightStripWidth - (borderThickness * 2),
  );
  const textLeftX = leftStripWidth + borderThickness + innerLeftMargin + paddingX;
  const contentWidth = Math.max(60, availableMainWidth - innerLeftMargin - (paddingX * 2));
  const leftStripInnerWidth = Math.max(14, leftStripWidth - (borderThickness * 2));
  const sequenceMetaWidth = Math.max(
    10,
    Math.round(leftStripInnerWidth * layoutSpec.leftStripMetaWidthRatio),
  );
  const sequenceMainWidth = Math.max(12, leftStripInnerWidth - sequenceMetaWidth);
  const headerGap = Math.max(
    4,
    mmToDots(layoutSpec.nameSexGapMm, dpiX),
  );
  const sexWidth = Math.max(20, Math.round(contentWidth * layoutSpec.sexWidthRatio));
  const nameWidth = Math.max(32, contentWidth - sexWidth - headerGap);
  const barcodeX = textLeftX;
  const barcodeBoxWidth = contentWidth;
  const barcodeGap = Math.max(
    3,
    mmToDots(layoutSpec.bodyTopGapMm, dpiY),
  );
  const barcodeTextGap = Math.max(
    0,
    mmToDots(layoutSpec.barcodeTextGapMm, dpiY),
  );
  const barcodeHeight = Math.max(
    28,
    mmToDots(DEFAULT_LABEL_BARCODE_SPEC.heightMm, dpiY),
  );
  const barcodeTextHeight = Math.max(
    10,
    mmToDots(DEFAULT_LABEL_BARCODE_SPEC.textHeightMm, dpiY),
  );
  const testHeight = Math.max(
    12,
    mmToDots(layoutSpec.testRowHeightMm, dpiY),
  );
  const testY = heightDots - borderThickness - paddingY - testHeight;
  const barcodeY = paddingY + topRowHeight + barcodeGap;
  const barcodeTextY = Math.min(
    testY - barcodeTextHeight,
    barcodeY + barcodeHeight + barcodeTextGap,
  );

  return {
    barcodeBoxWidth,
    barcodeHeight,
    barcodeTextHeight,
    barcodeTextY,
    barcodeX,
    barcodeY,
    borderThickness,
    headerBottomY: paddingY + topRowHeight,
    headerGap,
    leftStripWidth,
    nameHeight: topRowHeight,
    nameSexDividerX: textLeftX + nameWidth + Math.max(1, Math.floor(headerGap / 2)),
    nameWidth,
    paddingX,
    paddingY,
    patientIdX: widthDots - rightStripWidth + borderThickness,
    rightStripWidth,
    sequenceMainWidth,
    sequenceMetaWidth,
    sequenceMetaX: borderThickness + sequenceMainWidth,
    sequenceX: borderThickness,
    sexHeight: topRowHeight,
    sexWidth,
    sexX: textLeftX + nameWidth + headerGap,
    testHeight,
    testY,
    textLeftX,
    topRowHeight,
  };
}

function buildTextGraphicCacheKey(options: TextGraphicOptions): string {
  return JSON.stringify({
    align: options.align ?? 'start',
    fontSize: options.fontSize,
    fontWeight: options.fontWeight ?? 400,
    height: Math.floor(options.height),
    lineHeight: options.lineHeight ?? 1,
    maxLines: options.maxLines ?? 1,
    minFontSize: options.minFontSize ?? null,
    rotation: options.rotation ?? 0,
    shrinkToFitWidth: options.shrinkToFitWidth ?? false,
    text: collapseWhitespace(options.text),
    width: Math.floor(options.width),
  });
}

function buildCompositeLayerCacheKey(params: CompositeRasterLabelLayerParams): string {
  return JSON.stringify({
    geometry: {
      dpiX: params.geometry.dpiX,
      dpiY: params.geometry.dpiY,
      heightDots: params.geometry.heightDots,
      widthDots: params.geometry.widthDots,
    },
    layout: params.layout,
    offsets: {
      nameTopOffset: params.nameTopOffset,
      patientIdTopOffset: params.patientIdTopOffset,
      sexTopOffset: params.sexTopOffset,
    },
    text: {
      barcodeText: collapseWhitespace(params.label.barcodeText),
      patientIdText: collapseWhitespace(params.patientIdText),
      patientNameText: collapseWhitespace(params.patientNameText),
      registeredAtText: collapseWhitespace(params.registeredAtText),
      sequenceText: collapseWhitespace(params.sequenceText),
      sexText: collapseWhitespace(params.sexText),
      testCodesText: collapseWhitespace(params.testCodesText),
    },
  });
}

async function cachedRenderTextGraphic(options: TextGraphicOptions): Promise<GfaGraphic> {
  const cacheKey = buildTextGraphicCacheKey(options);
  const cached = textGraphicCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = textGraphicInFlightCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = renderTextGraphic(options)
    .then((graphic) => {
      textGraphicCache.set(cacheKey, graphic);
      return graphic;
    })
    .catch((error) => {
      textGraphicCache.delete(cacheKey);
      throw error;
    })
    .finally(() => {
      textGraphicInFlightCache.delete(cacheKey);
    });
  textGraphicInFlightCache.set(cacheKey, promise);
  return promise;
}

async function renderTextGraphic(options: TextGraphicOptions): Promise<GfaGraphic> {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const rotation = options.rotation ?? 0;
  const emphasizesArabicStrokes = containsArabic(options.text);
  const baseSourceWidth = rotation === 90 || rotation === 270 ? height : width;
  const baseSourceHeight = rotation === 90 || rotation === 270 ? width : height;
  const sourceWidth = baseSourceWidth * TEXT_RENDER_SCALE;
  const sourceHeight = baseSourceHeight * TEXT_RENDER_SCALE;
  const sourceCanvas = createCanvas(sourceWidth, sourceHeight);
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error('Unable to create a canvas context for Zebra label rendering.');
  }

  sourceContext.fillStyle = '#ffffff';
  sourceContext.fillRect(0, 0, sourceWidth, sourceHeight);
  const textOptions = {
    align: options.align ?? 'start',
    fontSize: options.fontSize * TEXT_RENDER_SCALE,
    fontWeight: options.fontWeight ?? 400,
    height: sourceHeight,
    lineHeight: options.lineHeight ?? 1,
    maxLines: options.maxLines ?? 1,
    minFontSize: options.minFontSize ? options.minFontSize * TEXT_RENDER_SCALE : undefined,
    shrinkToFitWidth: options.shrinkToFitWidth ?? false,
    text: options.text,
    width: sourceWidth,
  } as const;
  if (requiresBrowserTextLayout(options.text)) {
    await ensureBrowserFontsReady(options.text);
    try {
      await drawDomTextToCanvas(sourceContext, textOptions);
    } catch {
      try {
        await drawSvgTextToCanvas(sourceContext, textOptions);
      } catch {
        drawTextToFit(sourceContext, textOptions);
      }
    }
  } else {
    drawTextToFit(sourceContext, textOptions);
  }

  const targetCanvas = createCanvas(width, height);
  const targetContext = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!targetContext) {
    throw new Error('Unable to create a target canvas context for Zebra label rendering.');
  }

  targetContext.fillStyle = '#ffffff';
  targetContext.fillRect(0, 0, width, height);
  targetContext.imageSmoothingEnabled = !emphasizesArabicStrokes;
  targetContext.imageSmoothingQuality = emphasizesArabicStrokes ? 'medium' : 'high';
  switch (rotation) {
    case 90:
      targetContext.translate(width, 0);
      targetContext.rotate(Math.PI / 2);
      break;
    case 180:
      targetContext.translate(width, height);
      targetContext.rotate(Math.PI);
      break;
    case 270:
      targetContext.translate(0, height);
      targetContext.rotate(-Math.PI / 2);
      break;
    default:
      break;
  }
  targetContext.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
    0,
    0,
    baseSourceWidth,
    baseSourceHeight,
  );

  thresholdCanvas(
    targetCanvas,
    emphasizesArabicStrokes ? ARABIC_TEXT_THRESHOLD : TEXT_THRESHOLD,
  );
  if (emphasizesArabicStrokes) {
    dilateBinaryCanvas(targetCanvas);
  }
  return canvasToGfa(targetCanvas);
}

async function drawSvgTextToCanvas(
  context: CanvasRenderingContext2D,
  options: {
    align: TextAlignMode;
    fontSize: number;
    fontWeight: number;
    height: number;
    lineHeight?: number;
    maxLines?: number;
    minFontSize?: number;
    shrinkToFitWidth?: boolean;
    text: string;
    width: number;
  },
): Promise<void> {
  const normalizedText = collapseWhitespace(options.text);
  if (!normalizedText) {
    return;
  }

  await ensureBrowserFontsReady(normalizedText);

  const isRtl = containsArabic(normalizedText);
  const justifyContent = options.align === 'center'
    ? 'center'
    : options.align === 'end'
      ? isRtl ? 'flex-start' : 'flex-end'
      : isRtl ? 'flex-end' : 'flex-start';
  const direction = isRtl ? 'rtl' : 'ltr';
  const horizontalPadding = Math.max(1, Math.round(options.width * 0.025));
  const maxLines = Math.max(1, options.maxLines ?? 1);
  const isMultiline = maxLines > 1;
  const lineHeight = options.lineHeight ?? 1.05;
  const textAlign = resolveCssTextAlign(options.align, isRtl);
  const fittedFontSize = options.shrinkToFitWidth && maxLines === 1
    ? fitSingleLineFontSize({
      fontFamily: getCanvasFontFamily(normalizedText),
      fontSize: options.fontSize,
      fontWeight: options.fontWeight,
      maxWidth: Math.max(1, options.width - (horizontalPadding * 2)),
      minFontSize: options.minFontSize ?? Math.max(8, options.fontSize * 0.72),
      text: normalizedText,
    })
    : options.fontSize;
  const html = [
    `<div xmlns="http://www.w3.org/1999/xhtml" style="`,
    `width:${options.width}px;`,
    `height:${options.height}px;`,
    isMultiline ? 'display:-webkit-box;' : 'display:flex;',
    isMultiline ? '' : 'align-items:center;',
    isMultiline ? '' : `justify-content:${justifyContent};`,
    `padding:0 ${horizontalPadding}px;`,
    `font:${options.fontWeight} ${Math.max(8, fittedFontSize)}px ${getCanvasFontFamily(normalizedText)};`,
    `line-height:${lineHeight};`,
    'color:#000;',
    'background:#fff;',
    isMultiline ? 'white-space:normal;' : 'white-space:nowrap;',
    'overflow:hidden;',
    isMultiline ? 'overflow-wrap:anywhere;' : '',
    isMultiline ? `-webkit-line-clamp:${maxLines};` : 'text-overflow:ellipsis;',
    isMultiline ? '-webkit-box-orient:vertical;' : '',
    `direction:${direction};`,
    `text-align:${textAlign};`,
    'unicode-bidi:plaintext;',
    'text-rendering:optimizeLegibility;',
    'font-kerning:normal;',
    'margin:0;',
    'box-sizing:border-box;',
    '">',
    escapeHtml(normalizedText),
    '</div>',
  ].join('');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    `<foreignObject x="0" y="0" width="${options.width}" height="${options.height}">`,
    html,
    '</foreignObject>',
    '</svg>',
  ].join('');
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(dataUrl);
  context.drawImage(image, 0, 0);
}

async function drawDomTextToCanvas(
  context: CanvasRenderingContext2D,
  options: {
    align: TextAlignMode;
    fontSize: number;
    fontWeight: number;
    height: number;
    lineHeight?: number;
    maxLines?: number;
    minFontSize?: number;
    shrinkToFitWidth?: boolean;
    text: string;
    width: number;
  },
): Promise<void> {
  const normalizedText = collapseWhitespace(options.text);
  if (!normalizedText) {
    return;
  }

  await ensureBrowserFontsReady(normalizedText);

  const host = document.createElement('div');
  const content = document.createElement('div');
  const isRtl = containsArabic(normalizedText);
  const horizontalPadding = Math.max(1, Math.round(options.width * 0.025));
  const maxLines = Math.max(1, options.maxLines ?? 1);
  const isMultiline = maxLines > 1;
  const lineHeight = options.lineHeight ?? 1.05;
  const textAlign = resolveCssTextAlign(options.align, isRtl);
  const fittedFontSize = options.shrinkToFitWidth && maxLines === 1
    ? fitSingleLineFontSize({
      fontFamily: getCanvasFontFamily(normalizedText),
      fontSize: options.fontSize,
      fontWeight: options.fontWeight,
      maxWidth: Math.max(1, options.width - (horizontalPadding * 2)),
      minFontSize: options.minFontSize ?? Math.max(8, options.fontSize * 0.72),
      text: normalizedText,
    })
    : options.fontSize;

  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${options.width}px`;
  host.style.height = `${options.height}px`;
  host.style.background = '#ffffff';
  host.style.pointerEvents = 'none';
  host.style.opacity = '1';
  host.style.overflow = 'hidden';
  host.style.zIndex = '-1';

  content.style.width = `${options.width}px`;
  content.style.height = `${options.height}px`;
  content.style.display = isMultiline ? '-webkit-box' : 'flex';
  if (!isMultiline) {
    content.style.alignItems = 'center';
    content.style.justifyContent = resolveCssJustifyContent(options.align, isRtl);
  }
  content.style.padding = `0 ${horizontalPadding}px`;
  content.style.boxSizing = 'border-box';
  content.style.background = '#ffffff';
  content.style.color = '#000000';
  content.style.whiteSpace = isMultiline ? 'normal' : 'nowrap';
  content.style.lineHeight = String(lineHeight);
  content.style.overflow = 'hidden';
  content.style.textOverflow = isMultiline ? 'clip' : 'ellipsis';
  if (isMultiline) {
    content.style.overflowWrap = 'anywhere';
    content.style.setProperty('-webkit-box-orient', 'vertical');
    content.style.setProperty('-webkit-line-clamp', String(maxLines));
  }
  content.style.direction = isRtl ? 'rtl' : 'ltr';
  content.style.textAlign = textAlign;
  content.style.unicodeBidi = 'plaintext';
  content.style.textRendering = 'optimizeLegibility';
  content.style.fontKerning = 'normal';
  content.style.font = `${options.fontWeight} ${Math.max(8, fittedFontSize)}px ${getCanvasFontFamily(normalizedText)}`;
  content.textContent = normalizedText;

  host.appendChild(content);
  document.body.appendChild(host);
  try {
    const canvas = await html2canvas(content, {
      backgroundColor: '#ffffff',
      logging: false,
      scale: 1,
      useCORS: true,
    });
    context.drawImage(canvas, 0, 0);
  } finally {
    host.remove();
  }
}

function drawTextToFit(
  context: CanvasRenderingContext2D,
  options: {
    align: TextAlignMode;
    fontSize: number;
    fontWeight: number;
    height: number;
    lineHeight?: number;
    maxLines?: number;
    minFontSize?: number;
    shrinkToFitWidth?: boolean;
    text: string;
    width: number;
  },
): void {
  const normalizedText = collapseWhitespace(options.text);
  if (!normalizedText) {
    return;
  }

  const paddingX = Math.max(1, Math.round(options.width * 0.025));
  const availableWidth = Math.max(1, options.width - (paddingX * 2));
  const availableHeight = Math.max(1, options.height - 2);
  const maxLines = Math.max(1, options.maxLines ?? 1);
  const lineHeightMultiplier = options.lineHeight ?? 1.05;
  const shrinkToFitWidth = options.shrinkToFitWidth ?? false;
  const isRtl = containsArabic(normalizedText);
  const direction = isRtl ? 'rtl' : 'ltr';
  const resolvedAlign = resolveTextAlign(options.align, isRtl);
  const canvasDirectionContext = context as CanvasRenderingContext2D & { direction?: CanvasDirection };
  let fontSize = Math.max(8, Math.min(options.fontSize, availableHeight));
  const minFontSize = Math.max(
    8,
    Math.min(fontSize, options.minFontSize ?? Math.round(fontSize * 0.65)),
  );
  let fittedLines = [normalizedText];

  while (fontSize >= minFontSize) {
    context.font = `${options.fontWeight} ${fontSize}px ${getCanvasFontFamily(normalizedText)}`;
    context.textAlign = resolvedAlign;
    context.textBaseline = 'middle';
    canvasDirectionContext.direction = direction;
    if (maxLines > 1) {
      fittedLines = wrapTextToLines(context, normalizedText, availableWidth, maxLines);
    } else if (shrinkToFitWidth) {
      fittedLines = [normalizedText];
    } else {
      fittedLines = [truncateToWidth(context, normalizedText, availableWidth)];
    }
    const textHeight = maxLines > 1
      ? Math.ceil(fittedLines.length * Math.max(fontSize, fontSize * lineHeightMultiplier))
      : Math.max(
        fontSize,
        Math.ceil((context.measureText(fittedLines[0]).actualBoundingBoxAscent ?? fontSize * 0.8) + (context.measureText(fittedLines[0]).actualBoundingBoxDescent ?? fontSize * 0.2)),
      );
    const widthFits = maxLines > 1 || !shrinkToFitWidth || context.measureText(fittedLines[0]).width <= availableWidth;
    if (textHeight <= availableHeight && widthFits) {
      break;
    }
    fontSize -= 1;
  }

  if (maxLines === 1 && shrinkToFitWidth && context.measureText(fittedLines[0]).width > availableWidth) {
    fittedLines = [truncateToWidth(context, normalizedText, availableWidth)];
  }

  const x = resolvedAlign === 'center'
    ? Math.round(options.width / 2)
    : resolvedAlign === 'right'
      ? options.width - paddingX
      : paddingX;
  context.fillStyle = '#000000';
  if (fittedLines.length === 1) {
    context.fillText(fittedLines[0], x, Math.round(options.height / 2));
    return;
  }

  const lineStep = Math.max(fontSize, Math.round(fontSize * lineHeightMultiplier));
  const firstY = Math.round((options.height / 2) - (((fittedLines.length - 1) * lineStep) / 2));
  fittedLines.forEach((line, index) => {
    context.fillText(line, x, firstY + (index * lineStep));
  });
}

function resolveTextAlign(
  align: TextAlignMode,
  isRtl: boolean,
): CanvasTextAlign {
  if (align === 'center') {
    return 'center';
  }
  if (align === 'end') {
    return isRtl ? 'left' : 'right';
  }
  return isRtl ? 'right' : 'left';
}

function truncateToWidth(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = '...';
  if (context.measureText(ellipsis).width > maxWidth) {
    return text.slice(0, 1);
  }

  let low = 0;
  let high = text.length;
  while (low < high) {
    const candidateLength = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, candidateLength).trimEnd()}${ellipsis}`;
    if (context.measureText(candidate).width <= maxWidth) {
      low = candidateLength;
    } else {
      high = candidateLength - 1;
    }
  }

  return `${text.slice(0, low).trimEnd()}${ellipsis}`;
}

function wrapTextToLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (maxLines <= 1) {
    return [truncateToWidth(context, text, maxWidth)];
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let index = 0;

  while (index < tokens.length && lines.length < maxLines) {
    let line = tokens[index];
    index += 1;

    while (index < tokens.length) {
      const candidate = `${line} ${tokens[index]}`;
      if (context.measureText(candidate).width > maxWidth) {
        break;
      }
      line = candidate;
      index += 1;
    }

    if (lines.length === maxLines - 1 && index < tokens.length) {
      line = truncateToWidth(context, `${line} ${tokens.slice(index).join(' ')}`, maxWidth);
      lines.push(line);
      return lines;
    }

    lines.push(truncateToWidth(context, line, maxWidth));
  }

  return lines;
}

function thresholdCanvas(canvas: HTMLCanvasElement, threshold: number): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    const luminance =
      (0.299 * data[index]) +
      (0.587 * data[index + 1]) +
      (0.114 * data[index + 2]);
    const isBlack = alpha > 0 && luminance < threshold;
    const value = isBlack ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

function dilateBinaryCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const source = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const pixelIndex = ((y * canvas.width) + x) * 4;
      if (source[pixelIndex] === 0) {
        continue;
      }

      let shouldFill = false;
      for (let deltaY = -1; deltaY <= 1 && !shouldFill; deltaY += 1) {
        const sampleY = y + deltaY;
        if (sampleY < 0 || sampleY >= canvas.height) {
          continue;
        }
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          const sampleX = x + deltaX;
          if (sampleX < 0 || sampleX >= canvas.width) {
            continue;
          }
          const sampleIndex = ((sampleY * canvas.width) + sampleX) * 4;
          if (source[sampleIndex] === 0) {
            shouldFill = true;
            break;
          }
        }
      }

      if (shouldFill) {
        data[pixelIndex] = 0;
        data[pixelIndex + 1] = 0;
        data[pixelIndex + 2] = 0;
        data[pixelIndex + 3] = 255;
      }
    }
  }

  context.putImageData(imageData, 0, 0);
}

function canvasToGfa(canvas: HTMLCanvasElement): GfaGraphic {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Unable to read a Zebra label canvas.');
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rowBytes = Math.ceil(canvas.width / 8);
  const bytes = new Uint8Array(rowBytes * canvas.height);
  let byteIndex = 0;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let xByte = 0; xByte < rowBytes; xByte += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = (xByte * 8) + bit;
        if (x >= canvas.width) {
          continue;
        }
        const pixelIndex = ((y * canvas.width) + x) * 4;
        const isBlack = imageData.data[pixelIndex] === 0;
        if (isBlack) {
          value |= 1 << (7 - bit);
        }
      }
      bytes[byteIndex] = value;
      byteIndex += 1;
    }
  }

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0').toUpperCase()).join('');
  return {
    height: canvas.height,
    hex,
    rowBytes,
    totalBytes: bytes.length,
    width: canvas.width,
  };
}

function graphicToZpl(x: number, y: number, graphic: GfaGraphic): string {
  return `^FO${Math.max(0, x)},${Math.max(0, y)}^GFA,${graphic.totalBytes},${graphic.totalBytes},${graphic.rowBytes},${graphic.hex}^FS`;
}

function nativeTextField(options: {
  align: 'C' | 'L' | 'R';
  fontHeight: number;
  fontWidth: number;
  lineSpacing?: number;
  maxLines?: number;
  orientation?: 'N' | 'R' | 'I' | 'B';
  text: string;
  width: number;
  x: number;
  y: number;
}): string {
  const text = sanitizeZplText(options.text);
  if (!text) {
    return '';
  }
  const orientation = options.orientation || 'N';
  const maxLines = Math.max(1, options.maxLines ?? 1);
  const lineSpacing = options.lineSpacing ?? 0;
  return `^FO${Math.max(0, options.x)},${Math.max(0, options.y)}^A0${orientation},${Math.max(1, options.fontHeight)},${Math.max(1, options.fontWidth)}^FB${Math.max(1, options.width)},${maxLines},${lineSpacing},${options.align},0^FD${text}^FS`;
}

function pickCode128ModuleWidth(value: string, maxWidth: number, dpiX: number): number {
  const widestModule = Math.min(
    DEFAULT_LABEL_BARCODE_SPEC.maxZplModuleWidthDots,
    maxWidth >= 520 ? 3 : 2,
  );
  for (let moduleWidth = widestModule; moduleWidth >= 1; moduleWidth -= 1) {
    const quietZoneDots = getCode128QuietZoneDots(
      moduleWidth,
      dpiX,
      DEFAULT_LABEL_BARCODE_SPEC,
    );
    if ((estimateCode128Width(value, moduleWidth) + (quietZoneDots * 2)) <= maxWidth) {
      return moduleWidth;
    }
  }
  return 1;
}

function estimateCode128Width(value: string, moduleWidth: number): number {
  return (35 + (11 * Math.max(1, value.length))) * moduleWidth;
}

function sanitizeBarcodeValue(value: string): string {
  return replaceUnsupportedZplCharacters(value, '-');
}

function sanitizeZplText(value: string): string {
  return replaceUnsupportedZplCharacters(collapseWhitespace(value), ' ').trim();
}

function needsRasterText(value: string): boolean {
  return !supportsNativeZplText(value);
}

function supportsNativeZplText(value: string): boolean {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return false;
  }
  return /^[\x20-\x7E]+$/.test(normalized);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function containsArabic(value: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(value);
}

function getCanvasFontFamily(value: string): string {
  if (containsArabic(value)) {
    return EMBEDDED_ARABIC_FONT_STACK;
  }
  return DEFAULT_CANVAS_FONT_STACK;
}

function resolveCssJustifyContent(
  align: TextAlignMode,
  isRtl: boolean,
): 'center' | 'flex-end' | 'flex-start' {
  if (align === 'center') {
    return 'center';
  }
  if (align === 'end') {
    return isRtl ? 'flex-start' : 'flex-end';
  }
  return isRtl ? 'flex-end' : 'flex-start';
}

function resolveCssTextAlign(
  align: TextAlignMode,
  isRtl: boolean,
): 'center' | 'left' | 'right' {
  if (align === 'center') {
    return 'center';
  }
  if (align === 'end') {
    return isRtl ? 'left' : 'right';
  }
  return isRtl ? 'right' : 'left';
}

function replaceUnsupportedZplCharacters(value: string, replacement: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7F || character === '^' || character === '~' || character === '\\') {
      return replacement;
    }
    return character;
  }).join('');
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('Zebra labels can only be generated in a browser context.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function requiresBrowserTextLayout(value: string): boolean {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return false;
  }
  return /[^\x20-\x7E]/.test(normalized);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadImage(source: string): Promise<HTMLImageElement> {
  await ensureBrowserFontsReady();
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to render SVG text for Zebra label.'));
    image.src = source;
  });
}

let fontsReadyPromise: Promise<void> | null = null;
let bundledArabicFontsReadyPromise: Promise<void> | null = null;

async function ensureBrowserFontsReady(text?: string): Promise<void> {
  if (containsArabic(text ?? '')) {
    await ensureBundledArabicFontsReady();
  }

  const fontSet = document.fonts;
  if (!fontSet || typeof fontSet.ready === 'undefined') {
    return;
  }

  if (fontsReadyPromise) {
    await fontsReadyPromise;
    return;
  }
  fontsReadyPromise = Promise.resolve(fontSet.ready).then(() => undefined);
  await fontsReadyPromise;
}

function ensureBundledArabicFontsReady(): Promise<void> {
  if (bundledArabicFontsReadyPromise) {
    return bundledArabicFontsReadyPromise;
  }

  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    bundledArabicFontsReadyPromise = Promise.resolve();
    return bundledArabicFontsReadyPromise;
  }

  const fontSet = document.fonts;
  if (!fontSet) {
    bundledArabicFontsReadyPromise = Promise.resolve();
    return bundledArabicFontsReadyPromise;
  }

  if (
    fontSet.check(`400 16px "${EMBEDDED_ARABIC_FONT_FAMILY}"`, 'كوردی') &&
    fontSet.check(`700 16px "${EMBEDDED_ARABIC_FONT_FAMILY}"`, 'كوردی')
  ) {
    bundledArabicFontsReadyPromise = Promise.resolve();
    return bundledArabicFontsReadyPromise;
  }

  bundledArabicFontsReadyPromise = Promise.all([
    new FontFace(EMBEDDED_ARABIC_FONT_FAMILY, `url(${arabicRegularFontUrl})`, {
      style: 'normal',
      weight: '400',
    }).load(),
    new FontFace(EMBEDDED_ARABIC_FONT_FAMILY, `url(${arabicBoldFontUrl})`, {
      style: 'normal',
      weight: '700',
    }).load(),
  ]).then(async ([regularFace, boldFace]) => {
    fontSet.add(regularFace);
    fontSet.add(boldFace);
    await Promise.all([
      fontSet.load(`400 16px "${EMBEDDED_ARABIC_FONT_FAMILY}"`, 'كوردی'),
      fontSet.load(`700 16px "${EMBEDDED_ARABIC_FONT_FAMILY}"`, 'كوردی'),
    ]);
    await fontSet.ready;
  }).catch((error) => {
    bundledArabicFontsReadyPromise = null;
    throw error;
  });

  return bundledArabicFontsReadyPromise;
}
