import { useEffect, useMemo, useState } from 'react';
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
  DownloadOutlined,
  EditOutlined,
  FilePdfOutlined,
  MessageOutlined,
  MoreOutlined,
  PrinterOutlined,
  SearchOutlined,
  SendOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  downloadOrderReceiptPDF,
  downloadTestResultsPDF,
  enterResult,
  getLabSettings,
  getWorklistStats,
  logReportDelivery,
  searchOrders,
  updateOrderPayment,
  type OrderDto,
  type OrderStatus,
  type OrderTestDto,
  type TestParameterDefinition,
  type WorklistStats,
} from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import { WorklistStatusDashboard } from '../components/WorklistStatusDashboard';
import {
  directPrintReceipt,
  directPrintReportPdf,
  getDirectPrintErrorMessage,
  isVirtualSavePrinterName,
} from '../printing/direct-print';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type DeliveryChannel = 'WHATSAPP' | 'VIBER';
type EditResultMode = 'SINGLE' | 'PANEL';
type ReportStatusFilter = 'ALL' | 'PENDING' | 'COMPLETED' | 'VERIFIED' | 'REJECTED';

type EditResultContext = {
  editMode: EditResultMode;
  orderTestId: string;
  orderNumber: string;
  patientName: string;
  testCode: string;
  testName: string;
  testUnit: string | null;
  normalMin: number | null;
  normalMax: number | null;
  normalText: string | null;
  resultEntryType: 'NUMERIC' | 'QUALITATIVE' | 'TEXT';
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
  HH: { color: 'red', label: 'Critical High' },
  LL: { color: 'volcano', label: 'Critical Low' },
  POS: { color: 'red', label: 'Positive' },
  NEG: { color: 'green', label: 'Negative' },
  ABN: { color: 'purple', label: 'Abnormal' },
};

function cleanPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

