import type { PrinterCapabilityProfile } from './label-printing-spec';

export const LABEL_PRINT_METRIC_EVENT = 'lis:label-print-metric';

export type LabelPrintStrategy = 'gateway_pdf' | 'zebra_raw_zpl';

export type LabelPrintTelemetryEvent = {
  capabilityProfile: Pick<
    PrinterCapabilityProfile,
    | 'dpiClass'
    | 'dpiX'
    | 'dpiY'
    | 'hasExplicitDpi'
    | 'hasExplicitMediaSize'
    | 'isZebra'
    | 'pageHeightMm'
    | 'pageWidthMm'
    | 'preferRawZpl'
    | 'supportsRawZpl'
  >;
  dispatchMs: number;
  configFetchMs?: number | null;
  configSource?: 'fallback-empty' | 'inflight' | 'memory-cache' | 'network' | null;
  generationMs: number;
  jobName: string;
  labelCount: number;
  overheadMs?: number | null;
  payloadBytes: number;
  printerName: string;
  strategy: LabelPrintStrategy;
  totalMs: number;
};

declare global {
  interface Window {
    __LIS_LABEL_PRINT_METRICS__?: LabelPrintTelemetryEvent[];
  }

  interface WindowEventMap {
    'lis:label-print-metric': CustomEvent<LabelPrintTelemetryEvent>;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${roundTo(bytes / 1024)} KB`;
  }
  return `${roundTo(bytes / (1024 * 1024))} MB`;
}

export function formatDuration(durationMs: number): string {
  return `${roundTo(durationMs)} ms`;
}

export async function measureAsync<T>(
  run: () => Promise<T> | T,
): Promise<{ durationMs: number; result: T }> {
  const start = nowMs();
  const result = await run();
  return {
    durationMs: nowMs() - start,
    result,
  };
}

export function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function recordLabelPrintTelemetry(event: LabelPrintTelemetryEvent): void {
  const normalized: LabelPrintTelemetryEvent = {
    ...event,
    configFetchMs:
      event.configFetchMs == null ? null : roundTo(event.configFetchMs),
    dispatchMs: roundTo(event.dispatchMs),
    generationMs: roundTo(event.generationMs),
    overheadMs:
      event.overheadMs == null ? null : roundTo(event.overheadMs),
    totalMs: roundTo(event.totalMs),
  };

  if (typeof window !== 'undefined') {
    const nextMetrics = [...(window.__LIS_LABEL_PRINT_METRICS__ ?? []), normalized].slice(-100);
    window.__LIS_LABEL_PRINT_METRICS__ = nextMetrics;
    window.dispatchEvent(
      new CustomEvent<LabelPrintTelemetryEvent>(LABEL_PRINT_METRIC_EVENT, {
        detail: normalized,
      }),
    );
  }

  console.info('[label-print]', normalized);
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function roundTo(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
