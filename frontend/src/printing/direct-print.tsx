import React from 'react';
import { createRoot } from 'react-dom/client';
import type { DepartmentDto, OrderDto } from '../api/client';
import { OrderReceipt } from '../components/Print/OrderReceipt';
import { AllSampleLabels } from '../components/Print/SampleLabel';
import printCss from '../components/Print/print.css?raw';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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

type GatewayPrintersResponse = {
  printers?: string[];
};

type GatewayStatusResponse = {
  status?: string;
  service?: string;
};

export function isVirtualSavePrinterName(name: string): boolean {
  const value = name.trim().toLowerCase();
  return VIRTUAL_SAVE_PRINTER_KEYWORDS.some((keyword) => value.includes(keyword));
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

async function gatewayPrintPdf(blob: Blob, printerName: string, jobName: string): Promise<void> {
  const base64 = await blobToBase64(blob);
  await axios.post(
    `${GATEWAY_URL}/local/print`,
    {
      printerName,
      pdfBase64: base64,
      jobName,
    },
    { timeout: GATEWAY_PRINT_TIMEOUT_MS },
  );
}

async function convertHtmlToPdf(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
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
}): Promise<void> {
  const jobName = `Labels-${params.order.orderNumber || params.order.id}`;
  const blob = await renderAndConvertOffscreen(
    <div className="print-container">
      <style>{printCss}</style>
      <AllSampleLabels
        order={params.order}
        labelSequenceBy={params.labelSequenceBy}
        departments={params.departments}
      />
    </div>,
  );
  await gatewayPrintPdf(blob, params.printerName, jobName);
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
