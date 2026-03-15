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
  clearLabelGraphicCache,
  generateZebraLabelZpl,
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

export type DirectLabelPrintResult = {
  mode: 'pdf' | 'zpl';
  warning?: string;
};

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

async function convertHtmlToPdf(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
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
): Promise<Blob> {
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
      orientation: 'landscape',
      unit: 'mm',
      format: [pageWidthMm, pageHeightMm],
    });

    for (const [index, label] of labels.entries()) {
      if (index > 0) {
        pdf.addPage([pageWidthMm, pageHeightMm], 'landscape');
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

      thresholdCanvasForThermalPrint(canvas);

      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        0,
        pageWidthMm,
        pageHeightMm,
      );
    }

    return pdf.output('blob');
  } finally {
    root.unmount();
    host.remove();
  }
}

function thresholdCanvasForThermalPrint(canvas: HTMLCanvasElement): void {
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
    const value = luminance < LABEL_THRESHOLD ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

async function renderAndConvertOffscreen(element: React.ReactElement): Promise<Blob> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = '800px';
  host.className = 'print-container-offscreen';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(element);
    await waitForRenderAndEffects();
    return await convertHtmlToPdf(host);
  } finally {
    root.unmount();
    host.remove();
  }
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
  const blob = await renderAndConvertOffscreen(
    <div className="print-container">
      <style>{printCss}</style>
      <OrderReceipt order={params.order} labName={params.labName} />
    </div>,
  );
  await gatewayPrintPdf(blob, params.printerName, jobName);
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
  const isZebraPrinter = isZebraPrinterName(params.printerName);
  let paperSize = 'Custom';
  let printerConfig: GatewayPrinterConfigResponse = {};

  try {
    if (!isZebraPrinter) {
      try {
        printerConfig = await fetchGatewayPrinterConfig(params.printerName);
        if (typeof printerConfig.paperSize === 'string' && printerConfig.paperSize.trim()) {
          paperSize = printerConfig.paperSize.trim();
        }
      } catch {
        // fall back to default label size when printer details cannot be read
      }
    }

    const geometry = resolveZebraLabelGeometry(printerConfig as ZebraLabelPrinterConfig);
    const capabilityProfile = resolvePrinterCapabilityProfile({
      printerConfig,
      printerName: params.printerName,
    });
    const labelsElement = buildLabelsPrintElement(params);

    if (isZebraPrinter) {
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
          dispatchMs: dispatchResult.durationMs,
          generationMs: zplResult.durationMs,
          jobName,
          labelCount,
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
      ),
    );
    const dispatchResult = await measureAsync(() =>
      gatewayPrintPdf(pdfResult.result, params.printerName, jobName, {
        orientation: 'landscape',
        paperSize,
        scale: 'noscale',
      }),
    );
    recordLabelPrintTelemetry({
      capabilityProfile,
      dispatchMs: dispatchResult.durationMs,
      generationMs: pdfResult.durationMs,
      jobName,
      labelCount,
      payloadBytes: pdfResult.result.size,
      printerName: params.printerName,
      strategy: 'gateway_pdf',
      totalMs: nowMs() - printStart,
    });
    return { mode: 'pdf' };
  } finally {
    clearLabelGraphicCache();
  }
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
