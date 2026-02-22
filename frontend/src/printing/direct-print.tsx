import { createRoot } from 'react-dom/client';
import type { DepartmentDto, OrderDto } from '../api/client';
import { OrderReceipt } from '../components/Print/OrderReceipt';
import { AllSampleLabels } from '../components/Print/SampleLabel';
import printCss from '../components/Print/print.css?raw';

const QZ_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';
const QZ_SCRIPT_TIMEOUT_MS = 10000;
const QZ_CONNECT_TIMEOUT_MS = 10000;
const QZ_PRINTER_LOOKUP_TIMEOUT_MS = 7000;
const VIRTUAL_SAVE_PRINTER_KEYWORDS = [
  'print to pdf',
  'pdfcreator',
  'pdf architect',
  'xps document writer',
  'onenote',
];

export function isVirtualSavePrinterName(name: string): boolean {
  const value = name.trim().toLowerCase();
  return VIRTUAL_SAVE_PRINTER_KEYWORDS.some((keyword) => value.includes(keyword));
}

declare global {
  interface Window {
    qz?: {
      websocket: {
        isActive: () => boolean;
        connect: (opts?: { retries?: number; delay?: number }) => Promise<void>;
      };
      api: {
        setPromiseType: (factory: (resolver: (resolve: (value: unknown) => void, reject: (reason?: unknown) => void) => void) => Promise<unknown>) => void;
      };
      security?: {
        setCertificatePromise?: (factory: (resolve: (certificate: string | null) => void) => void) => void;
        setSignaturePromise?: (factory: () => (toSign: string) => Promise<string>) => void;
      };
      printers: {
        find: (name?: string) => Promise<string | string[]>;
      };
      configs: {
        create: (printerName: string, options?: { jobName?: string }) => unknown;
      };
      print: (config: unknown, data: Array<Record<string, unknown>>) => Promise<void>;
      __medilisConfigured?: boolean;
    };
  }
}

let qzLoadPromise: Promise<NonNullable<Window['qz']>> | null = null;

async function loadQz(): Promise<NonNullable<Window['qz']>> {
  if (typeof window === 'undefined') {
    throw new Error('Direct print is only available in browser.');
  }

  if (window.qz) {
    configureQz(window.qz);
    return window.qz;
  }

  if (!qzLoadPromise) {
    qzLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-medilis-qz="1"]');
      if (existing) {
        let timeoutId: number | null = null;
        const cleanup = () => {
          existing.removeEventListener('load', onLoad);
          existing.removeEventListener('error', onError);
          if (timeoutId != null) {
            window.clearTimeout(timeoutId);
          }
        };
        const tryResolve = () => {
          if (!window.qz) return false;
          configureQz(window.qz);
          resolve(window.qz);
          return true;
        };
        const onLoad = () => {
          if (!window.qz) {
            cleanup();
            reject(new Error('QZ Tray script loaded but qz object is missing.'));
            return;
          }
          cleanup();
          configureQz(window.qz);
          resolve(window.qz);
        };
        const onError = () => {
          cleanup();
          reject(new Error('Failed to load QZ Tray script.'));
        };
        if (tryResolve()) {
          cleanup();
          return;
        }
        timeoutId = window.setTimeout(() => {
          cleanup();
          reject(
            new Error(
              'QZ Tray script load timed out. Check internet/firewall/ad-block and ensure CDN access.',
            ),
          );
        }, QZ_SCRIPT_TIMEOUT_MS);
        existing.addEventListener('load', onLoad);
        existing.addEventListener('error', onError);
        return;
      }

      const script = document.createElement('script');
      script.src = QZ_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-medilis-qz', '1');
      const timeoutId = window.setTimeout(() => {
        script.remove();
        reject(
          new Error(
            'QZ Tray script load timed out. Check internet/firewall/ad-block and ensure CDN access.',
          ),
        );
      }, QZ_SCRIPT_TIMEOUT_MS);
      script.onload = () => {
        window.clearTimeout(timeoutId);
        if (!window.qz) {
          reject(new Error('QZ Tray script loaded but qz object is missing.'));
          return;
        }
        configureQz(window.qz);
        resolve(window.qz);
      };
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error('Failed to load QZ Tray script.'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      qzLoadPromise = null;
      throw error;
    });
  }

  return qzLoadPromise;
}

function configureQz(qz: NonNullable<Window['qz']>): void {
  if (qz.__medilisConfigured) return;
  qz.api.setPromiseType((resolver) => new Promise(resolver));
  qz.security?.setCertificatePromise?.((resolve) => resolve(null));
  qz.security?.setSignaturePromise?.(() => async () => '');
  qz.__medilisConfigured = true;
}

async function ensureQzConnected(qz: NonNullable<Window['qz']>): Promise<void> {
  if (qz.websocket.isActive()) return;
  await withTimeout(
    qz.websocket.connect({ retries: 1, delay: 0.5 }),
    QZ_CONNECT_TIMEOUT_MS,
    'Connection to QZ Tray timed out. Open QZ Tray and allow the certificate/security prompt.',
  );
}

