import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckOutlined,
  EditOutlined,
  FilePdfOutlined,
  MessageOutlined,
  MoreOutlined,
  PrinterOutlined,
  SearchOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  downloadTestResultsPDF,
  enterResult,
  getAntibiotics,
  getReportActionFlags,
  getLabSettings,
  getOrder,
  getWorklistStats,
  logReportAction,
  searchOrdersHistory,
  updateOrderPayment,
  type AntibioticDto,
  type DownloadTestResultsPdfProfilingHeaders,
  type ReportActionFlagsDto,
  type ReportActionKind,
  type OrderHistoryItemDto,
  type OrderResultStatus,
  type OrderDto,
  type OrderTestDto,
  type TestParameterDefinition,
  type WorklistStats,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { CultureSensitivityEditor } from '../components/CultureSensitivityEditor';
import { PrintPreviewModal } from '../components/Print';
import { WorklistStatusDashboard } from '../components/WorklistStatusDashboard';
import {
  buildCultureAntibioticOptions,
  buildCultureResultPayloadFromForm,
  formatCultureResultSummary,
  normalizeCultureResultForForm,
} from '../utils/culture-sensitivity';
import { buildPublicResultUrl } from '../utils/public-result-link';
import { normalizeResultFlag } from '../utils/result-flag';
import {
  directPrintReceipt,
  directPrintReportPdf,
  getDirectPrintErrorMessage,
  isVirtualSavePrinterName,
} from '../printing/direct-print';
import './QueuePages.css';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const REPORT_PDF_CACHE_TTL_MS = 30 * 60 * 1000;
const REPORT_PDF_CACHE_MAX_ENTRIES = 40;
const REPORT_DESIGN_FINGERPRINT_STALE_MS = 60 * 1000;
const REPORT_BROWSER_PRINT_LOAD_TIMEOUT_MS = 15 * 1000;
const REPORT_BROWSER_PRINT_FALLBACK_CLEANUP_MS = 5 * 60 * 1000;
const REPORT_PRINT_PROFILE_MAX_ENTRIES = 100;

type EditResultMode = 'SINGLE' | 'PANEL';
type ReportStatusFilter = 'ALL' | 'PENDING' | 'COMPLETED' | 'VERIFIED' | 'REJECTED';
type ReportActionFlagField = 'pdf' | 'print' | 'whatsapp' | 'viber';
type ResultsPdfCacheEntry = {
  blob: Blob;
  cachedAt: number;
  lastAccessedAt: number;
  reportDesignFingerprint: string;
};

type ResultsPdfFetchResult = {
  blob: Blob;
  source: 'frontend-cache' | 'network';
  inFlightJoin: boolean;
  fetchStartedAtMs: number | null;
  fetchCompletedAtMs: number;
  profilingHeaders: DownloadTestResultsPdfProfilingHeaders | null;
};

type BrowserPrintInstrumentation = {
  onFrameLoaded?: () => void;
  onPrintInvoked?: () => void;
};

type ParsedReportPdfProfiling = {
  correlationId: string | null;
  totalMs: number | null;
  snapshotMs: number | null;
  verifierLookupMs: number | null;
  assetsMs: number | null;
  htmlMs: number | null;
  renderMs: number | null;
  fallbackMs: number | null;
  cacheHit: boolean | null;
  inFlightJoin: boolean | null;
};

type ReportPrintProfileRecord = {
  attemptId: string;
  createdAt: string;
  orderId: string;
  orderNumber: string | null;
  patientName: string | null;
  attemptNumber: number;
  configuredMode: 'browser' | 'direct_gateway';
  resultPath: 'browser' | 'direct_gateway' | 'download_fallback' | 'failed';
  success: boolean;
  fetchSource: 'frontend-cache' | 'network';
  frontendInFlightJoin: boolean;
  backendCorrelationId: string | null;
  backendCacheHit: boolean | null;
  backendInFlightJoin: boolean | null;
  backendFallbackUsed: boolean | null;
  pdfSizeBytes: number | null;
  clickToFetchStartMs: number | null;
  fetchDurationMs: number | null;
  settingsLoadMs: number | null;
  clickToBlobReadyMs: number | null;
  backendTotalMs: number | null;
  backendSnapshotMs: number | null;
  backendVerifierLookupMs: number | null;
  backendAssetsMs: number | null;
  backendHtmlMs: number | null;
  backendRenderMs: number | null;
  backendFallbackMs: number | null;
  clickToPreviewReadyMs: number | null;
  clickToPrintInvokeMs: number | null;
  directPrintDurationMs: number | null;
  clickToDirectPrintCompleteMs: number | null;
  totalMs: number;
  classification: string;
  errorMessage: string | null;
};

declare global {
  interface Window {
    __lisReportPrintProfiles?: ReportPrintProfileRecord[];
    __lisReportPrintProfilesTable?: () => Array<Record<string, unknown>>;
  }
}

const REPORT_STATUS_TO_RESULT_STATUS: Record<Exclude<ReportStatusFilter, 'ALL'>, OrderResultStatus> = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
};

const ACTION_FLAG_FIELD_MAP: Record<ReportActionKind, ReportActionFlagField> = {
  PDF: 'pdf',
  PRINT: 'print',
  WHATSAPP: 'whatsapp',
  VIBER: 'viber',
};

type EditResultContext = {
  editMode: EditResultMode;
  orderTestId: string;
  orderNumber: string;
  patientName: string;
  patientSex: string | null;
  testCode: string;
  testName: string;
  testUnit: string | null;
  normalMin: number | null;
  normalMax: number | null;
  normalText: string | null;
  resultEntryType: 'NUMERIC' | 'QUALITATIVE' | 'TEXT' | 'CULTURE_SENSITIVITY';
  resultTextOptions: { value: string; flag?: string | null; isDefault?: boolean }[] | null;
  allowCustomResultText: boolean;
  parameterDefinitions: TestParameterDefinition[];
  wasVerified: boolean;
  targetItems: OrderTestDto[];
};

type ExpandedOrderTestRow = {
  key: string;
  sampleLabel: string;
  testCode: string;
  testName: string;
  resultPreview: string;
  status: OrderTestDto['status'];
  flag: OrderTestDto['flag'];
  verifiedAt: string | null;
  raw: OrderTestDto;
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'blue',
  COLLECTED: 'cyan',
  IN_PROGRESS: 'orange',
  COMPLETED: 'green',
  VERIFIED: 'green',
  CANCELLED: 'red',
};

const ORDER_TEST_STATUS_COLORS: Record<string, string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  COMPLETED: 'blue',
  VERIFIED: 'green',
  REJECTED: 'red',
};

const RESULT_FLAG_META: Record<string, { color: string; label: string }> = {
  N: { color: 'green', label: 'Normal' },
  H: { color: 'orange', label: 'High' },
  L: { color: 'blue', label: 'Low' },
  POS: { color: 'red', label: 'Positive' },
  NEG: { color: 'green', label: 'Negative' },
  ABN: { color: 'purple', label: 'Abnormal' },
};

function cleanPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

