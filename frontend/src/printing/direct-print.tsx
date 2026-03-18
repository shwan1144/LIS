import React from 'react';
import { createRoot } from 'react-dom/client';
import type { DepartmentDto, OrderDto } from '../api/client';
import { OrderReceipt } from '../components/Print/OrderReceipt';
import { AllSampleLabels } from '../components/Print/SampleLabel';
import printCss from '../components/Print/print.css?raw';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  generateZebraLabelZpl,
  pruneLabelGraphicCache,
  resolveZebraLabelGeometry,
  type ZebraLabelPrinterConfig,
} from './zebra-label';
import { resolvePrinterCapabilityProfile } from './label-printing-spec';
import {
  measureAsync,
  nowMs,
  recordLabelPrintTelemetry,
  utf8ByteLength,
} from './label-printing-telemetry';

const GATEWAY_URL = 'http://localhost:17881';
const GATEWAY_HEALTH_TIMEOUT_MS = 3_000;
const GATEWAY_PRINTER_TIMEOUT_MS = 5_000;
const GATEWAY_PRINT_TIMEOUT_MS = 20_000;
const GATEWAY_PRINTER_CONFIG_CACHE_TTL_MS = 5 * 60_000;
const RECEIPT_PDF_CACHE_TTL_MS = 5 * 60_000;
const RECEIPT_DEFAULT_PAPER_WIDTH_MM = 80;
const RECEIPT_DEFAULT_CONTENT_WIDTH_MM = 74;
const RECEIPT_DEFAULT_TARGET_DPI = 203;
const RECEIPT_MAX_TARGET_DPI = 300;
const RECEIPT_RENDER_MIN_SCALE = 2.5;
const RECEIPT_RENDER_MAX_SCALE = 5;
const RECEIPT_THRESHOLD = 216;
const RECEIPT_MIN_PAPER_WIDTH_MM = 58;
const RECEIPT_MAX_PAPER_WIDTH_MM = 82;
const RECEIPT_SAFE_HORIZONTAL_MARGIN_MM = 3;
const RECEIPT_MIN_CONTENT_WIDTH_MM = 52;
const RECEIPT_MAX_CONTENT_WIDTH_MM = RECEIPT_DEFAULT_CONTENT_WIDTH_MM;
const VIRTUAL_SAVE_PRINTER_KEYWORDS = [
  'print to pdf',
  'pdfcreator',
  'pdf architect',
  'xps document writer',
  'onenote',
];
const LABEL_DESIGN_WIDTH_MM = 50;
const LABEL_DESIGN_HEIGHT_MM = 25;
const LABEL_RENDER_MIN_SCALE = 3;
const LABEL_RENDER_MAX_SCALE = 8;
const LABEL_TARGET_DPI = 300;
const LABEL_THRESHOLD = 208;

type GatewayPrintOptions = {
  orientation?: 'portrait' | 'landscape';
  scale?: 'noscale' | 'shrink' | 'fit';
  paperSize?: string;
};

type GatewayPrintersResponse = {
  printers?: string[];
};

type GatewayStatusResponse = {
  status?: string;
  service?: string;
};

type GatewayPrinterConfigResponse = {
  mediaHeightMm?: number | null;
  mediaWidthMm?: number | null;
  orientation?: 'portrait' | 'landscape' | null;
  paperSize?: string | null;
  printerName?: string;
  resolutionXDpi?: number | null;
  resolutionYDpi?: number | null;
};

type GatewayPrinterConfigCacheSource =
  | 'fallback-empty'
  | 'inflight'
  | 'memory-cache'
  | 'network';

type CachedGatewayPrinterConfigEntry = {
  config: GatewayPrinterConfigResponse;
  expiresAt: number;
};

type CachedReceiptPdfEntry = {
  blob: Blob;
  expiresAt: number;
};

type ReceiptRenderProfile = {
  contentWidthMm: number;
  pageWidthMm: number;
  targetDpi: number;
  thermalThreshold: number;
};

export type DirectLabelPrintResult = {
  mode: 'pdf' | 'zpl';
  warning?: string;
};

const gatewayPrinterConfigCache = new Map<string, CachedGatewayPrinterConfigEntry>();
const gatewayPrinterConfigInFlight = new Map<string, Promise<GatewayPrinterConfigResponse>>();
const receiptPdfCache = new Map<string, CachedReceiptPdfEntry>();
const receiptPdfInFlight = new Map<string, Promise<Blob>>();