async function ensurePrinter(qz: NonNullable<Window['qz']>, printerName: string): Promise<string> {
  const normalized = printerName.trim();
  if (!normalized) {
    throw new Error('Printer name is empty. Set printer name in Settings > Printing.');
  }

  const requestedLower = normalized.toLowerCase();
  try {
    return await withTimeout(
      qz.printers.find(normalized),
      QZ_PRINTER_LOOKUP_TIMEOUT_MS,
      `Printer lookup timed out for "${normalized}".`,
    );
  } catch {
    const available = await listInstalledPrinters(qz);
    if (available.length > 0) {
      const exactInsensitive = available.find((name) => name.toLowerCase() === requestedLower);
      if (exactInsensitive) {
        return exactInsensitive;
      }
      const contains = available.find((name) => name.toLowerCase().includes(requestedLower));
      if (contains) {
        return contains;
      }
      const reverseContains = available.find((name) => requestedLower.includes(name.toLowerCase()));
      if (reverseContains) {
        return reverseContains;
      }
    }

    if (available.length > 0) {
      const preview = available.slice(0, 8).join(', ');
      const more = available.length > 8 ? ', ...' : '';
      throw new Error(
        `Printer "${normalized}" was not found. Available printers: ${preview}${more}`,
      );
    }
    throw new Error(
      `Printer "${normalized}" was not found and QZ returned no installed printers.`,
    );
  }
}

async function listInstalledPrinters(qz: NonNullable<Window['qz']>): Promise<string[]> {
  try {
    const raw = await withTimeout(
      qz.printers.find(),
      QZ_PRINTER_LOOKUP_TIMEOUT_MS,
      'Printer list request timed out.',
    );
    if (Array.isArray(raw)) {
      return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    }
    if (typeof raw === 'string' && raw.trim()) {
      return [raw.trim()];
    }
    return [];
  } catch {
    return [];
  }
}

function buildDocumentHtml(contentHtml: string, title: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${printCss}</style>
  </head>
  <body>
    ${contentHtml}
  </body>
</html>`;
}

async function renderOffscreen(element: JSX.Element): Promise<string> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.opacity = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(element);
    await waitForRenderAndEffects();
    return host.innerHTML;
  } finally {
    root.unmount();
    host.remove();
  }
}

async function waitForRenderAndEffects(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => setTimeout(resolve, 120));
}

async function qzPrintHtml(html: string, printerName: string, jobName: string): Promise<void> {
  const qz = await loadQz();
  await ensureQzConnected(qz);
  const printer = await ensurePrinter(qz, printerName);
  const config = qz.configs.create(printer, { jobName });
  await qz.print(config, [{ type: 'html', format: 'plain', data: html }]);
}

async function qzPrintPdf(blob: Blob, printerName: string, jobName: string): Promise<void> {
  const qz = await loadQz();
  await ensureQzConnected(qz);
  const printer = await ensurePrinter(qz, printerName);
  const base64 = await blobToBase64(blob);
  const config = qz.configs.create(printer, { jobName });
  await qz.print(config, [
    {
      type: 'pixel',
      format: 'pdf',
      flavor: 'base64',
      data: base64,
    },
  ]);
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
  const contentHtml = await renderOffscreen(
    <div className="print-container">
      <OrderReceipt order={params.order} labName={params.labName} />
    </div>,
  );
  const html = buildDocumentHtml(contentHtml, `Receipt-${params.order.orderNumber || params.order.id}`);
  await qzPrintHtml(html, params.printerName, `Receipt-${params.order.orderNumber || params.order.id}`);
}

export async function directPrintLabels(params: {
  order: OrderDto;
  printerName: string;
  labelSequenceBy?: 'tube_type' | 'department';
  departments?: DepartmentDto[];
}): Promise<void> {
  const contentHtml = await renderOffscreen(
    <div className="print-container">
      <AllSampleLabels
        order={params.order}
        labelSequenceBy={params.labelSequenceBy}
        departments={params.departments}
      />
    </div>,
  );
  const html = buildDocumentHtml(contentHtml, `Labels-${params.order.orderNumber || params.order.id}`);
  await qzPrintHtml(html, params.printerName, `Labels-${params.order.orderNumber || params.order.id}`);
}

export async function directPrintReportPdf(params: {
  orderId: string;
  blob: Blob;
  printerName: string;
}): Promise<void> {
  await qzPrintPdf(params.blob, params.printerName, `Report-${params.orderId}`);
}

export async function checkDirectPrintConnection(printerName?: string): Promise<void> {
  const qz = await loadQz();
  await ensureQzConnected(qz);
  if (printerName?.trim()) {
    await ensurePrinter(qz, printerName);
  }
}

export function getDirectPrintErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Direct print failed. Make sure QZ Tray is installed and running.';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