function sanitizeFilenamePart(value: string | null | undefined, fallback: string): string {
  const cleaned = (value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return cleaned || fallback;
}

function buildResultsPdfFilename(
  order: Pick<OrderHistoryItemDto, 'orderNumber' | 'registeredAt' | 'patient'> | undefined,
  orderId: string,
): string {
  const patientName = sanitizeFilenamePart(order?.patient?.fullName, 'Unknown Patient');
  const orderDate = dayjs(order?.registeredAt);
  const datePart = orderDate.isValid() ? orderDate.format('YYYY-MM-DD') : 'unknown-date';
  const orderNumber = sanitizeFilenamePart(order?.orderNumber, orderId.substring(0, 8));
  return `${patientName} - ${datePart} - ${orderNumber}.pdf`;
}

function cleanupResultsBrowserPrintFrame(iframe: HTMLIFrameElement, url: string): void {
  try {
    iframe.remove();
  } catch {
    // ignore cleanup failures
  }
  window.URL.revokeObjectURL(url);
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalBoolean(value: string | undefined): boolean | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function parseReportPdfProfilingHeaders(
  headers: DownloadTestResultsPdfProfilingHeaders | null | undefined,
): ParsedReportPdfProfiling | null {
  if (!headers) return null;

  const parsed: ParsedReportPdfProfiling = {
    correlationId: headers.correlationId?.trim() || null,
    totalMs: parseOptionalNumber(headers.totalMs),
    snapshotMs: parseOptionalNumber(headers.snapshotMs),
    verifierLookupMs: parseOptionalNumber(headers.verifierLookupMs),
    assetsMs: parseOptionalNumber(headers.assetsMs),
    htmlMs: parseOptionalNumber(headers.htmlMs),
    renderMs: parseOptionalNumber(headers.renderMs),
    fallbackMs: parseOptionalNumber(headers.fallbackMs),
    cacheHit: parseOptionalBoolean(headers.cacheHit),
    inFlightJoin: parseOptionalBoolean(headers.inFlightJoin),
  };

  const hasData = Object.values(parsed).some((value) => value !== null);
  return hasData ? parsed : null;
}

function createReportPrintAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `print-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function classifyReportPrintBottleneck(profile: Omit<ReportPrintProfileRecord, 'classification'>): string {
  const backendMs = profile.backendTotalMs ?? 0;
  const transportMs =
    profile.fetchDurationMs != null && profile.backendTotalMs != null
      ? Math.max(0, profile.fetchDurationMs - profile.backendTotalMs)
      : 0;
  const previewMs =
    profile.clickToPrintInvokeMs != null && profile.clickToBlobReadyMs != null
      ? Math.max(0, profile.clickToPrintInvokeMs - profile.clickToBlobReadyMs)
      : 0;
  const gatewayMs = profile.directPrintDurationMs ?? 0;
  const dominant = Math.max(backendMs, transportMs, previewMs, gatewayMs);

  if (profile.resultPath === 'direct_gateway' && gatewayMs >= Math.max(500, dominant * 0.7)) {
    return 'gateway print bound';
  }
  if (profile.resultPath !== 'direct_gateway' && previewMs >= Math.max(500, dominant * 0.7)) {
    return 'browser preview bound';
  }
  if (backendMs >= Math.max(500, dominant * 0.7)) {
    return 'backend render bound';
  }
  if (transportMs >= Math.max(500, dominant * 0.7)) {
    return 'network/transfer bound';
  }

  const significantPhases = [backendMs, transportMs, previewMs, gatewayMs].filter((value) => value >= 300);
  if (significantPhases.length >= 2) {
    return 'mixed';
  }

  return 'mixed';
}

function summarizeReportPrintProfile(profile: ReportPrintProfileRecord): Record<string, unknown> {
  return {
    attemptId: profile.attemptId,
    orderNumber: profile.orderNumber,
    attemptNumber: profile.attemptNumber,
    configuredMode: profile.configuredMode,
    resultPath: profile.resultPath,
    fetchSource: profile.fetchSource,
    frontendInFlightJoin: profile.frontendInFlightJoin,
    backendCacheHit: profile.backendCacheHit,
    backendInFlightJoin: profile.backendInFlightJoin,
    pdfKB: profile.pdfSizeBytes != null ? Number((profile.pdfSizeBytes / 1024).toFixed(1)) : null,
    clickToFetchStartMs: profile.clickToFetchStartMs,
    fetchDurationMs: profile.fetchDurationMs,
    settingsLoadMs: profile.settingsLoadMs,
    backendTotalMs: profile.backendTotalMs,
    clickToBlobReadyMs: profile.clickToBlobReadyMs,
    clickToPreviewReadyMs: profile.clickToPreviewReadyMs,
    clickToPrintInvokeMs: profile.clickToPrintInvokeMs,
    directPrintDurationMs: profile.directPrintDurationMs,
    clickToDirectPrintCompleteMs: profile.clickToDirectPrintCompleteMs,
    totalMs: profile.totalMs,
    classification: profile.classification,
    success: profile.success,
    errorMessage: profile.errorMessage,
  };
}

function appendReportPrintProfile(profile: ReportPrintProfileRecord): void {
  if (typeof window === 'undefined') {
    return;
  }

  const existing = window.__lisReportPrintProfiles ?? [];
  const next = [...existing, profile].slice(-REPORT_PRINT_PROFILE_MAX_ENTRIES);
  window.__lisReportPrintProfiles = next;
  window.__lisReportPrintProfilesTable = () => next.map(summarizeReportPrintProfile);

  console.info('[ReportsPage] Report print profiling', profile);
  console.table([summarizeReportPrintProfile(profile)]);
}

function printResultsPdfInBrowser(
  blob: Blob,
  instrumentation?: BrowserPrintInstrumentation,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const url = window.URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    let settled = false;
    let loadTimeoutId: number | null = null;
    let cleanupTimeoutId: number | null = null;

    const scheduleCleanup = (delayMs: number) => {
      if (cleanupTimeoutId !== null) {
        window.clearTimeout(cleanupTimeoutId);
      }
      cleanupTimeoutId = window.setTimeout(() => {
        cleanupResultsBrowserPrintFrame(iframe, url);
      }, delayMs);
    };

    const settle = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
      }
      if (error) {
        if (cleanupTimeoutId !== null) {
          window.clearTimeout(cleanupTimeoutId);
        }
        cleanupResultsBrowserPrintFrame(iframe, url);
        reject(error);
        return;
      }
      resolve();
    };

    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    iframe.onload = () => {
      const targetWindow = iframe.contentWindow;
      if (!targetWindow) {
        settle(new Error('Browser print is unavailable in this browser.'));
        return;
      }
      instrumentation?.onFrameLoaded?.();

      const handleAfterPrint = () => {
        scheduleCleanup(250);
      };

      targetWindow.addEventListener('afterprint', handleAfterPrint, { once: true });

      window.setTimeout(() => {
        try {
          targetWindow.focus();
          instrumentation?.onPrintInvoked?.();
          targetWindow.print();
          scheduleCleanup(REPORT_BROWSER_PRINT_FALLBACK_CLEANUP_MS);
          settle();
        } catch {
          targetWindow.removeEventListener('afterprint', handleAfterPrint);
          settle(new Error('Browser print could not be started.'));
        }
      }, 250);
    };

    iframe.onerror = () => {
      settle(new Error('Failed to load the report into the browser print dialog.'));
    };

    loadTimeoutId = window.setTimeout(() => {
      settle(new Error('Timed out while preparing the report for browser print.'));
    }, REPORT_BROWSER_PRINT_LOAD_TIMEOUT_MS);

    iframe.src = url;
    document.body.appendChild(iframe);
  });
}

function formatDisplayDecimal(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  if (!/^[-+]?\d+(\.\d+)?$/.test(raw)) return raw;
  return raw.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/^\+/, '');
}

function resolveSexSpecificNormalText(
  test:
    | {
      normalText?: string | null;
      normalTextMale?: string | null;
      normalTextFemale?: string | null;
    }
    | null
    | undefined,
  patientSex: string | null | undefined,
): string | null {
  if (!test) return null;
  const sex = String(patientSex ?? '').trim().toUpperCase();
  if ((sex === 'M' || sex === 'MALE') && test.normalTextMale && test.normalTextMale.length > 0) {
    return test.normalTextMale;
  }
  if ((sex === 'F' || sex === 'FEMALE') && test.normalTextFemale && test.normalTextFemale.length > 0) {
    return test.normalTextFemale;
  }
  if (test.normalText && test.normalText.length > 0) {
    return test.normalText;
  }
  return null;
}

function formatReferenceRange(
  normalText: string | null | undefined,
  normalMin: string | number | null | undefined,
  normalMax: string | number | null | undefined,
  unit?: string | null,
): string {
  if (normalText && normalText.length > 0) return normalText;
  const min = formatDisplayDecimal(normalMin);
  const max = formatDisplayDecimal(normalMax);
  if (min === '-' && max === '-') return '-';
  return `${min} - ${max}${unit ? ` ${unit}` : ''}`;
}

function buildResultsMessage(
  order: Pick<OrderHistoryItemDto, 'id' | 'orderNumber' | 'registeredAt' | 'patient'>,
  labName?: string | null,
  labSubdomain?: string | null,
): string {
  const patientName = order.patient?.fullName?.trim() || 'بەڕێز نەخۆش';
  const orderDateTime = dayjs(order.registeredAt).format('YYYY-MM-DD HH:mm');
  const displayLabName = (labName ?? '').trim() || 'تاقیگەی ئێمە';

  const resultUrl = buildPublicResultUrl(order.id, {
    labSubdomain: labSubdomain ?? null,
    apiBaseUrl: import.meta.env.VITE_API_URL || window.location.origin,
  });

  return [
    `سڵاو بەێز ${patientName}`,
    `بۆ بینینی ئەنجامی پشكنینەكانت كە ئەنجامت داوە لە بەرواری (${orderDateTime}) دەتوانی لەم لینكەی خوارەوە ببینی.`,
    '',
    resultUrl,
    '',
    `سوپاس بۆ هەڵبژاردنی تاقیگەی ${displayLabName}`,
  ].join('\n');
}

function formatOrderTestResultPreview(orderTest: OrderTestDto, allTests: OrderTestDto[] = []): string {
  if (orderTest.test?.type === 'PANEL') {
    const children = allTests.filter((t) => t.parentOrderTestId === orderTest.id);
    const total = children.length;
    const completed = children.filter(
      (t) => t.status === 'COMPLETED' || t.status === 'VERIFIED',
    ).length;
    if (total === 0) return 'No tests';
    const percent = Math.round((completed / total) * 100);
    return `${completed}/${total} done (${percent}%)`;
  }

  const cultureSummary = formatCultureResultSummary(orderTest.cultureResult);
  if (cultureSummary) {
    return cultureSummary;
  }

  const parameters = orderTest.resultParameters;
  if (parameters && Object.keys(parameters).length > 0) {
    return Object.keys(parameters).join(', ');
  }

  if (orderTest.resultValue !== null && orderTest.resultValue !== undefined) {
    const formattedValue = formatDisplayDecimal(orderTest.resultValue);
    if (formattedValue === '-') {
      return '-';
    }
    const unit = orderTest.test?.unit ? ` ${orderTest.test.unit}` : '';
    return `${formattedValue}${unit}`;
  }

  if (orderTest.resultText?.trim()) {
    return orderTest.resultText.trim();
  }

  return '-';
}

function isEtaLoadingStatus(status: OrderTestDto['status']): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS';
}

function toValidTimestamp(input?: string | null): number | null {
  if (!input) return null;
  const ms = dayjs(input).valueOf();
  return Number.isFinite(ms) ? ms : null;
}

function getPanelChildren(parent: OrderTestDto, allTests: OrderTestDto[]): OrderTestDto[] {
  return allTests.filter((test) => test.parentOrderTestId === parent.id);
}

function resolveExpectedMinutes(row: ExpandedOrderTestRow, allTests: OrderTestDto[]): number | null {
  const ownExpected = row.raw.test?.expectedCompletionMinutes ?? null;
  if (row.raw.test?.type !== 'PANEL') {
    return ownExpected;
  }
  if (ownExpected && ownExpected > 0) {
    return ownExpected;
  }
  const maxChildExpected = getPanelChildren(row.raw, allTests).reduce((max, child) => {
    const childExpected = child.test?.expectedCompletionMinutes ?? null;
    if (!childExpected || childExpected <= 0) return max;
    return Math.max(max, childExpected);
  }, 0);
  return maxChildExpected > 0 ? maxChildExpected : null;
}

function getStartTime(order: OrderDto): number | null {
  return toValidTimestamp(order.registeredAt);
}

function getFinishTime(row: ExpandedOrderTestRow, allTests: OrderTestDto[]): number | null {
  if (row.raw.test?.type === 'PANEL') {
    const childTimes = getPanelChildren(row.raw, allTests)
      .map((child) => toValidTimestamp(child.resultedAt ?? child.verifiedAt))
      .filter((value): value is number => value !== null);
    if (childTimes.length > 0) {
      return Math.max(...childTimes);
    }
  }
  return toValidTimestamp(row.raw.resultedAt ?? row.raw.verifiedAt);
}

function computeEta(params: {
  startMs: number | null;
  expectedMinutes: number | null;
  nowMs: number;
  finishMs: number | null;
}): {
  percent: number;
  isOverdue: boolean;
  remainingMinutes: number;
  overdueMinutes: number;
  dueAtMs: number;
} | null {
  const { startMs, expectedMinutes, nowMs, finishMs } = params;
  if (startMs === null || !expectedMinutes || expectedMinutes <= 0) return null;

  const totalMs = expectedMinutes * 60 * 1000;
  const dueAtMs = startMs + totalMs;
  const referenceNowMs = finishMs ?? nowMs;
  const elapsedMs = Math.max(0, referenceNowMs - startMs);
  const percent = Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)));
  const overdueMs = Math.max(0, referenceNowMs - dueAtMs);
  const remainingMs = Math.max(0, dueAtMs - referenceNowMs);

  return {
    percent,
    isOverdue: overdueMs > 0,
    overdueMinutes: Math.ceil(overdueMs / (60 * 1000)),
    remainingMinutes: Math.ceil(remainingMs / (60 * 1000)),
    dueAtMs,
  };
}

function getPanelChildProgress(row: ExpandedOrderTestRow, allTests: OrderTestDto[]): string | null {
  if (row.raw.test?.type !== 'PANEL') return null;
  const children = getPanelChildren(row.raw, allTests);
  const total = children.length;
  if (total === 0) return 'No child tests';
  const done = children.filter(
    (test) => test.status === 'COMPLETED' || test.status === 'VERIFIED',
  ).length;
  return `${done}/${total} child tests done`;
}

function getRootOrderTests(order: OrderDto): OrderTestDto[] {
  return (order.samples ?? [])
    .flatMap((sample) => sample.orderTests ?? [])
    .filter((test) => !test.parentOrderTestId);
}

function getResultAvailability(
  order: Pick<
    OrderHistoryItemDto,
    'testsCount' | 'readyTestsCount' | 'verifiedTestsCount' | 'resultStatus' | 'reportReady'
  >,
): { ready: boolean; completed: number; total: number } {
  const total = Number(order.testsCount ?? 0) || 0;
  const completed = Number(order.verifiedTestsCount ?? order.readyTestsCount ?? 0) || 0;
  const ready =
    order.resultStatus === 'VERIFIED' ||
    (total > 0 && completed === total);
  return { ready, completed, total };
}

function extractApiErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return null;
  }
  const response = (error as { response?: { data?: { message?: string | string[] } } }).response;
  const rawMessage = response?.data?.message;
  if (Array.isArray(rawMessage)) {
    return rawMessage.filter((entry) => typeof entry === 'string').join(', ') || null;
  }
  return typeof rawMessage === 'string' && rawMessage.trim().length > 0 ? rawMessage : null;
}

async function extractApiErrorMessageAsync(error: unknown): Promise<string | null> {
  const direct = extractApiErrorMessage(error);
  if (direct) return direct;
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return null;
  }

  const response = (
    error as { response?: { data?: unknown } }
  ).response;
  const payload = response?.data;
  if (!(payload instanceof Blob)) {
    return null;
  }

  try {
    const text = await payload.text();
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) {
      return parsed.message.filter((entry) => typeof entry === 'string').join(', ') || null;
    }
    return typeof parsed.message === 'string' && parsed.message.trim().length > 0
      ? parsed.message
      : null;
  } catch {
    return null;
  }
}

function getOrderTestRows(order: OrderDto): ExpandedOrderTestRow[] {
  const rows: ExpandedOrderTestRow[] = [];
  const allTestsInOrder = (order.samples ?? []).flatMap((s) => s.orderTests ?? []);

  for (const sample of order.samples ?? []) {
    const sampleLabel = sample.barcode || sample.id.substring(0, 8);
    for (const orderTest of sample.orderTests ?? []) {
      // Do not show panel child tests in expandable rows; they are managed in the edit popup.
      if (orderTest.parentOrderTestId) {
        continue;
      }
      rows.push({
        key: orderTest.id,
        sampleLabel,
        testCode: orderTest.test?.code || '-',
        testName: orderTest.test?.name || '-',
        resultPreview: formatOrderTestResultPreview(orderTest, allTestsInOrder),
        status: orderTest.status,
        flag: orderTest.flag,
        verifiedAt: orderTest.verifiedAt,
        raw: orderTest,
      });
    }
  }
  return rows;
}

export function ReportsPage() {
  const { lab } = useAuth();
  const screens = useBreakpoint();
  const isCompactActions = !screens.lg;
  const isDark = useTheme().theme === 'dark';

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderHistoryItemDto[]>([]);
  const [antibiotics, setAntibiotics] = useState<AntibioticDto[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [orderDetailsCache, setOrderDetailsCache] = useState<Record<string, OrderDto>>({});
  const [orderDetailsLoadingIds, setOrderDetailsLoadingIds] = useState<string[]>([]);
  const [orderDetailsErrors, setOrderDetailsErrors] = useState<Record<string, string>>({});
  const [worklistStats, setWorklistStats] = useState<WorklistStats | null>(null);
  const [actionFlagsByOrderId, setActionFlagsByOrderId] = useState<
    Record<string, ReportActionFlagsDto>
  >({});
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>('ALL');
  const [downloading, setDownloading] = useState<string | null>(null);
  const ordersPageSize = 25;

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState<OrderHistoryItemDto | null>(null);
  const [paymentModalPendingAction, setPaymentModalPendingAction] = useState<(() => Promise<void> | void) | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPreviewOrder, setReceiptPreviewOrder] = useState<OrderDto | null>(null);
  const resultsPdfCacheRef = useRef<Record<string, ResultsPdfCacheEntry>>({});
  const resultsPdfInFlightRef = useRef<Record<string, Promise<ResultsPdfFetchResult>>>({});
  const reportDesignFingerprintRef = useRef<{ value: string; fetchedAt: number }>({
    value: '0',
    fetchedAt: 0,
  });
  const reportDesignFingerprintInFlightRef = useRef<Promise<string> | null>(null);
  const reportPrintAttemptCountsRef = useRef<Record<string, number>>({});

  const [editResultModalOpen, setEditResultModalOpen] = useState(false);
  const [editResultContext, setEditResultContext] = useState<EditResultContext | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editResultForm] = Form.useForm<any>();
  const antibioticById = useMemo(
    () => new Map(antibiotics.map((antibiotic) => [antibiotic.id, antibiotic])),
    [antibiotics],
  );
  const compactCellStyle = { paddingTop: 6, paddingBottom: 6, fontSize: 12 };

  const currentUserRole = useMemo(() => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { role?: string };
      return parsed.role ?? null;
    } catch {
      return null;
    }
  }, []);

  const canAdminEditResults =
    currentUserRole === 'LAB_ADMIN' || currentUserRole === 'SUPER_ADMIN';

  const canReleaseResults = (order: OrderHistoryItemDto): boolean => {
    const availability = getResultAvailability(order);
    return availability.ready && order.paymentStatus === 'paid';
  };

  const markActionFlag = useCallback((orderId: string, action: ReportActionKind) => {
    const field = ACTION_FLAG_FIELD_MAP[action];
    setActionFlagsByOrderId((prev) => {
      const current = prev[orderId] ?? {
        pdf: false,
        print: false,
        whatsapp: false,
        viber: false,
      };
      return {
        ...prev,
        [orderId]: {
          ...current,
          [field]: true,
        },
      };
    });
  }, []);

  const refreshActionFlags = useCallback(async (orderIds: string[]) => {
    if (orderIds.length === 0) {
      setActionFlagsByOrderId({});
      return;
    }
    try {
      const flags = await getReportActionFlags(orderIds);
      setActionFlagsByOrderId(flags);
    } catch {
      setActionFlagsByOrderId({});
    }
  }, []);

  const trackReportAction = useCallback(
    async (orderId: string, action: ReportActionKind) => {
      try {
        await logReportAction(orderId, action);
        markActionFlag(orderId, action);
      } catch (error) {
        console.error('Failed to log report action', error);
      }
    },
    [markActionFlag],
  );

  const getOrderSummaryById = useCallback(
    (orderId: string): OrderHistoryItemDto | null =>
      orders.find((order) => order.id === orderId) ?? null,
    [orders],
  );

  const ensureOrderDetails = useCallback(
    async (
      orderId: string,
      mode: 'auto' | 'retry' = 'auto',
    ): Promise<OrderDto | null> => {
      if (mode === 'auto' && orderDetailsCache[orderId]) {
        return orderDetailsCache[orderId];
      }
      if (mode === 'auto' && orderDetailsLoadingIds.includes(orderId)) {
        return null;
      }
      setOrderDetailsLoadingIds((prev) =>
        prev.includes(orderId) ? prev : [...prev, orderId],
      );
      if (mode === 'retry') {
        setOrderDetailsErrors((prev) => {
          if (!prev[orderId]) return prev;
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
      try {
        const fullOrder = await getOrder(orderId, { view: 'full' });
        setOrderDetailsCache((prev) => ({ ...prev, [orderId]: fullOrder }));
        setOrderDetailsErrors((prev) => {
          if (!prev[orderId]) return prev;
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
        return fullOrder;
      } catch {
        setOrderDetailsErrors((prev) => ({
          ...prev,
          [orderId]: 'Failed to load order details. Please retry.',
        }));
        return null;
      } finally {
        setOrderDetailsLoadingIds((prev) => prev.filter((id) => id !== orderId));
      }
    },
    [orderDetailsCache, orderDetailsLoadingIds],
  );

  const loadOrders = async (
    pageOverride?: number,
    statusFilterOverride?: ReportStatusFilter,
  ) => {
    if (!dateRange[0] || !dateRange[1]) return;
    const targetPage = pageOverride ?? ordersPage;
    const effectiveStatusFilter = statusFilterOverride ?? statusFilter;

    setLoading(true);
    try {
      const [ordersResult, statsResult] = await Promise.all([
        searchOrdersHistory({
          page: targetPage,
          size: ordersPageSize,
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
          search: searchText.trim() || undefined,
          resultStatus: effectiveStatusFilter === 'ALL'
            ? undefined
            : REPORT_STATUS_TO_RESULT_STATUS[effectiveStatusFilter],
        }),
        getWorklistStats().catch(() => null),
      ]);

      const nextOrders = ordersResult?.items || [];
      setOrders(nextOrders);
      setOrdersTotal(Number(ordersResult?.total ?? 0));
      setOrdersPage(Number(ordersResult?.page ?? targetPage));
      if (statsResult) {
        setWorklistStats(statsResult);
      }
      await refreshActionFlags(nextOrders.map((order) => order.id));
    } catch (error) {
      console.error('Failed to load orders:', error);
      message.error('Failed to load orders');
      setOrders([]);
      setOrdersTotal(0);
      setActionFlagsByOrderId({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void getAntibiotics(true)
      .then(setAntibiotics)
      .catch(() => setAntibiotics([]));
  }, []);

  useEffect(() => {
    if (expandedOrderIds.length === 0) return;
    const expandedId = expandedOrderIds[0];
    if (!orders.some((order) => order.id === expandedId)) {
      setExpandedOrderIds([]);
    }
  }, [expandedOrderIds, orders]);

  const hasActiveExpandedEtaRows = useMemo(() => {
    if (expandedOrderIds.length === 0) return false;
    return expandedOrderIds.some((orderId) => {
      const order = orderDetailsCache[orderId];
      if (!order) return false;
      const rootTests = getRootOrderTests(order);
      return rootTests.some((test) => isEtaLoadingStatus(test.status));
    });
  }, [expandedOrderIds, orderDetailsCache]);

  useEffect(() => {
    if (!hasActiveExpandedEtaRows) return;
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveExpandedEtaRows]);

  const triggerPdfDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
  };

  const getReportDesignFingerprint = useCallback(async (): Promise<string> => {
    const now = Date.now();
    const cached = reportDesignFingerprintRef.current;
    if (
      cached.value &&
      now - cached.fetchedAt <= REPORT_DESIGN_FINGERPRINT_STALE_MS
    ) {
      return cached.value;
    }

    if (reportDesignFingerprintInFlightRef.current) {
      return reportDesignFingerprintInFlightRef.current;
    }

    const request = getLabSettings()
      .then((settings) => {
        const nextFingerprint = settings.reportDesignFingerprint || '0';
        if (cached.value && cached.value !== nextFingerprint) {
          resultsPdfCacheRef.current = {};
        }
        reportDesignFingerprintRef.current = {
          value: nextFingerprint,
          fetchedAt: Date.now(),
        };
        return nextFingerprint;
      })
      .catch(() => {
        reportDesignFingerprintRef.current = {
          value: cached.value || '0',
          fetchedAt: Date.now(),
        };
        return cached.value || '0';
      })
      .finally(() => {
        reportDesignFingerprintInFlightRef.current = null;
      });

    reportDesignFingerprintInFlightRef.current = request;
    return request;
  }, []);

  const getResultsPdfBlobDetailed = useCallback(async (
    orderId: string,
    options?: { correlationId?: string },
  ): Promise<ResultsPdfFetchResult> => {
    const reportDesignFingerprint = await getReportDesignFingerprint();
    const now = Date.now();
    const cached = resultsPdfCacheRef.current[orderId];
    if (
      cached &&
      cached.reportDesignFingerprint === reportDesignFingerprint &&
      now - cached.cachedAt <= REPORT_PDF_CACHE_TTL_MS
    ) {
      cached.lastAccessedAt = now;
      return {
        blob: cached.blob,
        source: 'frontend-cache',
        inFlightJoin: false,
        fetchStartedAtMs: null,
        fetchCompletedAtMs: now,
        profilingHeaders: null,
      };
    }

    const inFlight = resultsPdfInFlightRef.current[orderId];
    if (inFlight) {
      const result = await inFlight;
      return {
        ...result,
        inFlightJoin: true,
      };
    }

    const fetchStartedAtMs = Date.now();
    const fetchPromise = downloadTestResultsPDF(orderId, options)
      .then(({ blob, profilingHeaders }) => {
        const cachedAt = Date.now();
        resultsPdfCacheRef.current[orderId] = {
          blob,
          cachedAt,
          lastAccessedAt: cachedAt,
          reportDesignFingerprint,
        };

        const cacheEntries = Object.entries(resultsPdfCacheRef.current);
        if (cacheEntries.length > REPORT_PDF_CACHE_MAX_ENTRIES) {
          cacheEntries
            .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt)
            .slice(0, cacheEntries.length - REPORT_PDF_CACHE_MAX_ENTRIES)
            .forEach(([staleOrderId]) => {
              delete resultsPdfCacheRef.current[staleOrderId];
            });
        }

        return {
          blob,
          source: 'network' as const,
          inFlightJoin: false,
          fetchStartedAtMs,
          fetchCompletedAtMs: cachedAt,
          profilingHeaders,
        };
      })
      .finally(() => {
        delete resultsPdfInFlightRef.current[orderId];
      });

    resultsPdfInFlightRef.current[orderId] = fetchPromise;
    return fetchPromise;
  }, [getReportDesignFingerprint]);

  const getResultsPdfBlob = useCallback(async (orderId: string): Promise<Blob> => {
    const result = await getResultsPdfBlobDetailed(orderId);
    return result.blob;
  }, [getResultsPdfBlobDetailed]);

  const handleDownloadResults = async (
    orderId: string,
    order?: OrderHistoryItemDto,
    options?: { skipPaymentCheck?: boolean },
  ) => {
    const summaryOrder = order ?? getOrderSummaryById(orderId) ?? undefined;
    const skipPaymentCheck = options?.skipPaymentCheck === true;
    if (!skipPaymentCheck && summaryOrder && !canReleaseResults(summaryOrder)) {
      setPaymentModalOrder(summaryOrder);
      setPaymentModalPendingAction(
        () => () => handleDownloadResults(orderId, summaryOrder, { skipPaymentCheck: true }),
      );
      setPaymentModalOpen(true);
      return;
    }

    setDownloading(`results-${orderId}`);
    try {
      const blob = await getResultsPdfBlob(orderId);
      triggerPdfDownload(blob, buildResultsPdfFilename(summaryOrder, orderId));
      message.success('Results report downloaded');
      void trackReportAction(orderId, 'PDF');
    } catch (error: unknown) {
      const is403 =
        error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 403;
      const backendMessage = await extractApiErrorMessageAsync(error);

      if (is403 && summaryOrder) {
        setPaymentModalOrder(summaryOrder);
        setPaymentModalPendingAction(
          () => () => handleDownloadResults(orderId, summaryOrder, { skipPaymentCheck: true }),
        );
        setPaymentModalOpen(true);
      } else {
        message.error(backendMessage || 'Failed to download results report');
      }
    } finally {
      setDownloading(null);
    }
  };

  const handlePrintResults = async (
    orderId: string,
    order?: OrderHistoryItemDto,
    options?: { skipPaymentCheck?: boolean },
  ) => {
    const summaryOrder = (order ?? getOrderSummaryById(orderId) ?? undefined) as OrderHistoryItemDto | undefined;
    const resultsFilename = buildResultsPdfFilename(summaryOrder, orderId);
    const skipPaymentCheck = options?.skipPaymentCheck === true;
    if (!skipPaymentCheck && summaryOrder && !canReleaseResults(summaryOrder)) {
      setPaymentModalOrder(summaryOrder);
      setPaymentModalPendingAction(
        () => () => handlePrintResults(orderId, summaryOrder, { skipPaymentCheck: true }),
      );
      setPaymentModalOpen(true);
      return;
    }

    const attemptStartedAtMs = Date.now();
    const attemptId = createReportPrintAttemptId();
    const attemptNumber = (reportPrintAttemptCountsRef.current[orderId] ?? 0) + 1;
    reportPrintAttemptCountsRef.current[orderId] = attemptNumber;
    let configuredMode: ReportPrintProfileRecord['configuredMode'] = 'browser';
    let resultPath: ReportPrintProfileRecord['resultPath'] = 'failed';
    let fetchResult: ResultsPdfFetchResult | null = null;
    let backendProfile: ParsedReportPdfProfiling | null = null;
    let settingsLoadMs: number | null = null;
    let clickToBlobReadyMs: number | null = null;
    let previewReadyAtMs: number | null = null;
    let printInvokedAtMs: number | null = null;
    let directPrintStartedAtMs: number | null = null;
    let directPrintCompletedAtMs: number | null = null;
    let failureMessage: string | null = null;

    setDownloading(`print-${orderId}`);
    try {
      const settingsStartedAtMs = Date.now();
      const settingsPromise = getLabSettings()
        .catch(() => null)
        .finally(() => {
          settingsLoadMs = Date.now() - settingsStartedAtMs;
        });

      const [nextFetchResult, settings] = await Promise.all([
        getResultsPdfBlobDetailed(orderId, { correlationId: attemptId }),
        settingsPromise,
      ]);
      fetchResult = nextFetchResult;
      backendProfile = parseReportPdfProfilingHeaders(fetchResult.profilingHeaders);
      clickToBlobReadyMs = fetchResult.fetchCompletedAtMs - attemptStartedAtMs;
      try {
        const printerName = settings?.printing?.reportPrinterName?.trim();
        const mode = settings?.printing?.mode;
        if (mode === 'direct_gateway' && printerName) {
          configuredMode = 'direct_gateway';
          if (isVirtualSavePrinterName(printerName)) {
            message.info(
              `Report printer "${printerName}" is a virtual PDF/XPS printer. Using browser print dialog so the Save dialog can appear.`,
            );
          } else {
            try {
              directPrintStartedAtMs = Date.now();
              await directPrintReportPdf({
                orderId,
                blob: fetchResult.blob,
                printerName,
              });
              directPrintCompletedAtMs = Date.now();
              resultPath = 'direct_gateway';
              message.success(`Report sent to ${printerName}`);
              void trackReportAction(orderId, 'PRINT');
              return;
            } catch (error) {
              directPrintCompletedAtMs = Date.now();
              message.warning(`${getDirectPrintErrorMessage(error)} Falling back to browser print.`);
            }
          }
        }
      } catch {
        // continue with browser print fallback
      }

      try {
        await printResultsPdfInBrowser(fetchResult.blob, {
          onFrameLoaded: () => {
            previewReadyAtMs = Date.now();
          },
          onPrintInvoked: () => {
            printInvokedAtMs = Date.now();
          },
        });
        resultPath = 'browser';
      } catch {
        triggerPdfDownload(fetchResult.blob, resultsFilename);
        resultPath = 'download_fallback';
        message.warning('Browser print could not be started, so the report was downloaded instead.');
      }
      void trackReportAction(orderId, 'PRINT');
    } catch (error: unknown) {
      const is403 =
        error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 403;
      const backendMessage = await extractApiErrorMessageAsync(error);

      if (is403 && summaryOrder) {
        setPaymentModalOrder(summaryOrder);
        setPaymentModalPendingAction(
          () => () => handlePrintResults(orderId, summaryOrder, { skipPaymentCheck: true }),
        );
        setPaymentModalOpen(true);
      } else {
        failureMessage = backendMessage || 'Failed to load results for printing';
        message.error(failureMessage);
      }
    } finally {
      const totalMs = Date.now() - attemptStartedAtMs;
      setDownloading(null);
      if (fetchResult) {
        const profileWithoutClassification = {
          attemptId,
          createdAt: new Date(attemptStartedAtMs).toISOString(),
          orderId,
          orderNumber: summaryOrder?.orderNumber ?? null,
          patientName: summaryOrder?.patient?.fullName ?? null,
          attemptNumber,
          configuredMode,
          resultPath,
          success: resultPath !== 'failed',
          fetchSource: fetchResult.source,
          frontendInFlightJoin: fetchResult.inFlightJoin,
          backendCorrelationId: backendProfile?.correlationId ?? null,
          backendCacheHit: backendProfile?.cacheHit ?? null,
          backendInFlightJoin: backendProfile?.inFlightJoin ?? null,
          backendFallbackUsed:
            backendProfile?.fallbackMs != null ? backendProfile.fallbackMs > 0 : null,
          pdfSizeBytes: fetchResult.blob.size,
          clickToFetchStartMs:
            fetchResult.fetchStartedAtMs != null
              ? fetchResult.fetchStartedAtMs - attemptStartedAtMs
              : null,
          fetchDurationMs:
            fetchResult.fetchStartedAtMs != null
              ? fetchResult.fetchCompletedAtMs - fetchResult.fetchStartedAtMs
              : null,
          settingsLoadMs,
          clickToBlobReadyMs,
          backendTotalMs: backendProfile?.totalMs ?? null,
          backendSnapshotMs: backendProfile?.snapshotMs ?? null,
          backendVerifierLookupMs: backendProfile?.verifierLookupMs ?? null,
          backendAssetsMs: backendProfile?.assetsMs ?? null,
          backendHtmlMs: backendProfile?.htmlMs ?? null,
          backendRenderMs: backendProfile?.renderMs ?? null,
          backendFallbackMs: backendProfile?.fallbackMs ?? null,
          clickToPreviewReadyMs:
            previewReadyAtMs != null ? previewReadyAtMs - attemptStartedAtMs : null,
          clickToPrintInvokeMs:
            printInvokedAtMs != null ? printInvokedAtMs - attemptStartedAtMs : null,
          directPrintDurationMs:
            directPrintStartedAtMs != null && directPrintCompletedAtMs != null
              ? directPrintCompletedAtMs - directPrintStartedAtMs
              : null,
          clickToDirectPrintCompleteMs:
            directPrintCompletedAtMs != null ? directPrintCompletedAtMs - attemptStartedAtMs : null,
          totalMs,
          errorMessage: failureMessage,
        };

        appendReportPrintProfile({
          ...profileWithoutClassification,
          classification: classifyReportPrintBottleneck(profileWithoutClassification),
        });
      }
    }
  };

  const handlePrintReceipt = async (order: OrderHistoryItemDto) => {
    setDownloading(`receipt-${order.id}`);
    try {
      const fullOrder = await ensureOrderDetails(order.id);
      if (!fullOrder) {
        message.error('Order details unavailable for receipt preview');
        return;
      }

      try {
        const settings = await getLabSettings();
        const printerName = settings.printing?.receiptPrinterName?.trim();
        const mode = settings.printing?.mode;
        if (mode === 'direct_gateway' && printerName) {
          if (!isVirtualSavePrinterName(printerName)) {
            try {
              await directPrintReceipt({
                order: fullOrder,
                labName: lab?.name,
                printerName,
              });
              message.success(`Receipt sent to ${printerName}`);
              return;
            } catch (error) {
              message.warning(`${getDirectPrintErrorMessage(error)} Falling back to print preview.`);
            }
          } else {
            message.info(
              `Receipt printer "${printerName}" is a virtual PDF/XPS printer. Using print preview instead.`,
            );
          }
        }
      } catch {
        // continue with preview fallback
      }

      setReceiptPreviewOrder(fullOrder);
      setReceiptPreviewOpen(true);
    } catch {
      message.error('Failed to print receipt');
    } finally {
      setDownloading(null);
    }
  };

  const handleSendWhatsApp = async (
    order: OrderHistoryItemDto,
    options?: { skipPaymentCheck?: boolean },
  ) => {
    if (!options?.skipPaymentCheck && !canReleaseResults(order)) {
      setPaymentModalOrder(order);
      setPaymentModalPendingAction(
        () => () => handleSendWhatsApp(order, { skipPaymentCheck: true }),
      );
      setPaymentModalOpen(true);
      return;
    }

    const phone = order.patient?.phone;
    if (!phone) {
      message.warning('Patient has no phone number');
      return;
    }

    const cleanedPhone = cleanPhoneNumber(phone);
    const messageText = buildResultsMessage(order, lab?.name, lab?.subdomain ?? null);
    void trackReportAction(order.id, 'WHATSAPP');

    const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');
  };

  const handleSendViber = async (
    order: OrderHistoryItemDto,
    options?: { skipPaymentCheck?: boolean },
  ) => {
    if (!options?.skipPaymentCheck && !canReleaseResults(order)) {
      setPaymentModalOrder(order);
      setPaymentModalPendingAction(
        () => () => handleSendViber(order, { skipPaymentCheck: true }),
      );
      setPaymentModalOpen(true);
      return;
    }

    const phone = order.patient?.phone;
    if (!phone) {
      message.warning('Patient has no phone number');
      return;
    }

    const cleanedPhone = cleanPhoneNumber(phone);
    const messageText = buildResultsMessage(order, lab?.name, lab?.subdomain ?? null);
    void trackReportAction(order.id, 'VIBER');

    const url = `viber://chat?number=${encodeURIComponent(cleanedPhone)}&text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');
  };

  const getCultureOptionsForTest = useCallback(
    (target: OrderTestDto) =>
      buildCultureAntibioticOptions(
        antibiotics,
        target.test?.cultureAntibioticIds ?? [],
      ),
    [antibiotics],
  );

  const openEditResultModal = (order: OrderDto, orderTest: OrderTestDto) => {
    const isPanel = orderTest.test?.type === 'PANEL';
    const allTests = (order.samples ?? []).flatMap((s) => s.orderTests ?? []);
    const panelChildren = allTests.filter((ot) => ot.parentOrderTestId === orderTest.id);
    const sameSampleTests = allTests.filter(
      (ot) =>
        ot.sampleId === orderTest.sampleId &&
        ot.id !== orderTest.id &&
        ot.test?.type !== 'PANEL',
    );

    const targets = isPanel
      ? panelChildren.length > 0
        ? panelChildren
        : sameSampleTests.length > 0
          ? sameSampleTests
          : [orderTest]
      : [orderTest];

    setEditResultContext({
      editMode: isPanel ? 'PANEL' : 'SINGLE',
      orderTestId: orderTest.id,
      orderNumber: order.orderNumber || order.id.substring(0, 8),
      patientName: order.patient?.fullName || '-',
      patientSex: order.patient?.sex ?? null,
      testCode: orderTest.test?.code || '-',
      testName: orderTest.test?.name || '-',
      testUnit: orderTest.test?.unit ?? null,
      normalMin: orderTest.test?.normalMin ?? null,
      normalMax: orderTest.test?.normalMax ?? null,
      normalText: resolveSexSpecificNormalText(orderTest.test, order.patient?.sex ?? null),
      resultEntryType: orderTest.test?.resultEntryType ?? 'NUMERIC',
      resultTextOptions: orderTest.test?.resultTextOptions ?? [],
      allowCustomResultText: Boolean(orderTest.test?.allowCustomResultText),
      parameterDefinitions: orderTest.test?.parameterDefinitions ?? [],
      wasVerified: orderTest.status === 'VERIFIED',
      targetItems: targets,
    });

    const formValues: any = {};

    targets.forEach((target) => {
      const resultEntryType = target.test?.resultEntryType ?? 'NUMERIC';
      const resultTextOptions = target.test?.resultTextOptions ?? [];
      const allowCustomResultText = Boolean(target.test?.allowCustomResultText);
      const parameterDefinitions = target.test?.parameterDefinitions ?? [];

      const valueCandidate =
        target.resultValue !== null && target.resultValue !== undefined
          ? Number(target.resultValue)
          : undefined;

      const defaultQualitativeOption =
        resultTextOptions.find((option) => option.isDefault)?.value ??
        resultTextOptions[0]?.value;
      const knownOptionValues = new Set(
        resultTextOptions.map((option) => option.value.trim().toLowerCase()),
      );

      const existingParams = target.resultParameters ?? {};
      const resultParametersInitial: Record<string, string> = {};
      const resultParametersCustomInitial: Record<string, string> = {};
      const defaults: Record<string, string> = {};

      parameterDefinitions.forEach((def) => {
        if (
          def.defaultValue != null &&
          def.defaultValue.trim() !== '' &&
          (existingParams[def.code] == null || String(existingParams[def.code]).trim() === '')
        ) {
          defaults[def.code] = def.defaultValue.trim();
        }
      });

      for (const [code, rawValue] of Object.entries(existingParams)) {
        const value = rawValue != null ? String(rawValue).trim() : '';
        if (!value) continue;
        const definition = parameterDefinitions.find((d) => d.code === code);
        if (definition?.type === 'select') {
          const known = new Set(
            (definition.options ?? []).map((option) => option.trim().toLowerCase()),
          );
          if (known.size > 0 && !known.has(value.toLowerCase())) {
            resultParametersInitial[code] = '__other__';
            resultParametersCustomInitial[code] = value;
            continue;
          }
        }
        resultParametersInitial[code] = value;
      }

      let initialResultText = target.resultText ?? undefined;
      let customResultText: string | undefined;

      if (resultEntryType === 'QUALITATIVE') {
        if (!initialResultText && defaultQualitativeOption) {
          initialResultText = defaultQualitativeOption;
        }
        if (
          initialResultText &&
          allowCustomResultText &&
          !knownOptionValues.has(initialResultText.trim().toLowerCase())
        ) {
          customResultText = initialResultText;
          initialResultText = '__other__';
        }
      }

      formValues[target.id] = {
        resultValue:
          resultEntryType === 'QUALITATIVE' ||
            resultEntryType === 'TEXT' ||
            resultEntryType === 'CULTURE_SENSITIVITY'
            ? undefined
            : valueCandidate,
        resultText: initialResultText,
        customResultText,
        resultParameters: { ...defaults, ...resultParametersInitial },
        resultParametersCustom: resultParametersCustomInitial,
        cultureResult: normalizeCultureResultForForm(target.cultureResult),
      };
    });

    editResultForm.setFieldsValue(formValues);
    setEditResultModalOpen(true);
  };

  const handleEditResultSave = async (allValues: any) => {
    if (!editResultContext) return;

    const targets = editResultContext.targetItems;
    setSavingResult(true);

    try {
      const savePromises = targets.map(async (target) => {
        const itemValues = allValues[target.id] || {};
        let resultValue = itemValues.resultValue ?? null;
        let resultText = itemValues.resultText?.trim() || null;
        const rawParams = itemValues.resultParameters ?? {};
        const rawCustomParams = itemValues.resultParametersCustom ?? {};
        const resultParameterEntries: Array<[string, string]> = [];

        for (const [code, rawValue] of Object.entries(rawParams)) {
          const value = rawValue != null ? String(rawValue).trim() : '';
          if (!value) continue;
          if (value === '__other__') {
            const customValue =
              rawCustomParams[code] != null ? String(rawCustomParams[code]).trim() : '';
            if (!customValue) continue;
            resultParameterEntries.push([code, customValue]);
            continue;
          }
          resultParameterEntries.push([code, value]);
        }

        const resultParameters = Object.fromEntries(resultParameterEntries);
        const hasResultParameters = Object.keys(resultParameters).length > 0;
        const resultEntryType = target.test?.resultEntryType ?? 'NUMERIC';
        let cultureResult = null;

        if (resultEntryType === 'QUALITATIVE') {
          if (resultText === '__other__') {
            resultText = itemValues.customResultText?.trim() || null;
          }
          resultValue = null;
        } else if (resultEntryType === 'TEXT') {
          resultValue = null;
        } else if (resultEntryType === 'CULTURE_SENSITIVITY') {
          cultureResult = buildCultureResultPayloadFromForm(
            itemValues.cultureResult,
            antibioticById,
          );
          resultValue = null;
          resultText = null;
        }

        await enterResult(target.id, {
          resultValue,
          resultText,
          resultParameters:
            resultEntryType === 'CULTURE_SENSITIVITY'
              ? null
              : hasResultParameters
                ? resultParameters
                : null,
          cultureResult,
          forceEditVerified: editResultContext.wasVerified,
        });
      });

      await Promise.all(savePromises);

      message.success(
        editResultContext.wasVerified
          ? 'Verified results updated by admin'
          : 'Results updated. Verify them in Verification tab.',
      );

      setEditResultModalOpen(false);
      setEditResultContext(null);
      editResultForm.resetFields();
      await loadOrders();
    } catch (error) {
      console.error('Failed to update results', error);
      message.error('Failed to update result(s)');
    } finally {
      setSavingResult(false);
    }
  };

  const renderExpandedOrder = (orderSummary: OrderHistoryItemDto) => {
    const order = orderDetailsCache[orderSummary.id];
    const loadingDetails = orderDetailsLoadingIds.includes(orderSummary.id);
    const detailsError = orderDetailsErrors[orderSummary.id];

    if (!order) {
      return (
        <div style={{ padding: '12px 16px' }}>
          <Space size="middle">
            {loadingDetails ? <Spin size="small" /> : null}
            <Text type="secondary">
              {loadingDetails ? 'Loading order details...' : detailsError || 'Order details not loaded yet.'}
            </Text>
            {!loadingDetails && (
              <Button
                size="small"
                onClick={() => {
                  void ensureOrderDetails(orderSummary.id, 'retry');
                }}
              >
                Retry
              </Button>
            )}
          </Space>
        </div>
      );
    }

    const rows = getOrderTestRows(order);
    const allTestsInOrder = (order.samples ?? []).flatMap((sample) => sample.orderTests ?? []);

    if (rows.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tests found" />;
    }

    const columns = [
      {
        title: 'Sample',
        dataIndex: 'sampleLabel',
        key: 'sample',
        width: 100,
        render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Test',
        key: 'test',
        width: 220,
        render: (_: unknown, row: ExpandedOrderTestRow) => (
          <div>
            <Text strong style={{ fontSize: 12 }}>
              {row.testName}
            </Text>
            {row.raw.test?.type === 'PANEL' && (
              <Text type="secondary" style={{ fontSize: 10 }}>
                Panel Test
              </Text>
            )}
          </div>
        ),
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Result',
        dataIndex: 'resultPreview',
        key: 'result',
        width: 220,
        render: (value: string, row: ExpandedOrderTestRow) => (
          <div>
            {isEtaLoadingStatus(row.status) ? (
              (() => {
                const eta = computeEta({
                  startMs: getStartTime(order),
                  expectedMinutes: resolveExpectedMinutes(row, allTestsInOrder),
                  nowMs,
                  finishMs: getFinishTime(row, allTestsInOrder),
                });
                const panelChildProgress = getPanelChildProgress(row, allTestsInOrder);

                if (!eta) {
                  return (
                    <div className="reports-eta-cell">
                      <Text className="reports-eta-label">In progress</Text>
                      {panelChildProgress && (
                        <Text type="secondary" className="reports-eta-child-progress">
                          {panelChildProgress}
                        </Text>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="reports-eta-cell">
                    <Text className={`reports-eta-label ${eta.isOverdue ? 'overdue' : ''}`}>
                      {eta.isOverdue ? `Overdue by ${eta.overdueMinutes}m` : `${eta.remainingMinutes}m left`}
                    </Text>
                    <Progress
                      percent={eta.percent}
                      size="small"
                      showInfo={false}
                      status={eta.isOverdue ? 'exception' : 'active'}
                    />
                    <div className="reports-eta-meta">
                      <Text type="secondary">ETA {dayjs(eta.dueAtMs).format('HH:mm')}</Text>
                      <Text type="secondary">{resolveExpectedMinutes(row, allTestsInOrder)}m target</Text>
                    </div>
                    {panelChildProgress && (
                      <Text type="secondary" className="reports-eta-child-progress">
                        {panelChildProgress}
                      </Text>
                    )}
                  </div>
                );
              })()
            ) : (
              <Text style={{ fontSize: 12 }}>{value}</Text>
            )}
            {row.raw.test?.type !== 'PANEL' &&
              (() => {
                const resolvedNormalText = resolveSexSpecificNormalText(
                  row.raw.test,
                  order.patient?.sex ?? null,
                );
                return (row.raw.test?.normalMin !== null ||
                  row.raw.test?.normalMax !== null ||
                  resolvedNormalText);
              })() && (
                <div style={{ fontSize: 10, color: 'rgba(128,128,128,0.7)', marginTop: 2 }}>
                  Range:{' '}
                  <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {formatReferenceRange(
                      resolveSexSpecificNormalText(row.raw.test, order.patient?.sex ?? null),
                      row.raw.test?.normalMin,
                      row.raw.test?.normalMax,
                      row.raw.test?.unit,
                    )}
                  </span>
                </div>
              )}
          </div>
        ),
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Flag',
        key: 'flag',
        width: 100,
        render: (_: unknown, row: ExpandedOrderTestRow) => {
          const normalizedFlag = normalizeResultFlag(row.flag);
          const meta = normalizedFlag ? RESULT_FLAG_META[normalizedFlag] : null;
          if (!meta || normalizedFlag === 'N')
            return (
              <Text type="secondary" style={{ fontSize: 10 }}>
                -
              </Text>
            );
          return (
            <Tag color={meta.color} style={{ margin: 0, fontSize: 10, lineHeight: '14px' }}>
              {meta.label}
            </Tag>
          );
        },
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Status',
        key: 'status',
        width: 110,
        render: (_: unknown, row: ExpandedOrderTestRow) => (
          <Tag
            color={ORDER_TEST_STATUS_COLORS[row.status] || 'default'}
            style={{ margin: 0, fontSize: 10, lineHeight: '14px' }}
          >
            {row.status.replace('_', ' ')}
          </Tag>
        ),
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Verified At',
        key: 'verifiedAt',
        width: 140,
        render: (_: unknown, row: ExpandedOrderTestRow) => (
          <Text style={{ fontSize: 12 }}>
            {row.verifiedAt ? dayjs(row.verifiedAt).format('YYYY-MM-DD HH:mm') : '-'}
          </Text>
        ),
        onCell: () => ({ style: compactCellStyle }),
      },
      ...(canAdminEditResults
        ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 90,
            align: 'right' as const,
            render: (_: unknown, row: ExpandedOrderTestRow) => (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEditResultModal(order, row.raw)}
                  style={{ paddingInline: 4, fontSize: 11 }}
                >
                  Edit
                </Button>
              </div>
            ),
            onCell: () => ({ style: compactCellStyle }),
          },
        ]
        : []),
    ];

    return (
      <div className="reports-expanded-panel" style={{ padding: '0 16px 16px' }}>
        <Table
          className="reports-subtests-table"
          size="small"
          columns={columns}
          dataSource={rows}
          rowKey="key"
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: 800 }}
        />
      </div>
    );
  };

  const renderOrderActions = (record: OrderHistoryItemDto) => {
    const hasPhone = !!record.patient?.phone;
    const availability = getResultAvailability(record);
    const reportReady = availability.ready;
    const paid = record.paymentStatus === 'paid';
    const notReadyTooltip = reportReady ? null : 'Not all test results are entered and verified';
    const paymentTooltip = !paid ? 'Payment required to release results' : null;
    const flags = actionFlagsByOrderId[record.id];
    const pdfDone = Boolean(flags?.pdf);
    const printDone = Boolean(flags?.print);
    const whatsappDone = Boolean(flags?.whatsapp);
    const viberDone = Boolean(flags?.viber);
    const preferredMethods = new Set(
      (record.deliveryMethods ?? [])
        .map((value) => String(value ?? '').trim().toUpperCase())
        .filter((value) => value.length > 0),
    );
    const printPreferred = preferredMethods.has('PRINT');
    const whatsappPreferred = preferredMethods.has('WHATSAPP');
    const viberPreferred = preferredMethods.has('VIBER');

    const preferredClassName = (preferred: boolean, disabled: boolean) => {
      if (!preferred) return undefined;
      return disabled ? 'preferred-action preferred-action--muted' : 'preferred-action';
    };

    const actionButtonClassName = (preferred: boolean, disabled: boolean) => {
      const preferredClass = preferredClassName(preferred, disabled);
      return preferredClass
        ? `reports-order-action-btn ${preferredClass}`
        : 'reports-order-action-btn';
    };

    const withTick = (label: string, done: boolean, color?: string) => (
      <span className="reports-order-action-label">
        <span>{label}</span>
        {done ? <CheckOutlined style={{ color: color ?? '#52c41a', fontSize: 11 }} /> : null}
      </span>
    );

    const menuItems = [
      {
        key: 'results',
        label: withTick('PDF', pdfDone),
        icon: <FilePdfOutlined />,
        disabled: !reportReady,
        onClick: () => handleDownloadResults(record.id, record),
      },
      {
        key: 'print',
        label: (
          <span className={preferredClassName(printPreferred, !reportReady)}>
            {withTick('Print', printDone)}
          </span>
        ),
        icon: <PrinterOutlined />,
        disabled: !reportReady,
        onClick: () => handlePrintResults(record.id, record),
      },
      {
        key: 'wa',
        label: (
          <span className={preferredClassName(whatsappPreferred, !hasPhone || !reportReady)}>
            {withTick('WhatsApp', whatsappDone, '#25D366')}
          </span>
        ),
        icon: <WhatsAppOutlined />,
        disabled: !hasPhone || !reportReady,
        onClick: () => handleSendWhatsApp(record),
      },
      {
        key: 'viber',
        label: (
          <span className={preferredClassName(viberPreferred, !hasPhone || !reportReady)}>
            {withTick('Viber', viberDone, '#7360F2')}
          </span>
        ),
        icon: <MessageOutlined />,
        disabled: !hasPhone || !reportReady,
        onClick: () => handleSendViber(record),
      },
    ];

    if (isCompactActions) {
      return (
        <div onClick={(event) => event.stopPropagation()}>
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </div>
      );
    }

    return (
      <div
        className="reports-order-actions"
        onClick={(event) => event.stopPropagation()}
      >
        <Tooltip title={!reportReady ? notReadyTooltip : paymentTooltip || 'Download results PDF'}>
          <Button
            type="link"
            size="small"
            icon={<FilePdfOutlined />}
            className="reports-order-action-btn"
            disabled={!reportReady}
            loading={downloading === `results-${record.id}`}
            onClick={() => handleDownloadResults(record.id, record)}
          >
            {withTick('PDF', pdfDone)}
          </Button>
        </Tooltip>
        <Tooltip title={!reportReady ? notReadyTooltip : paymentTooltip || 'Print results'}>
          <Button
            type="link"
            size="small"
            icon={<PrinterOutlined />}
            className={actionButtonClassName(printPreferred, !reportReady)}
            disabled={!reportReady}
            loading={downloading === `print-${record.id}`}
            onClick={() => handlePrintResults(record.id, record)}
          >
            {withTick('Print', printDone)}
          </Button>
        </Tooltip>
        <Tooltip
          title={!reportReady ? notReadyTooltip : !hasPhone ? 'No phone number' : paymentTooltip || 'Send via WhatsApp'}
        >
          <Button
            type="link"
            size="small"
            icon={<WhatsAppOutlined />}
            className={actionButtonClassName(whatsappPreferred, !hasPhone || !reportReady)}
            disabled={!hasPhone || !reportReady}
            onClick={() => handleSendWhatsApp(record)}
            style={{ color: hasPhone && reportReady ? '#25D366' : undefined }}
          >
            {withTick('WhatsApp', whatsappDone, '#25D366')}
          </Button>
        </Tooltip>
        <Tooltip
          title={!reportReady ? notReadyTooltip : !hasPhone ? 'No phone number' : paymentTooltip || 'Send via Viber'}
        >
          <Button
            type="link"
            size="small"
            icon={<MessageOutlined />}
            className={actionButtonClassName(viberPreferred, !hasPhone || !reportReady)}
            disabled={!hasPhone || !reportReady}
            onClick={() => handleSendViber(record)}
            style={{ color: hasPhone && reportReady ? '#7360F2' : undefined }}
          >
            {withTick('Viber', viberDone, '#7360F2')}
          </Button>
        </Tooltip>
      </div>
    );
  };

  const columns = [
    {
      title: 'Patient',
      key: 'patient',
      width: 260,
      render: (_: unknown, record: OrderHistoryItemDto) => (
        <Space size={8} style={{ minWidth: 0 }}>
          <UserOutlined style={{ fontSize: 14, color: '#1677ff' }} />
          <Text strong ellipsis style={{ fontSize: 16 }}>
            {record.patient?.fullName?.trim() || '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'statusSummary',
      width: 260,
      render: (_: unknown, record: OrderHistoryItemDto) => {
        const availability = getResultAvailability(record);
        const testsCount = Number(record.testsCount ?? 0) || 0;

        return (
          <Space size={[4, 4]} wrap>
            <Tag color={ORDER_STATUS_COLORS[record.status] || 'default'} style={{ margin: 0 }}>
              {record.status.replace('_', ' ')}
            </Tag>
            <Tag style={{ margin: 0 }}>{testsCount} tests</Tag>
            {availability.ready ? (
              <Tag color="green" style={{ margin: 0 }}>
                Ready {availability.completed}/{availability.total}
              </Tag>
            ) : (
              <Tag color="default" style={{ margin: 0 }}>
                Pending {availability.completed}/{availability.total}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Order',
      key: 'order',
      width: 210,
      render: (_: unknown, record: OrderHistoryItemDto) => (
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
            Order: {record.orderNumber || record.id.substring(0, 8)}
          </Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 10 }}>
            Phone: {record.patient?.phone || '-'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Time',
      key: 'registeredAt',
      width: 165,
      render: (_: unknown, record: OrderHistoryItemDto) => (
        <Text style={{ fontSize: 12 }}>{dayjs(record.registeredAt).format('YYYY-MM-DD HH:mm')}</Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: isCompactActions ? 80 : 392,
      render: (_: unknown, record: OrderHistoryItemDto) => (
        <div className="reports-order-actions-cell">
          {renderOrderActions(record)}
        </div>
      ),
    },
  ];

  const handlePaymentModalConfirm = async () => {
    const order = paymentModalOrder;
    if (!order) return;

    setMarkingPaid(true);
    try {
      const updated = await updateOrderPayment(order.id, { paymentStatus: 'paid' });
      message.success('Order marked as paid');

      const action = paymentModalPendingAction;
      setPaymentModalOpen(false);
      setPaymentModalOrder(null);
      setPaymentModalPendingAction(null);
      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id
            ? {
              ...item,
              paymentStatus: 'paid',
              paidAmount: Number(updated.paidAmount ?? updated.finalAmount ?? item.finalAmount ?? 0),
            }
            : item,
        ),
      );

      try {
        if (typeof action === 'function') {
          await action();
        }
      } catch {
        // no-op
      }

      void loadOrders();
    } catch {
      message.error('Failed to mark as paid');
    } finally {
      setMarkingPaid(false);
    }
  };

  return (
    <div>
      <style>{`
        .reports-orders-table .reports-order-row-expanded > td {
          background: #f7fbff !important;
          border-top: 1px solid #91caff !important;
          border-bottom: 0 !important;
        }
        .reports-orders-table .reports-order-row-expanded > td:first-child {
          border-left: 2px solid #1677ff !important;
          border-top-left-radius: 8px !important;
        }
        .reports-orders-table .reports-order-row-expanded > td:last-child {
          border-right: 1px solid #91caff !important;
          border-top-right-radius: 8px !important;
        }
        .reports-orders-table .ant-table-expanded-row > td {
          padding: 4px 10px 8px !important;
          background: transparent !important;
          border-left: 2px solid #1677ff !important;
          border-right: 1px solid #91caff !important;
          border-bottom: 1px solid #91caff !important;
          border-bottom-left-radius: 8px !important;
          border-bottom-right-radius: 8px !important;
        }
        .reports-expanded-panel {
          border: 0;
          border-radius: 0;
          overflow: hidden;
          background: transparent;
        }
        .reports-expanded-panel .ant-table-container {
          border-radius: 0;
        }
        html[data-theme='dark'] .reports-orders-table .reports-order-row-expanded > td {
          background: rgba(255, 255, 255, 0.04) !important;
          border-top-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .reports-orders-table .reports-order-row-expanded > td:first-child {
          border-left-color: #3c89e8 !important;
        }
        html[data-theme='dark'] .reports-orders-table .reports-order-row-expanded > td:last-child {
          border-right-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .reports-orders-table .ant-table-expanded-row > td {
          border-left-color: #3c89e8 !important;
          border-right-color: rgba(100, 168, 255, 0.55) !important;
          border-bottom-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .reports-expanded-panel {
          background: transparent;
        }
        .reports-subtests-table .ant-table-thead > tr > th {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
          font-size: 11px;
        }
        .reports-subtests-table .ant-table-tbody > tr > td {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
        }
        .preferred-action {
          border-radius: 999px !important;
          border: 1px solid #91caff !important;
          background: rgba(22, 119, 255, 0.12) !important;
        }
        .reports-order-actions-cell {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .reports-order-actions {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          align-items: center;
          gap: 6px;
          width: min(100%, 380px);
          margin-left: auto;
        }
        .reports-order-action-btn.ant-btn.ant-btn-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-width: 0;
          height: 32px;
          margin: 0;
          padding-inline: 10px;
          border: 1px solid transparent;
          border-radius: 999px;
          white-space: nowrap;
        }
        .reports-order-action-btn.ant-btn.ant-btn-link:not(:disabled):hover,
        .reports-order-action-btn.ant-btn.ant-btn-link:not(:disabled):focus {
          background: rgba(22, 119, 255, 0.08);
        }
        .reports-order-action-btn.ant-btn.ant-btn-link > .anticon,
        .reports-order-action-btn.ant-btn.ant-btn-link .ant-btn-loading-icon {
          font-size: 13px;
          margin-inline-end: 6px;
        }
        .reports-order-action-label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-width: 0;
          white-space: nowrap;
        }
        .preferred-action--muted {
          border-color: rgba(0, 0, 0, 0.18) !important;
          background: rgba(0, 0, 0, 0.06) !important;
        }
        html[data-theme='dark'] .preferred-action {
          border-color: rgba(145, 202, 255, 0.7) !important;
          background: rgba(22, 119, 255, 0.25) !important;
        }
        html[data-theme='dark'] .reports-order-action-btn.ant-btn.ant-btn-link:not(:disabled):hover,
        html[data-theme='dark'] .reports-order-action-btn.ant-btn.ant-btn-link:not(:disabled):focus {
          background: rgba(96, 165, 250, 0.12);
        }
        html[data-theme='dark'] .preferred-action--muted {
          border-color: rgba(255, 255, 255, 0.26) !important;
          background: rgba(255, 255, 255, 0.08) !important;
        }
        .reports-eta-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .reports-eta-label {
          font-size: 11px;
          font-weight: 600;
          line-height: 1.2;
        }
        .reports-eta-label.overdue {
          color: #cf1322;
        }
        html[data-theme='dark'] .reports-eta-label.overdue {
          color: #ff7875;
        }
        .reports-eta-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          line-height: 1.2;
        }
        .reports-eta-meta .ant-typography {
          font-size: 10px;
          margin: 0;
          line-height: 1.2;
        }
        .reports-eta-child-progress {
          font-size: 10px;
          line-height: 1.2;
          margin: 0;
        }
        .panel-entry-modal .ant-modal {
          max-width: calc(100vw - 32px) !important;
        }
        .panel-entry-modal .ant-modal-content {
          border-radius: 10px;
          overflow: hidden;
        }
        .panel-entry-modal .ant-modal-header {
          padding: 8px 10px;
          margin-bottom: 0;
        }
        .panel-entry-modal .ant-modal-body {
          padding: 6px 10px 8px !important;
          max-height: calc(100vh - 140px);
          overflow-y: auto;
        }
        .panel-entry-modal .panel-entry-summary {
          margin-bottom: 4px;
          padding: 6px 8px;
          border-radius: 6px;
        }
        .panel-entry-modal .panel-entry-grid-head {
          padding: 3px 6px !important;
          margin-bottom: 0 !important;
          font-size: 10px !important;
        }
        .panel-entry-modal .panel-entry-grid-row {
          padding: 2px 6px !important;
          margin-bottom: 0 !important;
        }
        .panel-entry-modal .panel-entry-grid-row .ant-form-item {
          margin-bottom: 0;
        }
        .panel-entry-modal .panel-entry-params {
          margin-top: 4px !important;
          padding: 6px 8px !important;
        }
        .panel-entry-modal .panel-entry-footer {
          margin-top: 4px !important;
        }
        .panel-entry-modal .ant-input-number,
        .panel-entry-modal .ant-input,
        .panel-entry-modal .ant-select-selector,
        .panel-entry-modal .ant-btn {
          min-height: 28px !important;
        }
        .panel-entry-modal .ant-input-number-input {
          height: 26px !important;
        }
        .panel-entry-modal .ant-tag {
          font-size: 10px;
          line-height: 16px;
          padding-inline: 6px;
        }
        @media (max-width: 992px) {
          .panel-entry-modal .ant-modal {
            margin: 10px auto;
          }
          .panel-entry-modal .ant-modal-body {
            max-height: calc(100vh - 116px);
            padding: 8px 10px 10px !important;
          }
        }
      `}</style>
      <Modal
        title="Payment required"
        open={paymentModalOpen}
        onCancel={() => {
          setPaymentModalOpen(false);
          setPaymentModalOrder(null);
          setPaymentModalPendingAction(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => setPaymentModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="receipt"
            icon={<PrinterOutlined />}
            loading={Boolean(paymentModalOrder && downloading === `receipt-${paymentModalOrder.id}`)}
            disabled={!paymentModalOrder}
            onClick={() => {
              if (paymentModalOrder) {
                void handlePrintReceipt(paymentModalOrder);
              }
            }}
          >
            Print receipt
          </Button>,
          <Button key="paid" type="primary" loading={markingPaid} onClick={handlePaymentModalConfirm}>
            Mark as paid
          </Button>,
        ]}
      >
        <Typography.Paragraph>
          {paymentModalOrder?.paymentStatus === 'partial'
            ? 'This order is partially paid. Results cannot be printed or shared until payment is complete.'
            : 'This order is unpaid. Results cannot be printed or shared until payment is complete.'}
        </Typography.Paragraph>

        {paymentModalOrder && (
          <Typography.Paragraph strong style={{ marginBottom: 8 }}>
            {paymentModalOrder.paymentStatus === 'partial' && paymentModalOrder.paidAmount != null
              ? `Paid: ${Number(paymentModalOrder.paidAmount).toLocaleString()} IQD | Remaining: ${(Number(paymentModalOrder.finalAmount) - Number(paymentModalOrder.paidAmount)).toLocaleString()} IQD`
              : `Amount to pay: ${Number(paymentModalOrder.finalAmount).toLocaleString()} IQD`}
          </Typography.Paragraph>
        )}

        <Typography.Paragraph type="secondary">
          Click &quot;Mark as paid&quot; to confirm payment and continue.
        </Typography.Paragraph>
      </Modal>

      <PrintPreviewModal
        open={receiptPreviewOpen}
        onClose={() => {
          setReceiptPreviewOpen(false);
          setReceiptPreviewOrder(null);
        }}
        order={receiptPreviewOrder}
        type="receipt"
        labName={lab?.name}
      />

      <Modal
        title={(
          <Space size="middle">
            <span style={{ fontWeight: 600, fontSize: 16 }}>Enter Result</span>
            {editResultContext && (
              <Tag color="blue" style={{ margin: 0 }}>
                {editResultContext.testName}
              </Tag>
            )}
          </Space>
        )}
        open={editResultModalOpen}
        onCancel={() => {
          setEditResultModalOpen(false);
          setEditResultContext(null);
          editResultForm.resetFields();
        }}
        footer={null}
        width={960}
        className="panel-entry-modal"
        styles={{
          header: { borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' },
        }}
        destroyOnClose
      >
        {editResultContext && (
          <div>
            <div
              className="panel-entry-summary"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0',
              }}
            >
              <Row gutter={[8, 2]}>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Patient</Text>
                  <div style={{ marginTop: 2 }}><Text strong>{editResultContext.patientName}</Text></div>
                </Col>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Order</Text>
                  <div style={{ marginTop: 2 }}><Text strong>{editResultContext.orderNumber}</Text></div>
                </Col>
              </Row>

              {editResultContext.wasVerified ? (
                <div style={{ marginTop: 12 }}>
                  <Tag color="gold">Verified result correction (admin only)</Tag>
                </div>
              ) : null}

              {(editResultContext.normalMin !== null || editResultContext.normalMax !== null || editResultContext.normalText) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Normal range</Text>
                  <div style={{ marginTop: 2 }}>
                    <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {formatReferenceRange(
                        editResultContext.normalText,
                        editResultContext.normalMin,
                        editResultContext.normalMax,
                        editResultContext.testUnit,
                      )}
                    </Text>
                  </div>
                </div>
              )}
            </div>

            <Form form={editResultForm} layout="vertical" onFinish={handleEditResultSave}>
              {(() => {
                const targetItems = editResultContext.targetItems;
                const isPanel = editResultContext.editMode === 'PANEL';

                return (
                  <>
                    {isPanel && (
                      <div
                        className="panel-entry-grid-head"
                        style={{
                          display: 'flex',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
                          borderRadius: '6px 6px 0 0',
                          borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e8e8e8',
                          fontWeight: 600,
                          fontSize: 12,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}
                      >
                        <div style={{ flex: '1 1 24%', textAlign: 'center' }}>Test</div>
                        <div style={{ flex: '1 1 40%', textAlign: 'center' }}>Result</div>
                        <div style={{ flex: '1 1 14%', textAlign: 'center' }}>Unit</div>
                        <div style={{ flex: '1 1 22%', textAlign: 'center' }}>Ref. Range</div>
                      </div>
                    )}

                    {targetItems.map((target, idx) => {
                      const parameterDefinitions = target.test?.parameterDefinitions ?? [];
                      const hasParams = parameterDefinitions.length > 0;
                      const panelResultControlStyle = isPanel ? { width: '100%' } : undefined;

                      if (isPanel && hasParams) {
                        return parameterDefinitions.map((def, defIndex) => {
                          const isLastRow =
                            idx === targetItems.length - 1 && defIndex === parameterDefinitions.length - 1;
                          return (
                            <div
                              key={`${target.id}-${def.code}`}
                              className="panel-entry-grid-row"
                              style={{
                                marginBottom: 0,
                                alignItems: 'center',
                                borderBottom: !isLastRow
                                  ? (isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f0f0f0')
                                  : 'none',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 24%', textAlign: 'center' }}>
                                  <Text style={{ fontSize: 12, lineHeight: '16px' }}>{def.label}</Text>
                                </div>
                                <div style={{ flex: '1 1 40%', textAlign: 'center' }}>
                                  <Form.Item name={[target.id, 'resultParameters', def.code]} noStyle>
                                    {def.type === 'select' ? (
                                      <Select
                                        allowClear
                                        showSearch
                                        style={{ width: '100%', textAlign: 'center' }}
                                        dropdownStyle={{ textAlign: 'center' }}
                                        size="small"
                                        placeholder="Select"
                                        options={[
                                          ...(def.options ?? []).map((o) => ({ label: o, value: o })),
                                          { label: 'Other...', value: '__other__' },
                                        ]}
                                      />
                                    ) : (
                                      <Input style={{ width: '100%', textAlign: 'center' }} size="small" placeholder="Result" />
                                    )}
                                  </Form.Item>
                                  {def.type === 'select' && (
                                    <Form.Item noStyle shouldUpdate>
                                      {() => editResultForm.getFieldValue([target.id, 'resultParameters', def.code]) === '__other__' && (
                                        <Form.Item
                                          name={[target.id, 'resultParametersCustom', def.code]}
                                          rules={[{ required: true, message: 'Enter custom value' }]}
                                          style={{ marginTop: 4, marginBottom: 0 }}
                                        >
                                          <Input size="small" placeholder="Specify custom value..." style={{ textAlign: 'center' }} />
                                        </Form.Item>
                                      )}
                                    </Form.Item>
                                  )}
                                </div>
                                <div style={{ flex: '1 1 14%', textAlign: 'center', fontSize: 12 }}>
                                  -
                                </div>
                                <div style={{ flex: '1 1 22%', textAlign: 'center', fontSize: 12, color: 'rgba(128,128,128,0.8)' }}>
                                  -
                                </div>
                              </div>
                            </div>
                          );
                        });
                      }

                      return (
                        <div key={target.id} className={isPanel ? 'panel-entry-grid-row' : undefined} style={{
                          marginBottom: isPanel ? 0 : 6,
                          padding: isPanel ? undefined : 0,
                          alignItems: 'center',
                          borderBottom: isPanel && idx < targetItems.length - 1 ? (isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f0f0f0') : 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ flex: isPanel ? '1 1 24%' : '1 1 100%', marginBottom: isPanel ? 0 : 8, textAlign: isPanel ? 'center' : 'left' }}>
                              <Text strong={!isPanel} style={{ fontSize: isPanel ? 12 : 14 }}>{target.test?.name}</Text>
                            </div>

                            <div style={{ flex: isPanel ? '1 1 40%' : '1 1 100%', textAlign: 'center' }}>
                              {!hasParams ? (
                                target.test?.resultEntryType === 'CULTURE_SENSITIVITY' ? (
                                  <CultureSensitivityEditor
                                    baseName={[target.id, 'cultureResult']}
                                    antibioticOptions={getCultureOptionsForTest(target)}
                                    interpretationOptions={
                                      target.test?.cultureConfig?.interpretationOptions ?? ['S', 'I', 'R']
                                    }
                                    micUnit={target.test?.cultureConfig?.micUnit ?? null}
                                  />
                                ) : (
                                  <Form.Item
                                    name={[target.id, 'resultText']}
                                    noStyle={isPanel}
                                    rules={target.test?.resultEntryType === 'QUALITATIVE' ? [{ required: true, message: 'Required' }] : []}
                                  >
                                    {target.test?.resultEntryType === 'NUMERIC' ? (
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: isPanel ? 'center' : 'flex-start', width: isPanel ? '100%' : undefined }}>
                                        <Form.Item name={[target.id, 'resultValue']} noStyle>
                                          <InputNumber
                                            style={{ width: '100%', textAlign: 'center' }}
                                            placeholder="Value"
                                            precision={2}
                                            size="small"
                                          />
                                        </Form.Item>
                                        {target.test?.resultEntryType === 'NUMERIC' && !isPanel && target.test?.unit && <Text type="secondary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{target.test.unit}</Text>}
                                      </div>
                                    ) : target.test?.resultEntryType === 'QUALITATIVE' && (target.test?.resultTextOptions?.length ?? 0) > 0 ? (
                                      <Select
                                        allowClear
                                        showSearch
                                        style={{ ...panelResultControlStyle, textAlign: 'center' }}
                                        dropdownStyle={{ textAlign: 'center' }}
                                        size="small"
                                        placeholder="Select"
                                        options={[
                                          ...(target.test?.resultTextOptions ?? []).map((o) => ({ label: o.value, value: o.value })),
                                          ...(target.test?.allowCustomResultText ? [{ label: 'Other...', value: '__other__' }] : []),
                                        ]}
                                      />
                                    ) : (
                                      <Input style={{ ...panelResultControlStyle, textAlign: 'center' }} size="small" placeholder="Result text" />
                                    )}
                                  </Form.Item>
                                )
                              ) : (
                                <Text type="secondary" italic style={{ fontSize: 12 }}>See parameters below</Text>
                              )}
                            </div>

                            {!hasParams && target.test?.resultEntryType === 'QUALITATIVE' && target.test?.allowCustomResultText && (
                              <Form.Item noStyle shouldUpdate>
                                {() => editResultForm.getFieldValue([target.id, 'resultText']) === '__other__' && (
                                  <div style={{ marginTop: 8, paddingLeft: isPanel ? 0 : 0 }}>
                                    <Form.Item
                                      name={[target.id, 'customResultText']}
                                      rules={[{ required: true, message: 'Enter custom text' }]}
                                      label={isPanel ? null : 'Custom text'}
                                    >
                                      <Input style={{ ...panelResultControlStyle, textAlign: 'center' }} placeholder="Specify custom result..." size="small" />
                                    </Form.Item>
                                  </div>
                                )}
                              </Form.Item>
                            )}

                            {isPanel && (
                              <>
                                <div style={{ flex: '1 1 14%', textAlign: 'center', fontSize: 12 }}>
                                  {target.test?.unit || '-'}
                                </div>
                                <div
                                  style={{
                                    flex: '1 1 22%',
                                    textAlign: 'center',
                                    fontSize: 12,
                                    color: 'rgba(128,128,128,0.8)',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {formatReferenceRange(
                                    resolveSexSpecificNormalText(
                                      target.test,
                                      editResultContext.patientSex,
                                    ),
                                    target.test?.normalMin,
                                    target.test?.normalMax,
                                    target.test?.unit,
                                  )}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Parameters */}
                          {hasParams && !isPanel && (
                            <div
                              className="panel-entry-params"
                              style={{
                                marginTop: isPanel ? 12 : 16,
                                padding: 16,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#fafafa',
                                borderRadius: 8,
                                border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f0f0f0'
                              }}
                            >
                              <Row gutter={[16, 12]}>
                                {target.test?.parameterDefinitions!.map((def) => (
                                  <Col key={def.code} xs={24} sm={12}>
                                    <Form.Item
                                      name={[target.id, 'resultParameters', def.code]}
                                      label={<span style={{ fontSize: 12 }}>{def.label}</span>}
                                      style={{ marginBottom: 0 }}
                                    >
                                      {def.type === 'select' ? (
                                        <Select
                                          allowClear
                                          size={isPanel ? 'middle' : 'small'}
                                          options={[
                                            ...(def.options ?? []).map((o) => ({ label: o, value: o })),
                                            { label: 'Other...', value: '__other__' },
                                          ]}
                                        />
                                      ) : (
                                        <Input size={isPanel ? 'middle' : 'small'} placeholder="Enter..." />
                                      )}
                                    </Form.Item>
                                  </Col>
                                ))}
                              </Row>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}

              <Form.Item className="panel-entry-footer" style={{ marginBottom: 0, marginTop: 6 }}>
                <Space style={{ width: '100%', justifyContent: 'flex-end' }} size="middle">
                  <Button
                    onClick={() => {
                      setEditResultModalOpen(false);
                      setEditResultContext(null);
                      editResultForm.resetFields();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="primary" htmlType="submit" loading={savingResult}>
                    Save Result
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      <Title level={2} style={{ marginTop: 0, marginBottom: 10 }}>
        Reports
      </Title>
      <WorklistStatusDashboard stats={worklistStats} style={{ marginBottom: 12 }} />
      <Card className="queue-main-card">
        <div className="queue-filters-block">
          <Space wrap size={[10, 10]} className="queue-filter-toolbar">
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                }
              }}
              format="YYYY-MM-DD"
              style={{ width: 260 }}
            />

            <Input
              allowClear
              placeholder="Order #, patient, phone"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onPressEnter={() => {
                void loadOrders(1);
              }}
              style={{ width: 260 }}
            />

            <Select
              value={statusFilter}
              onChange={(value) => {
                const nextStatusFilter = value as ReportStatusFilter;
                setStatusFilter(nextStatusFilter);
                void loadOrders(1, nextStatusFilter);
              }}
              placeholder="Status"
              allowClear={false}
              style={{ width: 260 }}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'VERIFIED', label: 'Verified' },
                { value: 'REJECTED', label: 'Rejected' },
              ]}
            />

            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => {
                void loadOrders(1);
              }}
              loading={loading}
            >
              Search
            </Button>
          </Space>
        </div>

        <div className="queue-table-block">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : orders.length === 0 ? (
            <Empty description="No orders found" />
          ) : (
            <Table
              className="reports-orders-table queue-orders-table"
              columns={columns}
              dataSource={orders}
              rowKey="id"
              showHeader
              rowClassName={(record) => (expandedOrderIds.includes(record.id) ? 'reports-order-row-expanded' : '')}
              expandable={{
                expandedRowRender: (record) => renderExpandedOrder(record),
                rowExpandable: (record) => Number(record.testsCount ?? 0) > 0,
                expandRowByClick: true,
                showExpandColumn: false,
                expandedRowKeys: expandedOrderIds,
                onExpand: (expanded, record) => {
                  setExpandedOrderIds(expanded ? [record.id] : []);
                  if (expanded) {
                    void ensureOrderDetails(record.id);
                  }
                },
              }}
              scroll={{ x: 1260 }}
              pagination={{
                current: ordersPage,
                pageSize: ordersPageSize,
                total: ordersTotal,
                showSizeChanger: false,
                onChange: (nextPage) => {
                  void loadOrders(nextPage);
                },
              }}
            />
          )}
        </div>
      </Card>
    </div >
  );
}