export function isVirtualSavePrinterName(name: string): boolean {
  const value = name.trim().toLowerCase();
  return VIRTUAL_SAVE_PRINTER_KEYWORDS.some((keyword) => value.includes(keyword));
}

export function isZebraPrinterName(name: string): boolean {
  return /zebra|zdesigner/i.test(name);
}

function normalizePrinterList(printers: string[]): string[] {
  return Array.from(
    new Set(
      printers
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

async function fetchGatewayStatus(): Promise<GatewayStatusResponse> {
  const response = await axios.get<GatewayStatusResponse>(`${GATEWAY_URL}/local/status`, {
    timeout: GATEWAY_HEALTH_TIMEOUT_MS,
  });
  return response.data;
}

async function fetchGatewayPrinters(): Promise<string[]> {
  const response = await axios.get<GatewayPrintersResponse>(`${GATEWAY_URL}/local/printers`, {
    timeout: GATEWAY_PRINTER_TIMEOUT_MS,
  });
  return normalizePrinterList(
    Array.isArray(response.data?.printers) ? response.data.printers : [],
  );
}

async function fetchGatewayPrinterConfig(printerName: string): Promise<GatewayPrinterConfigResponse> {
  const response = await axios.get<GatewayPrinterConfigResponse>(`${GATEWAY_URL}/local/printer-config`, {
    params: { printerName },
    timeout: GATEWAY_PRINTER_TIMEOUT_MS,
  });
  return response.data ?? {};
}

async function fetchGatewayPrinterConfigCached(
  printerName: string,
): Promise<{ config: GatewayPrinterConfigResponse; source: GatewayPrinterConfigCacheSource }> {
  const normalizedPrinterName = printerName.trim();
  const cacheKey = normalizedPrinterName.toLowerCase();
  const now = nowMs();
  const cached = gatewayPrinterConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      config: cached.config,
      source: 'memory-cache',
    };
  }

  const inFlight = gatewayPrinterConfigInFlight.get(cacheKey);
  if (inFlight) {
    return {
      config: await inFlight,
      source: 'inflight',
    };
  }

  const request = fetchGatewayPrinterConfig(normalizedPrinterName)
    .then((config) => {
      gatewayPrinterConfigCache.set(cacheKey, {
        config,
        expiresAt: nowMs() + GATEWAY_PRINTER_CONFIG_CACHE_TTL_MS,
      });
      return config;
    })
    .finally(() => {
      gatewayPrinterConfigInFlight.delete(cacheKey);
    });
  gatewayPrinterConfigInFlight.set(cacheKey, request);

  return {
    config: await request,
    source: 'network',
  };
}

export async function warmGatewayPrinterConfig(printerName: string | null | undefined): Promise<void> {
  const normalizedPrinterName = printerName?.trim();
  if (!normalizedPrinterName) {
    return;
  }

  try {
    await fetchGatewayPrinterConfigCached(normalizedPrinterName);
  } catch {
    // Warming is best-effort; direct print will still fall back later if needed.
  }
}

export async function warmDirectLabelPrintAssets(params: {
  order: OrderDto;
  printerName: string | null | undefined;
  labelSequenceBy?: 'tube_type' | 'department';
  departments?: DepartmentDto[];
}): Promise<void> {
  const normalizedPrinterName = params.printerName?.trim();
  if (!normalizedPrinterName) {
    return;
  }

  try {
    const configResult = await fetchGatewayPrinterConfigCached(normalizedPrinterName);
    if (!isZebraPrinterName(normalizedPrinterName)) {
      return;
    }

    await generateZebraLabelZpl({
      departments: params.departments,
      labelSequenceBy: params.labelSequenceBy,
      order: params.order,
      printerConfig: configResult.config as ZebraLabelPrinterConfig,
    });
  } catch {
    // Warming is best-effort and must never block visible printing flows.
  }
}

async function gatewayPrintPdf(
  blob: Blob,
  printerName: string,
  jobName: string,
  printOptions?: GatewayPrintOptions,
): Promise<void> {
  const base64 = await blobToBase64(blob);
  await axios.post(
    `${GATEWAY_URL}/local/print`,
    {
      printerName,
      pdfBase64: base64,
      jobName,
      printOptions,
    },
    { timeout: GATEWAY_PRINT_TIMEOUT_MS },
  );
}

async function gatewayPrintRaw(params: {
  contentType: 'zpl';
  jobName: string;
  printerName: string;
  raw: string;
}): Promise<void> {
  const payload = {
    contentType: params.contentType,
    jobName: params.jobName,
    printerName: params.printerName,
    rawBase64: utf8ToBase64(params.raw),
  };
  const candidateEndpoints = [
    `${GATEWAY_URL}/local/print-raw`,
    `${GATEWAY_URL}/local/printer-raw`,
    `${GATEWAY_URL}/print-raw`,
    `${GATEWAY_URL}/printer-raw`,
  ];

  let lastError: unknown;
  for (const endpoint of candidateEndpoints) {
    try {
      await axios.post(endpoint, payload, { timeout: GATEWAY_PRINT_TIMEOUT_MS });
      return;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('Gateway RAW print route not found.');
}

async function convertHtmlToPdf(
  element: HTMLElement,
  options?: {
    contentWidthMm?: number;
    orientation?: 'portrait' | 'landscape';
    pageWidthMm?: number;
    targetDpi?: number;
    thermalThreshold?: number;
  },
): Promise<Blob> {
  const elementRect = element.getBoundingClientRect();
  const shouldUsePhysicalSizing =
    typeof options?.pageWidthMm === 'number'
    && Number.isFinite(options.pageWidthMm)
    && options.pageWidthMm > 0;
  let renderScale = 2;

  if (shouldUsePhysicalSizing) {
    const targetContentWidthMm = options?.contentWidthMm ?? options?.pageWidthMm ?? RECEIPT_DEFAULT_PAPER_WIDTH_MM;
    const targetWidthPx = Math.max(
      1,
      Math.round(
        (targetContentWidthMm / 25.4)
        * (options?.targetDpi ?? RECEIPT_DEFAULT_TARGET_DPI),
      ),
    );
    renderScale = Math.max(
      RECEIPT_RENDER_MIN_SCALE,
      Math.min(
        RECEIPT_RENDER_MAX_SCALE,
        targetWidthPx / Math.max(elementRect.width, 1),
      ),
    );
  }

  const canvas = await html2canvas(element, {
    scale: renderScale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  if (options?.thermalThreshold != null) {
    thresholdCanvasForThermalPrint(canvas, options.thermalThreshold);
  }

  const imgData = canvas.toDataURL('image/png');

  if (shouldUsePhysicalSizing) {
    const pageWidthMm = options?.pageWidthMm ?? RECEIPT_DEFAULT_PAPER_WIDTH_MM;
    const contentWidthMm = clampNumber(
      options?.contentWidthMm ?? pageWidthMm,
      RECEIPT_MIN_CONTENT_WIDTH_MM,
      pageWidthMm,
    );
    const pageHeightMm = contentWidthMm * (canvas.height / Math.max(canvas.width, 1));
    const offsetXmm = Math.max(0, (pageWidthMm - contentWidthMm) / 2);
    const pdf = new jsPDF({
      orientation: options?.orientation ?? 'portrait',
      unit: 'mm',
      format: [pageWidthMm, pageHeightMm],
    });
    pdf.addImage(imgData, 'PNG', offsetXmm, 0, contentWidthMm, pageHeightMm);
    return pdf.output('blob');
  }

  const pdf = new jsPDF({
    orientation: options?.orientation ?? (canvas.width > canvas.height ? 'landscape' : 'portrait'),
    unit: 'px',
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  return pdf.output('blob');
}

export async function renderLabelsToPdf(
  element: React.ReactElement,
  pageWidthMm: number,
  pageHeightMm: number,
  options?: {
    orientation?: 'portrait' | 'landscape';
  },
): Promise<Blob> {
  const orientation = options?.orientation ?? 'landscape';
  const shouldRotateToPortrait = orientation === 'portrait';
  const pdfPageWidthMm = shouldRotateToPortrait ? pageHeightMm : pageWidthMm;
  const pdfPageHeightMm = shouldRotateToPortrait ? pageWidthMm : pageHeightMm;
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${LABEL_DESIGN_WIDTH_MM}mm`;
  host.style.background = '#ffffff';
  host.className = 'print-container-offscreen';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(element);
    await waitForRenderAndEffects();

    const labels = Array.from(host.querySelectorAll<HTMLElement>('.sample-label'));
    if (labels.length === 0) {
      throw new Error('No sample labels available to print.');
    }

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [pdfPageWidthMm, pdfPageHeightMm],
    });

    for (const [index, label] of labels.entries()) {
      if (index > 0) {
        pdf.addPage([pdfPageWidthMm, pdfPageHeightMm], orientation);
      }

      const captureTarget = document.createElement('div');
      const uniformScale = Math.min(
        pageWidthMm / LABEL_DESIGN_WIDTH_MM,
        pageHeightMm / LABEL_DESIGN_HEIGHT_MM,
      );
      const scaledWidthMm = LABEL_DESIGN_WIDTH_MM * uniformScale;
      const scaledHeightMm = LABEL_DESIGN_HEIGHT_MM * uniformScale;
      const offsetLeftMm = Math.max(0, (pageWidthMm - scaledWidthMm) / 2);
      const offsetTopMm = Math.max(0, (pageHeightMm - scaledHeightMm) / 2);
      const scaledLabel = label.cloneNode(true) as HTMLElement;

      captureTarget.style.position = 'fixed';
      captureTarget.style.left = '-100000px';
      captureTarget.style.top = '0';
      captureTarget.style.width = `${pageWidthMm}mm`;
      captureTarget.style.height = `${pageHeightMm}mm`;
      captureTarget.style.boxSizing = 'border-box';
      captureTarget.style.background = '#ffffff';
      captureTarget.style.overflow = 'hidden';

      scaledLabel.style.position = 'absolute';
      scaledLabel.style.left = `${offsetLeftMm}mm`;
      scaledLabel.style.top = `${offsetTopMm}mm`;
      scaledLabel.style.margin = '0';
      scaledLabel.style.transformOrigin = 'top left';
      scaledLabel.style.transform = `scale(${uniformScale})`;

      captureTarget.appendChild(scaledLabel);
      document.body.appendChild(captureTarget);

      let canvas: HTMLCanvasElement;
      try {
        const targetRect = captureTarget.getBoundingClientRect();
        const targetWidthPx = Math.max(1, Math.round((pageWidthMm / 25.4) * LABEL_TARGET_DPI));
        const targetHeightPx = Math.max(1, Math.round((pageHeightMm / 25.4) * LABEL_TARGET_DPI));
        const renderScale = Math.max(
          LABEL_RENDER_MIN_SCALE,
          Math.min(
            LABEL_RENDER_MAX_SCALE,
            targetWidthPx / Math.max(targetRect.width, 1),
            targetHeightPx / Math.max(targetRect.height, 1),
          ),
        );

        canvas = await html2canvas(captureTarget, {
          scale: renderScale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
      } finally {
        captureTarget.remove();
      }

      if (shouldRotateToPortrait) {
        canvas = rotateCanvasClockwise(canvas);
      }

      thresholdCanvasForThermalPrint(canvas);

      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        0,
        pdfPageWidthMm,
        pdfPageHeightMm,
      );
    }

    return pdf.output('blob');
  } finally {
    root.unmount();
    host.remove();
  }
}

function thresholdCanvasForThermalPrint(
  canvas: HTMLCanvasElement,
  threshold = LABEL_THRESHOLD,
): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) {
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = 255;
      continue;
    }

    const luminance = (0.299 * data[index]) + (0.587 * data[index + 1]) + (0.114 * data[index + 2]);
    const value = luminance < threshold ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

async function renderReceiptToPdf(
  element: React.ReactElement,
  renderProfile: ReceiptRenderProfile,
): Promise<Blob> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.display = 'inline-block';
  host.style.width = 'max-content';
  host.style.background = '#ffffff';
  host.className = 'print-container-offscreen';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(element);
    await waitForRenderAndEffects();

    const receipt = host.querySelector<HTMLElement>('.print-receipt');
    if (!receipt) {
      throw new Error('Receipt content unavailable to print.');
    }

    return await convertHtmlToPdf(receipt, {
      contentWidthMm: renderProfile.contentWidthMm,
      orientation: 'portrait',
      pageWidthMm: renderProfile.pageWidthMm,
      targetDpi: renderProfile.targetDpi,
      thermalThreshold: renderProfile.thermalThreshold,
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

function rotateCanvasClockwise(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const rotatedCanvas = document.createElement('canvas');
  rotatedCanvas.width = sourceCanvas.height;
  rotatedCanvas.height = sourceCanvas.width;

  const rotatedContext = rotatedCanvas.getContext('2d');
  if (!rotatedContext) {
    throw new Error('Unable to rotate label canvas for direct print.');
  }

  rotatedContext.translate(rotatedCanvas.width, 0);
  rotatedContext.rotate(Math.PI / 2);
  rotatedContext.drawImage(sourceCanvas, 0, 0);
  return rotatedCanvas;
}

async function waitForRenderAndEffects(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
      if (!base64) {
        reject(new Error('Failed to read PDF content.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read PDF content.'));
    reader.readAsDataURL(blob);
  });
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function buildLabelsPrintElement(params: {
  departments?: DepartmentDto[];
  labelSequenceBy?: 'tube_type' | 'department';
  order: OrderDto;
}): React.ReactElement {
  return (
    <div className="print-container">
      <style>{printCss}</style>
      <AllSampleLabels
        order={params.order}
        labelSequenceBy={params.labelSequenceBy}
        departments={params.departments}
      />
    </div>
  );
}

export async function directPrintReceipt(params: {
  order: OrderDto;
  labName?: string;
  printerName: string;
}): Promise<void> {
  const jobName = `Receipt-${params.order.orderNumber || params.order.id}`;
  let printerConfig: GatewayPrinterConfigResponse = {};
  let paperSize: string | undefined;

  try {
    const configResult = await fetchGatewayPrinterConfigCached(params.printerName);
    printerConfig = configResult.config;
    if (typeof printerConfig.paperSize === 'string' && printerConfig.paperSize.trim()) {
      paperSize = printerConfig.paperSize.trim();
    }
  } catch {
    // Receipt printing still falls back to the default thermal profile if config lookup fails.
  }

  const blob = await getCachedReceiptPdf({
    labName: params.labName,
    order: params.order,
    printerConfig,
  });
  await gatewayPrintPdf(blob, params.printerName, jobName, {
    orientation: 'portrait',
    paperSize,
    scale: 'noscale',
  });
}

export async function warmDirectReceiptPrintAssets(params: {
  order: OrderDto;
  labName?: string;
  printerName?: string | null;
}): Promise<void> {
  try {
    const normalizedPrinterName = params.printerName?.trim();
    let printerConfig: GatewayPrinterConfigResponse = {};

    if (normalizedPrinterName) {
      try {
        const configResult = await fetchGatewayPrinterConfigCached(normalizedPrinterName);
        printerConfig = configResult.config;
      } catch {
        printerConfig = {};
      }
    }

    await getCachedReceiptPdf({
      labName: params.labName,
      order: params.order,
      printerConfig,
    });
  } catch {
    // Warming is best-effort and must never block visible printing flows.
  }
}

export async function directPrintLabels(params: {
  order: OrderDto;
  printerName: string;
  labelSequenceBy?: 'tube_type' | 'department';
  departments?: DepartmentDto[];
}): Promise<DirectLabelPrintResult> {
  const printStart = nowMs();
  const labelCount = params.order.samples?.length ?? 0;
  const jobName = `Labels-${params.order.orderNumber || params.order.id}`;
  let paperSize = 'Custom';
  let printerConfig: GatewayPrinterConfigResponse = {};
  let configFetchMs: number | null = null;
  let configSource: GatewayPrinterConfigCacheSource | null = null;

  try {
    try {
      const configResult = await measureAsync(() =>
        fetchGatewayPrinterConfigCached(params.printerName),
      );
      configFetchMs = configResult.durationMs;
      configSource = configResult.result.source;
      printerConfig = configResult.result.config;
      if (typeof printerConfig.paperSize === 'string' && printerConfig.paperSize.trim()) {
        paperSize = printerConfig.paperSize.trim();
      }
    } catch {
      configSource = 'fallback-empty';
      // fall back to default label size when printer details cannot be read
    }

    const geometry = resolveZebraLabelGeometry(printerConfig as ZebraLabelPrinterConfig);
    const capabilityProfile = resolvePrinterCapabilityProfile({
      printerConfig,
      printerName: params.printerName,
    });
    const labelsElement = buildLabelsPrintElement(params);

    if (isZebraPrinterName(params.printerName)) {
      try {
        const zplResult = await measureAsync(() =>
          generateZebraLabelZpl({
            departments: params.departments,
            labelSequenceBy: params.labelSequenceBy,
            order: params.order,
            printerConfig,
          }),
        );
        const dispatchResult = await measureAsync(() =>
          gatewayPrintRaw({
            contentType: 'zpl',
            jobName,
            printerName: params.printerName,
            raw: zplResult.result,
          }),
        );
        recordLabelPrintTelemetry({
          capabilityProfile,
          configFetchMs,
          configSource,
          dispatchMs: dispatchResult.durationMs,
          generationMs: zplResult.durationMs,
          jobName,
          labelCount,
          overheadMs:
            (nowMs() - printStart) - zplResult.durationMs - dispatchResult.durationMs,
          payloadBytes: utf8ByteLength(zplResult.result),
          printerName: params.printerName,
          strategy: 'zebra_raw_zpl',
          totalMs: nowMs() - printStart,
        });
        return { mode: 'zpl' };
      } catch (rawError) {
        const rawMessage = getDirectPrintErrorMessage(rawError);
        throw new Error(`Native Zebra print failed (${rawMessage}).`);
      }
    }

    const pdfResult = await measureAsync(() =>
      renderLabelsToPdf(
        labelsElement,
        geometry.pageWidthMm,
        geometry.pageHeightMm,
        { orientation: 'portrait' },
      ),
    );
    const dispatchResult = await measureAsync(() =>
      gatewayPrintPdf(pdfResult.result, params.printerName, jobName, {
        orientation: 'portrait',
        paperSize,
        scale: 'noscale',
      }),
    );
    recordLabelPrintTelemetry({
      capabilityProfile,
      configFetchMs,
      configSource,
      dispatchMs: dispatchResult.durationMs,
      generationMs: pdfResult.durationMs,
      jobName,
      labelCount,
      overheadMs:
        (nowMs() - printStart) - pdfResult.durationMs - dispatchResult.durationMs,
      payloadBytes: pdfResult.result.size,
      printerName: params.printerName,
      strategy: 'gateway_pdf',
      totalMs: nowMs() - printStart,
    });
    return { mode: 'pdf' };
  } finally {
    pruneLabelGraphicCache();
  }
}

function buildReceiptCacheKey(params: {
  order: OrderDto;
  labName?: string;
  printerConfig?: GatewayPrinterConfigResponse;
}): string {
  const renderProfile = resolveReceiptRenderProfile(params.printerConfig);
  const rootTests = (params.order.samples ?? []).flatMap((sample) =>
    (sample.orderTests ?? [])
      .filter((orderTest) => !orderTest.parentOrderTestId)
      .map((orderTest) => ({
        code: orderTest.test?.code ?? '',
        name: orderTest.test?.name ?? '',
        price: orderTest.price ?? null,
      })),
  );

  return JSON.stringify({
    labName: params.labName ?? params.order.lab?.name ?? null,
    renderProfile,
    order: {
      discountPercent: params.order.discountPercent ?? null,
      finalAmount: params.order.finalAmount ?? null,
      id: params.order.id,
      notes: params.order.notes ?? null,
      orderNumber: params.order.orderNumber ?? null,
      paidAmount: params.order.paidAmount ?? null,
      paymentStatus: params.order.paymentStatus ?? null,
      registeredAt: params.order.registeredAt ?? null,
      shift: params.order.shift
        ? {
          code: params.order.shift.code ?? null,
          name: params.order.shift.name ?? null,
        }
        : null,
      totalAmount: params.order.totalAmount ?? null,
    },
    patient: {
      dateOfBirth: params.order.patient?.dateOfBirth ?? null,
      fullName: params.order.patient?.fullName ?? null,
      phone: params.order.patient?.phone ?? null,
      sex: params.order.patient?.sex ?? null,
    },
    rootTests,
  });
}

async function getCachedReceiptPdf(params: {
  order: OrderDto;
  labName?: string;
  printerConfig?: GatewayPrinterConfigResponse;
}): Promise<Blob> {
  const cacheKey = buildReceiptCacheKey(params);
  const renderProfile = resolveReceiptRenderProfile(params.printerConfig);
  const now = nowMs();
  const cached = receiptPdfCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.blob;
  }

  const inFlight = receiptPdfInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = renderReceiptToPdf(
    <div
      className="print-container"
      style={{ '--receipt-width': `${renderProfile.contentWidthMm}mm` } as React.CSSProperties}
    >
      <style>{printCss}</style>
      <OrderReceipt order={params.order} labName={params.labName} />
    </div>,
    renderProfile,
  )
    .then((blob) => {
      receiptPdfCache.set(cacheKey, {
        blob,
        expiresAt: nowMs() + RECEIPT_PDF_CACHE_TTL_MS,
      });
      return blob;
    })
    .catch((error) => {
      receiptPdfCache.delete(cacheKey);
      throw error;
    })
    .finally(() => {
      receiptPdfInFlight.delete(cacheKey);
    });

  receiptPdfInFlight.set(cacheKey, promise);
  return promise;
}

function resolveReceiptRenderProfile(
  printerConfig?: GatewayPrinterConfigResponse,
): ReceiptRenderProfile {
  const pageWidthMm = clampNumber(
    toPositiveNumber(printerConfig?.mediaWidthMm) ?? RECEIPT_DEFAULT_PAPER_WIDTH_MM,
    RECEIPT_MIN_PAPER_WIDTH_MM,
    RECEIPT_MAX_PAPER_WIDTH_MM,
  );
  const contentWidthMm = clampNumber(
    pageWidthMm - (RECEIPT_SAFE_HORIZONTAL_MARGIN_MM * 2),
    RECEIPT_MIN_CONTENT_WIDTH_MM,
    Math.min(RECEIPT_MAX_CONTENT_WIDTH_MM, pageWidthMm),
  );
  const targetDpi = clampNumber(
    Math.round(
      toPositiveNumber(printerConfig?.resolutionXDpi)
      ?? toPositiveNumber(printerConfig?.resolutionYDpi)
      ?? RECEIPT_DEFAULT_TARGET_DPI,
    ),
    RECEIPT_DEFAULT_TARGET_DPI,
    RECEIPT_MAX_TARGET_DPI,
  );

  return {
    contentWidthMm,
    pageWidthMm,
    targetDpi,
    thermalThreshold: RECEIPT_THRESHOLD,
  };
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function directPrintReportPdf(params: {
  orderId: string;
  blob: Blob;
  printerName: string;
}): Promise<void> {
  const jobName = `Report-${params.orderId}`;
  await gatewayPrintPdf(params.blob, params.printerName, jobName);
}

export async function checkDirectPrintConnection(printerName?: string): Promise<void> {
  const status = await fetchGatewayStatus();
  if (status.status !== 'ok') {
    throw new Error('LIS Gateway responded with an unhealthy status.');
  }

  if (!printerName?.trim()) {
    return;
  }

  const printers = await fetchGatewayPrinters();
  const requested = printerName.trim().toLowerCase();
  const match = printers.find((printer) => printer.toLowerCase() === requested);
  if (!match) {
    throw new Error(`Printer "${printerName}" not found in LIS Gateway.`);
  }
}

export async function listDirectPrintPrinters(): Promise<string[]> {
  await fetchGatewayStatus();
  return fetchGatewayPrinters();
}

export function getDirectPrintErrorMessage(error: unknown): string {
  const apiMessage = extractApiMessage(error);
  if (apiMessage) {
    return apiMessage;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Direct print via LIS Gateway failed. Ensure LIS Gateway is installed and running.';
}

function extractApiMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const payload = error.response?.data as
    | { message?: string | string[]; error?: string }
    | undefined;
  const messageValue = payload?.message;
  if (Array.isArray(messageValue) && typeof messageValue[0] === 'string' && messageValue[0].trim()) {
    return messageValue[0];
  }
  if (typeof messageValue === 'string' && messageValue.trim()) {
    return messageValue;
  }
  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  if (error.code === 'ECONNABORTED') {
    return 'LIS Gateway did not respond in time.';
  }
  return null;
}