function buildResultsMessage(order: OrderDto): string {
  const patientName = order.patient?.fullName?.trim() || 'Patient';
  const orderNum = order.orderNumber || order.id.substring(0, 8);
  const date = dayjs(order.registeredAt).format('YYYY-MM-DD');

  return `Hello ${patientName},\n\nYour lab results for Order #${orderNum} (${date}) are ready.\n\nPlease visit our laboratory to collect your report or contact us for more information.\n\nThank you!`;
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

  const parameters = orderTest.resultParameters;
  if (parameters && Object.keys(parameters).length > 0) {
    return Object.keys(parameters).join(', ');
  }

  if (orderTest.resultValue !== null && orderTest.resultValue !== undefined) {
    const unit = orderTest.test?.unit ? ` ${orderTest.test.unit}` : '';
    return `${orderTest.resultValue}${unit}`;
  }

  if (orderTest.resultText?.trim()) {
    return 'Text result';
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

function getResultAvailability(order: OrderDto): { ready: boolean; completed: number; total: number } {
  // Panel-aware availability: a panel parent counts as one report test.
  const tests = getRootOrderTests(order);
  if (tests.length === 0) {
    return { ready: false, completed: 0, total: 0 };
  }

  const verified = tests.filter((test) => test.status === 'VERIFIED').length;
  const total = tests.length;

  return {
    ready: verified === total && total > 0,
    completed: verified,
    total,
  };
}

function getReportStatus(order: OrderDto): Exclude<ReportStatusFilter, 'ALL'> {
  const tests = getRootOrderTests(order);
  if (tests.length === 0) return 'PENDING';

  const statuses = tests.map((t) => t.status);
  if (statuses.some((s) => s === 'REJECTED')) return 'REJECTED';
  if (statuses.every((s) => s === 'VERIFIED')) return 'VERIFIED';
  if (statuses.every((s) => s === 'COMPLETED' || s === 'VERIFIED')) return 'COMPLETED';
  return 'PENDING';
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
  const screens = useBreakpoint();
  const isCompactActions = !screens.lg;
  const isDark = useTheme().theme === 'dark';

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [worklistStats, setWorklistStats] = useState<WorklistStats | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>('ALL');
  const [downloading, setDownloading] = useState<string | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState<OrderDto | null>(null);
  const [paymentModalPendingAction, setPaymentModalPendingAction] = useState<(() => void) | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  const [editResultModalOpen, setEditResultModalOpen] = useState(false);
  const [editResultContext, setEditResultContext] = useState<EditResultContext | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editResultForm] = Form.useForm<any>();
  const compactCellStyle = { paddingTop: 6, paddingBottom: 6, fontSize: 12 };

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return orders;
    return orders.filter((order) => getReportStatus(order) === statusFilter);
  }, [orders, statusFilter]);

  const selectedOrders = useMemo(
    () => filteredOrders.filter((order) => selectedOrderIds.includes(order.id)),
    [filteredOrders, selectedOrderIds],
  );

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

  const canReleaseResults = (order: OrderDto): boolean => {
    const availability = getResultAvailability(order);
    return availability.ready && order.paymentStatus === 'paid';
  };

  const loadOrders = async () => {
    if (!dateRange[0] || !dateRange[1]) return;

    setLoading(true);
    try {
      const [ordersResult, statsResult] = await Promise.all([
        searchOrders({
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
          search: searchText.trim() || undefined,
          size: 1000,
        }),
        getWorklistStats().catch(() => null),
      ]);

      setOrders(ordersResult?.items || []);
      if (statsResult) {
        setWorklistStats(statsResult);
      }
      setSelectedOrderIds([]);
    } catch (error) {
      console.error('Failed to load orders:', error);
      message.error('Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (expandedOrderIds.length === 0) return;
    const expandedId = expandedOrderIds[0];
    if (!filteredOrders.some((order) => order.id === expandedId)) {
      setExpandedOrderIds([]);
    }
  }, [expandedOrderIds, filteredOrders]);

  const hasActiveExpandedEtaRows = useMemo(() => {
    if (expandedOrderIds.length === 0) return false;
    const expandedSet = new Set(expandedOrderIds);
    return filteredOrders.some((order) => {
      if (!expandedSet.has(order.id)) return false;
      const rootTests = getRootOrderTests(order);
      return rootTests.some((test) => isEtaLoadingStatus(test.status));
    });
  }, [expandedOrderIds, filteredOrders]);

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

  const handleDownloadResults = async (orderId: string, order?: OrderDto) => {
    if (order && !canReleaseResults(order)) {
      setPaymentModalOrder(order);
      setPaymentModalPendingAction(() => () => handleDownloadResults(orderId));
      setPaymentModalOpen(true);
      return;
    }

    setDownloading(`results-${orderId}`);
    try {
      const blob = await downloadTestResultsPDF(orderId);
      triggerPdfDownload(blob, `results-${orderId.substring(0, 8)}.pdf`);
      message.success('Results report downloaded');
    } catch (error: unknown) {
      const is403 =
        error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 403;

      if (is403 && order) {
        setPaymentModalOrder(order);
        setPaymentModalPendingAction(() => () => handleDownloadResults(orderId));
        setPaymentModalOpen(true);
      } else {
        message.error('Failed to download results report');
      }
    } finally {
      setDownloading(null);
    }
  };

  const handlePrintResults = async (orderId: string, order?: OrderDto) => {
    if (order && !canReleaseResults(order)) {
      setPaymentModalOrder(order);
      setPaymentModalPendingAction(() => () => handlePrintResults(orderId));
      setPaymentModalOpen(true);
      return;
    }

    setDownloading(`print-${orderId}`);
    try {
      const blob = await downloadTestResultsPDF(orderId);
      try {
        const settings = await getLabSettings();
        const printerName = settings.printing?.reportPrinterName?.trim();
        if (settings.printing?.mode === 'direct_qz' && printerName) {
          if (isVirtualSavePrinterName(printerName)) {
            message.info(
              `Report printer "${printerName}" is a virtual PDF/XPS printer. Using browser print so Save dialog can appear.`,
            );
          } else {
            try {
              await directPrintReportPdf({
                orderId,
                blob,
                printerName,
              });
              message.success(`Report sent to ${printerName}`);
              return;
            } catch (error) {
              message.warning(`${getDirectPrintErrorMessage(error)} Falling back to browser print.`);
            }
          }
        }
      } catch {
        // continue with browser print fallback
      }

      const url = window.URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.border = '0';
      iframe.src = url;
      const cleanup = () => {
        window.URL.revokeObjectURL(url);
        iframe.remove();
      };
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          window.setTimeout(cleanup, 5000);
        }
      };
      document.body.appendChild(iframe);
    } catch (error: unknown) {
      const is403 =
        error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 403;

      if (is403 && order) {
        setPaymentModalOrder(order);
        setPaymentModalPendingAction(() => () => handlePrintResults(orderId));
        setPaymentModalOpen(true);
      } else {
        message.error('Failed to load results for printing');
      }
    } finally {
      setDownloading(null);
    }
  };

  const handlePrintReceipt = async (order: OrderDto) => {
    setDownloading(`receipt-${order.id}`);
    try {
      try {
        const settings = await getLabSettings();
        const printerName = settings.printing?.receiptPrinterName?.trim();
        if (settings.printing?.mode === 'direct_qz' && printerName) {
          if (isVirtualSavePrinterName(printerName)) {
            message.info(
              `Receipt printer "${printerName}" is a virtual PDF/XPS printer. Using browser print so Save dialog can appear.`,
            );
          } else {
            try {
              await directPrintReceipt({
                order,
                printerName,
              });
              message.success(`Receipt sent to ${printerName}`);
              return;
            } catch (error) {
              message.warning(`${getDirectPrintErrorMessage(error)} Falling back to browser print.`);
            }
          }
        }
      } catch {
        // continue with browser print fallback
      }

      const blob = await downloadOrderReceiptPDF(order.id);
      const url = window.URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.border = '0';
      iframe.src = url;
      const cleanup = () => {
        window.URL.revokeObjectURL(url);
        iframe.remove();
      };
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          window.setTimeout(cleanup, 5000);
        }
      };
      document.body.appendChild(iframe);
    } catch {
      message.error('Failed to print receipt');
    } finally {
      setDownloading(null);
    }
  };

  const logDelivery = async (order: OrderDto, channel: DeliveryChannel) => {
    try {
      await logReportDelivery(order.id, channel);
    } catch (error) {
      console.error('Failed to log report delivery', error);
    }
  };

  const handleSendWhatsApp = async (order: OrderDto) => {
    if (!canReleaseResults(order)) {
      setPaymentModalOrder(order);
      setPaymentModalPendingAction(() => () => handleSendWhatsApp(order));
      setPaymentModalOpen(true);
      return;
    }

    const phone = order.patient?.phone;
    if (!phone) {
      message.warning('Patient has no phone number');
      return;
    }

    const cleanedPhone = cleanPhoneNumber(phone);
    const messageText = buildResultsMessage(order);
    await logDelivery(order, 'WHATSAPP');

    const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');
  };

  const handleSendViber = async (order: OrderDto) => {
    if (!canReleaseResults(order)) {
      setPaymentModalOrder(order);
      setPaymentModalPendingAction(() => () => handleSendViber(order));
      setPaymentModalOpen(true);
      return;
    }

    const phone = order.patient?.phone;
    if (!phone) {
      message.warning('Patient has no phone number');
      return;
    }

    const cleanedPhone = cleanPhoneNumber(phone);
    const messageText = buildResultsMessage(order);
    await logDelivery(order, 'VIBER');

    const url = `viber://chat?number=${encodeURIComponent(cleanedPhone)}&text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');
  };

  const handleBulkDownload = async () => {
    if (selectedOrders.length === 0) {
      message.info('Select at least one order');
      return;
    }

    const paidOrders = selectedOrders.filter((order) => order.paymentStatus === 'paid');
    const unpaidCount = selectedOrders.length - paidOrders.length;

    if (paidOrders.length === 0) {
      message.warning('Selected orders are unpaid. Mark as paid to download results.');
      return;
    }

    setDownloading('bulk-download');
    let success = 0;
    let failed = 0;

    for (const order of paidOrders) {
      try {
        const blob = await downloadTestResultsPDF(order.id);
        triggerPdfDownload(blob, `results-${(order.orderNumber || order.id).substring(0, 8)}.pdf`);
        success += 1;
      } catch {
        failed += 1;
      }
    }

    setDownloading(null);
    message.success(
      `Downloaded ${success} report(s)${failed ? `, failed ${failed}` : ''}${unpaidCount ? ` (${unpaidCount} unpaid skipped)` : ''}`,
    );
  };

  const handleBulkSend = async (channel: DeliveryChannel) => {
    if (selectedOrders.length === 0) {
      message.info('Select at least one order');
      return;
    }

    const paidWithPhone = selectedOrders.filter(
      (order) => order.paymentStatus === 'paid' && !!order.patient?.phone,
    );
    const unpaidCount = selectedOrders.filter((order) => order.paymentStatus !== 'paid').length;

    if (paidWithPhone.length === 0) {
      message.warning(
        unpaidCount
          ? 'Selected orders are unpaid or have no phone. Mark as paid to send.'
          : 'Selected orders have no phone number.',
      );
      return;
    }

    setDownloading(`bulk-${channel.toLowerCase()}`);
    let sent = 0;

    for (const order of paidWithPhone) {
      if (channel === 'WHATSAPP') {
        await handleSendWhatsApp(order);
      } else {
        await handleSendViber(order);
      }
      sent += 1;
    }

    setDownloading(null);
    message.success(
      `Prepared ${sent} ${channel} message(s)${unpaidCount ? ` (${unpaidCount} unpaid skipped)` : ''}`,
    );
  };

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
      testCode: orderTest.test?.code || '-',
      testName: orderTest.test?.name || '-',
      testUnit: orderTest.test?.unit ?? null,
      normalMin: orderTest.test?.normalMin ?? null,
      normalMax: orderTest.test?.normalMax ?? null,
      normalText: orderTest.test?.normalText ?? null,
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
          resultEntryType === 'QUALITATIVE' || resultEntryType === 'TEXT'
            ? undefined
            : valueCandidate,
        resultText: initialResultText,
        customResultText,
        resultParameters: { ...defaults, ...resultParametersInitial },
        resultParametersCustom: resultParametersCustomInitial,
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

        if (resultEntryType === 'QUALITATIVE') {
          if (resultText === '__other__') {
            resultText = itemValues.customResultText?.trim() || null;
          }
          resultValue = null;
        } else if (resultEntryType === 'TEXT') {
          resultValue = null;
        }

        await enterResult(target.id, {
          resultValue,
          resultText,
          resultParameters: hasResultParameters ? resultParameters : null,
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

  const renderExpandedOrder = (order: OrderDto) => {
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>
                {row.testCode}
              </Tag>
              <Text strong style={{ fontSize: 12 }}>
                {row.testName}
              </Text>
            </div>
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
              (row.raw.test?.normalMin !== null ||
                row.raw.test?.normalMax !== null ||
                row.raw.test?.normalText) && (
                <div style={{ fontSize: 10, color: 'rgba(128,128,128,0.7)', marginTop: 2 }}>
                  Range:{' '}
                  {row.raw.test?.normalText ||
                    `${row.raw.test?.normalMin ?? '-'} - ${row.raw.test?.normalMax ?? '-'} ${row.raw.test?.unit || ''}`}
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
          const meta = row.flag ? RESULT_FLAG_META[row.flag] : null;
          if (!meta || row.flag === 'N')
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

  const renderOrderActions = (record: OrderDto) => {
    const hasPhone = !!record.patient?.phone;
    const availability = getResultAvailability(record);
    const reportReady = availability.ready;
    const paid = record.paymentStatus === 'paid';
    const notReadyTooltip = reportReady ? null : 'Not all tests verified';
    const paymentTooltip = !paid ? 'Payment required to release results' : null;

    const menuItems = [
      {
        key: 'results',
        label: 'Download Results',
        icon: <FilePdfOutlined />,
        disabled: !reportReady,
        onClick: () => handleDownloadResults(record.id, record),
      },
      {
        key: 'print',
        label: 'Print',
        icon: <PrinterOutlined />,
        disabled: !reportReady,
        onClick: () => handlePrintResults(record.id, record),
      },
      {
        key: 'wa',
        label: 'WhatsApp',
        icon: <WhatsAppOutlined />,
        disabled: !hasPhone || !reportReady,
        onClick: () => handleSendWhatsApp(record),
      },
      {
        key: 'viber',
        label: 'Viber',
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
      <Space
        onClick={(event) => event.stopPropagation()}
        size={4}
        wrap={false}
        style={{ width: '100%', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}
      >
        <Tooltip title={!reportReady ? notReadyTooltip : paymentTooltip || 'Download results PDF'}>
          <Button
            type="link"
            size="small"
            icon={<FilePdfOutlined />}
            disabled={!reportReady}
            loading={downloading === `results-${record.id}`}
            onClick={() => handleDownloadResults(record.id, record)}
          >
            Results
          </Button>
        </Tooltip>
        <Tooltip title={!reportReady ? notReadyTooltip : paymentTooltip || 'Print results'}>
          <Button
            type="link"
            size="small"
            icon={<PrinterOutlined />}
            disabled={!reportReady}
            loading={downloading === `print-${record.id}`}
            onClick={() => handlePrintResults(record.id, record)}
          >
            Print
          </Button>
        </Tooltip>
        <Tooltip
          title={!reportReady ? notReadyTooltip : !hasPhone ? 'No phone number' : paymentTooltip || 'Send via WhatsApp'}
        >
          <Button
            type="link"
            size="small"
            icon={<WhatsAppOutlined />}
            disabled={!hasPhone || !reportReady}
            onClick={() => handleSendWhatsApp(record)}
            style={{ color: hasPhone ? '#25D366' : undefined }}
          >
            WhatsApp
          </Button>
        </Tooltip>
        <Tooltip
          title={!reportReady ? notReadyTooltip : !hasPhone ? 'No phone number' : paymentTooltip || 'Send via Viber'}
        >
          <Button
            type="link"
            size="small"
            icon={<MessageOutlined />}
            disabled={!hasPhone || !reportReady}
            onClick={() => handleSendViber(record)}
            style={{ color: hasPhone ? '#7360F2' : undefined }}
          >
            Viber
          </Button>
        </Tooltip>
      </Space>
    );
  };

  const columns = [
    {
      title: 'Patient',
      key: 'patient',
      width: 260,
      render: (_: unknown, record: OrderDto) => (
        <Space size={8} style={{ minWidth: 0 }}>
          <UserOutlined style={{ fontSize: 14, color: '#1677ff' }} />
          <Text strong ellipsis style={{ fontSize: 13 }}>
            {record.patient?.fullName?.trim() || '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'statusSummary',
      width: 260,
      render: (_: unknown, record: OrderDto) => {
        const availability = getResultAvailability(record);
        const testsCount = getRootOrderTests(record).length;

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
      render: (_: unknown, record: OrderDto) => (
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
      render: (_: unknown, record: OrderDto) => (
        <Text style={{ fontSize: 12 }}>{dayjs(record.registeredAt).format('YYYY-MM-DD HH:mm')}</Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: isCompactActions ? 80 : 360,
      render: (_: unknown, record: OrderDto) => (
        <div style={{ minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
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
      await updateOrderPayment(order.id, { paymentStatus: 'paid' });
      message.success('Order marked as paid');
      await loadOrders();

      const action = paymentModalPendingAction;
      setPaymentModalOpen(false);
      setPaymentModalOrder(null);
      setPaymentModalPendingAction(null);

      try {
        if (typeof action === 'function') {
          action();
        }
      } catch {
        // no-op
      }
    } catch {
      message.error('Failed to mark as paid');
    } finally {
      setMarkingPaid(false);
    }
  };

  return (
    <div>
      <style>{`
        .reports-orders-table .ant-table-thead {
          display: table-header-group !important;
          visibility: visible !important;
        }
        .reports-orders-table .ant-table-thead > tr {
          display: table-row !important;
        }
        .reports-orders-table .ant-table-thead > tr > th {
          background: ${isDark ? 'rgba(255,255,255,0.06)' : '#f5f8ff'} !important;
          color: ${isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.88)'} !important;
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.14)' : '#d9e5ff'} !important;
          font-weight: 700;
          font-size: 12px;
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .reports-orders-table .ant-table-tbody > tr > td {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
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
          border-radius: 14px;
          overflow: hidden;
        }
        .panel-entry-modal .ant-modal-header {
          padding: 11px 14px;
          margin-bottom: 0;
        }
        .panel-entry-modal .ant-modal-body {
          padding: 8px 12px 12px !important;
          max-height: calc(100vh - 140px);
          overflow-y: auto;
        }
        .panel-entry-modal .panel-entry-summary {
          margin-bottom: 8px;
          padding: 9px 10px;
          border-radius: 6px;
        }
        .panel-entry-modal .panel-entry-grid-head {
          padding: 5px 8px !important;
          margin-bottom: 0 !important;
        }
        .panel-entry-modal .panel-entry-grid-row {
          padding: 4px 8px !important;
          margin-bottom: 0 !important;
        }
        .panel-entry-modal .panel-entry-grid-row .ant-form-item {
          margin-bottom: 0;
        }
        .panel-entry-modal .panel-entry-params {
          margin-top: 6px !important;
          padding: 8px 10px !important;
        }
        .panel-entry-modal .panel-entry-footer {
          margin-top: 8px !important;
        }
        @media (max-width: 992px) {
          .panel-entry-modal .ant-modal {
            margin: 10px auto;
          }
          .panel-entry-modal .ant-modal-body {
            max-height: calc(100vh - 116px);
            padding: 10px 12px 12px !important;
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
                    <Text>
                      {editResultContext.normalText ||
                        `${editResultContext.normalMin ?? '-'} - ${editResultContext.normalMax ?? '-'} ${editResultContext.testUnit || ''}`}
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
                        <div style={{ flex: '1 1 24%' }}>Test</div>
                        <div style={{ flex: '1 1 40%' }}>Result</div>
                        <div style={{ flex: '1 1 14%', textAlign: 'center' }}>Unit</div>
                        <div style={{ flex: '1 1 22%', textAlign: 'right' }}>Ref. Range</div>
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
                                borderBottom: !isLastRow
                                  ? (isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f0f0f0')
                                  : 'none',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 24%' }}>
                                  <Text style={{ fontSize: 11, lineHeight: '15px' }}>{def.label}</Text>
                                </div>
                                <div style={{ flex: '1 1 40%' }}>
                                  <Form.Item name={[target.id, 'resultParameters', def.code]} noStyle>
                                    {def.type === 'select' ? (
                                      <Select
                                        allowClear
                                        showSearch
                                        style={{ width: '100%' }}
                                        size="small"
                                        placeholder="Select"
                                        options={[
                                          ...(def.options ?? []).map((o) => ({ label: o, value: o })),
                                          { label: 'Other...', value: '__other__' },
                                        ]}
                                      />
                                    ) : (
                                      <Input style={{ width: '100%' }} size="small" placeholder="Result" />
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
                                          <Input size="small" placeholder="Specify custom value..." />
                                        </Form.Item>
                                      )}
                                    </Form.Item>
                                  )}
                                </div>
                                <div style={{ flex: '1 1 14%', textAlign: 'center', fontSize: 11 }}>
                                  -
                                </div>
                                <div style={{ flex: '1 1 22%', textAlign: 'right', fontSize: 11, color: 'rgba(128,128,128,0.8)' }}>
                                  -
                                </div>
                              </div>
                            </div>
                          );
                        });
                      }

                      return (
                        <div key={target.id} className={isPanel ? 'panel-entry-grid-row' : undefined} style={{
                          marginBottom: isPanel ? 0 : 10,
                          padding: isPanel ? undefined : 0,
                          borderBottom: isPanel && idx < targetItems.length - 1 ? (isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f0f0f0') : 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ flex: isPanel ? '1 1 24%' : '1 1 100%', marginBottom: isPanel ? 0 : 8 }}>
                              <Text strong={!isPanel} style={{ fontSize: isPanel ? 12 : 14 }}>{target.test?.name}</Text>
                            </div>

                            <div style={{ flex: isPanel ? '1 1 40%' : '1 1 100%' }}>
                              {!hasParams ? (
                                <Form.Item
                                  name={[target.id, 'resultText']}
                                  noStyle={isPanel}
                                  rules={target.test?.resultEntryType === 'QUALITATIVE' ? [{ required: true, message: 'Required' }] : []}
                                >
                                  {target.test?.resultEntryType === 'NUMERIC' ? (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: isPanel ? '100%' : undefined }}>
                                      <Form.Item name={[target.id, 'resultValue']} noStyle>
                                        <InputNumber
                                          style={{ width: '100%' }}
                                          placeholder="Value"
                                          precision={2}
                                          size={isPanel ? 'small' : 'large'}
                                        />
                                      </Form.Item>
                                      {target.test?.resultEntryType === 'NUMERIC' && !isPanel && target.test?.unit && <Text type="secondary">{target.test.unit}</Text>}
                                    </div>
                                  ) : target.test?.resultEntryType === 'QUALITATIVE' && (target.test?.resultTextOptions?.length ?? 0) > 0 ? (
                                    <Select
                                      allowClear
                                      showSearch
                                      style={panelResultControlStyle}
                                      size={isPanel ? 'small' : 'large'}
                                      placeholder="Select"
                                      options={[
                                        ...(target.test?.resultTextOptions ?? []).map((o) => ({ label: o.value, value: o.value })),
                                        ...(target.test?.allowCustomResultText ? [{ label: 'Other...', value: '__other__' }] : []),
                                      ]}
                                    />
                                  ) : (
                                    <Input style={panelResultControlStyle} size={isPanel ? 'small' : 'large'} placeholder="Result text" />
                                  )}
                                </Form.Item>
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
                                      <Input style={panelResultControlStyle} placeholder="Specify custom result..." size="small" />
                                    </Form.Item>
                                  </div>
                                )}
                              </Form.Item>
                            )}

                            {isPanel && (
                              <>
                                <div style={{ flex: '1 1 14%', textAlign: 'center', fontSize: 11 }}>
                                  {target.test?.unit || '-'}
                                </div>
                                <div style={{ flex: '1 1 22%', textAlign: 'right', fontSize: 11, color: 'rgba(128,128,128,0.8)' }}>
                                  {target.test?.normalText || `${target.test?.normalMin ?? '-'} - ${target.test?.normalMax ?? '-'}`}
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

              <Form.Item className="panel-entry-footer" style={{ marginBottom: 0, marginTop: 12 }}>
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
          </div >
        )}
      </Modal >

      <Title level={2} style={{ marginTop: 0, marginBottom: 10 }}>
        Reports
      </Title>
      <WorklistStatusDashboard stats={worklistStats} style={{ marginBottom: 12 }} />
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Space wrap>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                }
              }}
              format="YYYY-MM-DD"
            />

            <Input
              allowClear
              placeholder="Order #, patient, phone"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onPressEnter={loadOrders}
              style={{ width: 260 }}
            />

            <Select
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as ReportStatusFilter)}
              placeholder="Status"
              allowClear={false}
              style={{ width: 180 }}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'VERIFIED', label: 'Verified' },
                { value: 'REJECTED', label: 'Rejected' },
              ]}
            />

            <Button type="primary" icon={<SearchOutlined />} onClick={loadOrders} loading={loading}>
              Search
            </Button>
          </Space>

          <Space wrap>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleBulkDownload}
              loading={downloading === 'bulk-download'}
              disabled={selectedOrderIds.length === 0}
            >
              Download Selected
            </Button>
            <Button
              icon={<SendOutlined />}
              onClick={() => handleBulkSend('WHATSAPP')}
              loading={downloading === 'bulk-whatsapp'}
              disabled={selectedOrderIds.length === 0}
            >
              Send WhatsApp
            </Button>
            <Button
              icon={<SendOutlined />}
              onClick={() => handleBulkSend('VIBER')}
              loading={downloading === 'bulk-viber'}
              disabled={selectedOrderIds.length === 0}
            >
              Send Viber
            </Button>
          </Space>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <Empty description="No orders found" />
          ) : (
            <Table
              className="reports-orders-table"
              columns={columns}
              dataSource={filteredOrders}
              rowKey="id"
              showHeader
              rowClassName={(record) => (expandedOrderIds.includes(record.id) ? 'reports-order-row-expanded' : '')}
              rowSelection={{
                selectedRowKeys: selectedOrderIds,
                onChange: (keys) => setSelectedOrderIds(keys as string[]),
              }}
              expandable={{
                expandedRowRender: (record) => renderExpandedOrder(record),
                rowExpandable: (record) => getOrderTestRows(record).length > 0,
                expandRowByClick: true,
                showExpandColumn: false,
                expandedRowKeys: expandedOrderIds,
                onExpand: (expanded, record) => {
                  setExpandedOrderIds(expanded ? [record.id] : []);
                },
              }}
              scroll={{ x: 1260 }}
              pagination={{ pageSize: 20 }}
            />
          )}
        </Space>
      </Card>
    </div >
  );
}
