import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  AutoComplete,
  Card,
  Button,
  Space,
  message,
  Select,
  Input,
  DatePicker,
  Pagination,
  Typography,
  InputNumber,
  Empty,
  Spin,
  Result,
  Row,
  Col,
  List,
  Tag,
  Modal,
  Table,
  Tooltip,
} from 'antd';
import {
  ShoppingCartOutlined,
  PrinterOutlined,
  UserOutlined,
  DeleteOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  createOrder,
  getTests,
  getPatient,
  getDepartments,
  getShifts,
  searchOrdersHistory,
  getOrder,
  getNextOrderNumber,
  getOrderPriceEstimate,
  getLabSettings,
  updateOrderPayment,
  updateOrderDiscount,
  updateOrderTests,
  updateOrderDeliveryMethods,
  type CreateOrderDto,
  type DeliveryMethod,
  type PatientDto,
  type TestDto,
  type OrderTestDto,
  type OrderDto,
  type OrderCreateSummaryDto,
  type OrderHistoryItemDto,
  type OrderStatus,
  type DepartmentDto,
  type ShiftDto,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { PrintPreviewModal } from '../components/Print';
import {
  directPrintLabels,
  directPrintReceipt,
  getDirectPrintErrorMessage,
} from '../printing/direct-print';
import { formatDateKeyForTimeZone } from '../utils/lab-timezone';
import { buildKeyboardSearchVariants } from '../utils/keyboard-map';
import './OrdersPage.css';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface SelectedTest {
  testId: string;
  testCode: string;
  testName: string;
  tubeType: string;
  displayLabel?: string;
  sortCategoryKey?: string;
  price?: number | null;
  removable?: boolean;
  blocked?: boolean;
  blockedReason?: string | null;
  adminReasonRequired?: boolean;
  currentStatus?: string | null;
  isPanelRoot?: boolean;
}

function getPatientName(p: PatientDto) {
  return p.fullName?.trim() || '';
}

interface OrderListRow {
  rowId: string;
  patient: PatientDto;
  createdOrder: OrderHistoryItemDto | null;
}

const ORDER_PAGE_SIZE = 25;
const CREATE_ORDER_TIMEOUT_MS = 15_000;
const CREATE_ORDER_SLOW_FEEDBACK_MS = 1_200;
const ORDER_STATUS_FILTERS: Array<{ label: string; value: 'ALL' | OrderStatus }> = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Registered', value: 'REGISTERED' },
  { label: 'Completed', value: 'COMPLETED' },
];
const ORDER_STATUS_TAG_COLORS: Record<OrderStatus, string> = {
  REGISTERED: 'blue',
  COLLECTED: 'purple',
  IN_PROGRESS: 'cyan',
  COMPLETED: 'green',
  CANCELLED: 'red',
};
const DELIVERY_METHODS: DeliveryMethod[] = ['PRINT', 'WHATSAPP', 'VIBER'];
const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  PRINT: 'Print',
  WHATSAPP: 'WhatsApp',
  VIBER: 'Viber',
};
const SHIFT_COLOR_PALETTE = [
  'magenta',
  'volcano',
  'orange',
  'gold',
  'lime',
  'green',
  'cyan',
  'blue',
  'geekblue',
  'purple',
] as const;
const ONLY_TODAYS_ORDERS_EDITABLE_MESSAGE = "Only today's orders can be edited.";

function normalizeReferringDoctorList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function getShiftLabel(order: { shift: { name: string | null; code: string | null } | null }): string {
  return order.shift?.name?.trim() || order.shift?.code?.trim() || 'No shift';
}

function getShiftTagColor(shiftLabel: string): (typeof SHIFT_COLOR_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < shiftLabel.length; i += 1) {
    hash = (hash * 31 + shiftLabel.charCodeAt(i)) | 0;
  }
  return SHIFT_COLOR_PALETTE[Math.abs(hash) % SHIFT_COLOR_PALETTE.length];
}

function normalizeDeliveryMethods(methods: readonly string[] | null | undefined): DeliveryMethod[] {
  if (!Array.isArray(methods) || methods.length === 0) return [];
  const selected = new Set<DeliveryMethod>();
  for (const raw of methods) {
    const normalized = String(raw ?? '').trim().toUpperCase();
    if (!normalized) continue;
    if (!DELIVERY_METHODS.includes(normalized as DeliveryMethod)) continue;
    selected.add(normalized as DeliveryMethod);
  }
  return DELIVERY_METHODS.filter((method) => selected.has(method));
}

function formatTokenLabel(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '-';
  return normalized
    .toLowerCase()
    .split('_')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function getEditTestStatusDisplay(status: string | null | undefined): {
  label: string;
  tone: 'pending' | 'in-progress' | 'completed' | 'verified' | 'rejected' | 'unknown';
} {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', tone: 'pending' };
    case 'IN_PROGRESS':
      return { label: 'In progress', tone: 'in-progress' };
    case 'COMPLETED':
      return { label: 'Completed', tone: 'completed' };
    case 'VERIFIED':
      return { label: 'Verified', tone: 'verified' };
    case 'REJECTED':
      return { label: 'Rejected', tone: 'rejected' };
    default:
      return { label: 'Selected', tone: 'unknown' };
  }
}

function getEditTestActionNote(test: SelectedTest): string | null {
  if (test.adminReasonRequired) {
    return 'Reason required';
  }
  if (test.isPanelRoot) {
    return 'Full panel';
  }
  if (test.blockedReason?.includes('lab admin')) {
    return 'Admin only';
  }
  if (test.blocked) {
    return 'Locked';
  }
  return null;
}

function toOrderHistoryItem(order: OrderDto): OrderHistoryItemDto {
  const readyTestsCount = Number(order.readyTestsCount ?? 0) || 0;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    registeredAt: order.registeredAt,
    deliveryMethods: normalizeDeliveryMethods(order.deliveryMethods),
    paymentStatus:
      order.paymentStatus === 'paid' || order.paymentStatus === 'partial'
        ? order.paymentStatus
        : 'unpaid',
    paidAmount: order.paidAmount != null ? Number(order.paidAmount) : null,
    totalAmount: Number(order.totalAmount ?? 0),
    discountPercent: Number(order.discountPercent ?? 0),
    finalAmount: Number(order.finalAmount ?? 0),
    patient: order.patient,
    shift: order.shift,
    testsCount: Number(order.testsCount ?? 0) || 0,
    readyTestsCount,
    reportReady: Boolean(order.reportReady) || readyTestsCount > 0,
  };
}

function toOrderHistoryItemFromSummary(order: OrderCreateSummaryDto): OrderHistoryItemDto {
  const readyTestsCount = Number(order.readyTestsCount ?? 0) || 0;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    registeredAt: order.registeredAt,
    deliveryMethods: normalizeDeliveryMethods(order.deliveryMethods),
    paymentStatus:
      order.paymentStatus === 'paid' || order.paymentStatus === 'partial'
        ? order.paymentStatus
        : 'unpaid',
    paidAmount: order.paidAmount != null ? Number(order.paidAmount) : null,
    totalAmount: Number(order.totalAmount ?? 0),
    discountPercent: Number(order.discountPercent ?? 0),
    finalAmount: Number(order.finalAmount ?? 0),
    patient: order.patient,
    shift: order.shift,
    testsCount: Number(order.testsCount ?? 0) || 0,
    readyTestsCount,
    reportReady: Boolean(order.reportReady) || readyTestsCount > 0,
  };
}

const getTubeColor = (type: string) => {
  const norm = (type || '').toUpperCase();
  if (norm.includes('YELLOW') || norm === 'SERUM') return '#FBBF24'; // Yellow
  if (norm.includes('GREEN') || norm === 'PLASMA') return '#22c55e'; // Green
  if (norm.includes('LAVENDER') || norm.includes('PURPLE') || norm === 'WHOLE_BLOOD') return '#a855f7'; // Purple
  if (norm.includes('RED')) return '#EF4444'; // Red
  if (norm.includes('BLUE') || norm === 'SWAB') return '#3b82f6'; // Blue
  if (norm.includes('GRAY') || norm.includes('GREY')) return '#94a3b8'; // Gray
  if (norm === 'URINE') return '#fef08a'; // Light Yellow
  if (norm === 'STOOL') return '#8b5cf6'; // Violet / Brown
  return '#cbd5e1'; // Default Gray
};

const TubeIcon = ({ color }: { color: string }) => (
  <svg width="12" height="24" viewBox="0 0 12 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <rect x="2" y="7" width="8" height="15" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="1" y="2" width="10" height="5" rx="1.5" fill={color} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
    <rect x="2" y="0.5" width="8" height="2.5" rx="1" fill={color} />
  </svg>
);

export function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const { user, lab, currentShiftId, currentShiftLabel } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const styles = useMemo(
    () => ({
      border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #f0f0f0',
      borderDark: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #d9d9d9',
      bgSubtle: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
    }),
    [isDark]
  );

  const [patientList, setPatientList] = useState<OrderListRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [initialHistoryLoading, setInitialHistoryLoading] = useState(true);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [patientBootstrapLoading, setPatientBootstrapLoading] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listQueryInput, setListQueryInput] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [historyDateRange, setHistoryDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('day'),
    dayjs().startOf('day'),
  ]);
  const [historyShiftFilter, setHistoryShiftFilter] = useState<string>('ALL');
  const [historyShiftOptions, setHistoryShiftOptions] = useState<ShiftDto[]>([]);
  const [draftPatient, setDraftPatient] = useState<PatientDto | null>(null);
  /** When set, loadOrderHistory will select the draft row for this patient (e.g. after "Go to order" from Patients). Cleared after use. Ref to avoid extra list reload. */
  const focusDraftPatientIdRef = useRef<string | null>(null);
  const historyRequestSeqRef = useRef(0);
  const hasLoadedHistoryRef = useRef(false);

  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [testOptions, setTestOptions] = useState<TestDto[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [testSearch, setTestSearch] = useState('');
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  const [uiTestGroups, setUiTestGroups] = useState<{ id: string; name: string; testIds: string[] }[]>([]);
  const [referringDoctorOptions, setReferringDoctorOptions] = useState<string[]>([]);
  const [referredBy, setReferredBy] = useState('');
  const [selectedDeliveryMethods, setSelectedDeliveryMethods] = useState<DeliveryMethod[]>([]);
  const [savingDeliveryMethods, setSavingDeliveryMethods] = useState(false);

  const [subtotal, setSubtotal] = useState<number | null>(0);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);

  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'receipt' | 'labels'>('receipt');
  const [printOrder, setPrintOrder] = useState<OrderDto | null>(null);
  const [printLabelSequenceBy, setPrintLabelSequenceBy] = useState<'tube_type' | 'department'>(
    lab?.labelSequenceBy ?? 'tube_type',
  );
  const [printingAction, setPrintingAction] = useState<'receipt' | 'labels' | null>(null);
  const [nextOrderNumber, setNextOrderNumber] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [updatingDiscount, setUpdatingDiscount] = useState(false);
  const [partialPaymentModalOpen, setPartialPaymentModalOpen] = useState(false);
  const [partialPaymentAmount, setPartialPaymentAmount] = useState<number>(0);
  const [editTestsModalOpen, setEditTestsModalOpen] = useState(false);
  const [editingTests, setEditingTests] = useState<SelectedTest[]>([]);
  const [savingEditedTests, setSavingEditedTests] = useState(false);
  const [editTestsRemovalReasonModalOpen, setEditTestsRemovalReasonModalOpen] = useState(false);
  const [editTestsRemovalReason, setEditTestsRemovalReason] = useState('');
  const [orderDetailsCache, setOrderDetailsCache] = useState<Record<string, OrderDto>>({});
  const [orderDetailsLoadingId, setOrderDetailsLoadingId] = useState<string | null>(null);
  const [orderDetailsErrors, setOrderDetailsErrors] = useState<Record<string, string>>({});
  const orderDetailsRequestVersionRef = useRef<Record<string, number>>({});
  const discountSaveTimerRef = useRef<number | null>(null);
  const discountSaveRequestVersionRef = useRef(0);
  const draftDeliveryMethodsRef = useRef<DeliveryMethod[]>([]);

  const selectedRow = useMemo(
    () => patientList.find((r) => r.rowId === selectedRowId) ?? null,
    [patientList, selectedRowId]
  );
  const selectedPatient = selectedRow?.patient ?? null;
  const selectedCreatedOrderSummary = selectedRow?.createdOrder ?? null;
  const selectedCreatedOrder = useMemo(() => {
    if (!selectedCreatedOrderSummary) return null;
    return orderDetailsCache[selectedCreatedOrderSummary.id] ?? null;
  }, [orderDetailsCache, selectedCreatedOrderSummary]);
  const selectedOrderIsToday = useMemo(() => {
    if (!selectedCreatedOrder) return null;
    return (
      formatDateKeyForTimeZone(
        new Date(selectedCreatedOrder.registeredAt),
        selectedCreatedOrder.lab?.timezone,
      ) ===
      formatDateKeyForTimeZone(new Date(), selectedCreatedOrder.lab?.timezone)
    );
  }, [
    selectedCreatedOrder?.id,
    selectedCreatedOrder?.registeredAt,
    selectedCreatedOrder?.lab?.timezone,
  ]);
  const isSelectedLocked = selectedRow != null && selectedRow.createdOrder != null;
  const selectedOrderDetailsLoading =
    selectedCreatedOrderSummary != null && orderDetailsLoadingId === selectedCreatedOrderSummary.id;
  const selectedOrderDetailsError =
    selectedCreatedOrderSummary != null ? orderDetailsErrors[selectedCreatedOrderSummary.id] ?? null : null;
  const lockedOrderContextActive = isSelectedLocked && selectedCreatedOrderSummary != null;
  const lockedOrderActionsBusy =
    submitting ||
    updatingPayment ||
    updatingDiscount ||
    savingDeliveryMethods ||
    savingEditedTests ||
    printingAction !== null;
  const lockedOrderBaseActionsDisabled = lockedOrderActionsBusy || !lockedOrderContextActive;
  const lockedOrderDetailActionsDisabled =
    lockedOrderActionsBusy || !lockedOrderContextActive || !selectedCreatedOrder;
  const lockedOrderEditTestsDisabled =
    lockedOrderActionsBusy ||
    !lockedOrderContextActive ||
    !selectedCreatedOrder ||
    selectedOrderIsToday === false;
  const lockedOrderBaseActionDisabledTitle = lockedOrderActionsBusy
    ? 'Please wait until the current action finishes.'
    : !lockedOrderContextActive
      ? 'Select a locked order to use these actions.'
      : undefined;
  const lockedOrderDetailActionDisabledTitle = lockedOrderActionsBusy
    ? 'Please wait until the current action finishes.'
    : !lockedOrderContextActive
      ? 'Select a locked order to use these actions.'
      : !selectedCreatedOrder
        ? 'Order details are still loading.'
        : undefined;
  const lockedOrderEditTestsDisabledReason = lockedOrderActionsBusy
    ? 'Please wait until the current action finishes.'
    : !lockedOrderContextActive
      ? 'Select a locked order to use these actions.'
      : !selectedCreatedOrder
        ? 'Order details are still loading.'
        : selectedOrderIsToday === false
          ? ONLY_TODAYS_ORDERS_EDITABLE_MESSAGE
          : undefined;
  const canAdminOverrideLockedTestRemoval =
    Boolean(user?.isImpersonation) ||
    user?.role === 'LAB_ADMIN' ||
    user?.role === 'SUPER_ADMIN';
  const editTestsOrderNumber =
    selectedCreatedOrder?.orderNumber ?? selectedCreatedOrderSummary?.orderNumber ?? null;

  const loadOrderHistory = useCallback(
    async (options?: {
      focusOrderId?: string;
      pageOverride?: number;
      draftPatientOverride?: PatientDto | null;
      mode?: 'initial' | 'soft';
    }) => {
      const effectivePage = options?.pageOverride ?? listPage;
      const effectiveDraft =
        options?.draftPatientOverride !== undefined
          ? options.draftPatientOverride
          : draftPatient;
      const mode = options?.mode ?? (hasLoadedHistoryRef.current ? 'soft' : 'initial');
      const requestSeq = ++historyRequestSeqRef.current;
      if (mode === 'initial') {
        setInitialHistoryLoading(true);
      } else {
        setHistoryRefreshing(true);
      }
      try {
        const result = await searchOrdersHistory({
          page: effectivePage,
          size: ORDER_PAGE_SIZE,
          search: listQuery.trim() || undefined,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          startDate: historyDateRange[0].format('YYYY-MM-DD'),
          endDate: historyDateRange[1].format('YYYY-MM-DD'),
          shiftId: historyShiftFilter === 'ALL' ? undefined : historyShiftFilter,
        });
        if (requestSeq !== historyRequestSeqRef.current) {
          return;
        }

        const maxPages = Math.max(1, Math.ceil((result.total ?? 0) / ORDER_PAGE_SIZE));
        if ((result.items?.length ?? 0) === 0 && effectivePage > maxPages) {
          setListPage(maxPages);
          return;
        }

        const historyRows: OrderListRow[] = (result.items ?? []).map((order) => ({
          rowId: `order-${order.id}`,
          patient: order.patient,
          createdOrder: order,
        }));

        const rows = effectiveDraft
          ? [
            {
              rowId: `draft-${effectiveDraft.id}`,
              patient: effectiveDraft,
              createdOrder: null,
            },
            ...historyRows,
          ]
          : historyRows;

        setPatientList(rows);
        setListTotal(result.total ?? 0);
        if (effectiveDraft && focusDraftPatientIdRef.current === effectiveDraft.id) {
          setSelectedRowId(`draft-${effectiveDraft.id}`);
          focusDraftPatientIdRef.current = null;
        } else {
          setSelectedRowId((current) => {
            if (options?.focusOrderId) {
              const focusedRow = rows.find(
                (row) => row.createdOrder?.id === options.focusOrderId,
              );
              if (focusedRow) {
                return focusedRow.rowId;
              }
            }
            if (current && rows.some((row) => row.rowId === current)) {
              return current;
            }
            return rows.length > 0 ? rows[0].rowId : null;
          });
        }
      } catch {
        if (requestSeq !== historyRequestSeqRef.current) {
          return;
        }
        message.warning('Failed to load orders');
        if (mode === 'soft') {
          return;
        }
        if (effectiveDraft) {
          setPatientList([
            {
              rowId: `draft-${effectiveDraft.id}`,
              patient: effectiveDraft,
              createdOrder: null,
            },
          ]);
          if (focusDraftPatientIdRef.current === effectiveDraft.id) {
            focusDraftPatientIdRef.current = null;
          }
          setSelectedRowId(`draft-${effectiveDraft.id}`);
        } else {
          setPatientList([]);
          setSelectedRowId(null);
        }
        setListTotal(0);
      } finally {
        if (requestSeq === historyRequestSeqRef.current) {
          hasLoadedHistoryRef.current = true;
          setInitialHistoryLoading(false);
          setHistoryRefreshing(false);
        }
      }
    },
    [draftPatient, historyDateRange, historyShiftFilter, listPage, listQuery, statusFilter],
  );

  useEffect(() => {
    const patientIdFromState =
      (location.state as { patientId?: string } | null)?.patientId ?? null;
    if (!patientIdFromState) {
      return;
    }

    focusDraftPatientIdRef.current = patientIdFromState;
    let cancelled = false;
    setPatientBootstrapLoading(true);
    getPatient(patientIdFromState)
      .then((patient) => {
        if (cancelled) return;
        setDraftPatient(patient);
        setSelectedTests([]);
        setDiscountPercent(0);
        setReferredBy('');
        draftDeliveryMethodsRef.current = [];
        setSelectedDeliveryMethods([]);
        setListPage(1);
      })
      .catch(() => {
        if (!cancelled) {
          message.error('Patient not found');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPatientBootstrapLoading(false);
        }
      });

    window.history.replaceState({}, document.title, location.pathname);
    return () => {
      cancelled = true;
    };
  }, [location.key, location.pathname, location.state]);

  useEffect(() => {
    void loadOrderHistory();
  }, [loadOrderHistory]);

  useEffect(() => {
    async function init() {
      setLoadingTests(true);
      try {
        const [depts, tsts, settings, shifts] = await Promise.all([
          getDepartments(),
          getTests(),
          getLabSettings(),
          getShifts().catch(() => []),
        ]);
        setDepartments(depts);
        setTestOptions(tsts);
        setHistoryShiftOptions(shifts ?? []);
        const activeIds = new Set(tsts.filter((t) => t.isActive).map((t) => t.id));
        const validGroups = (settings.uiTestGroups || []).map(g => ({
          ...g,
          testIds: g.testIds.filter(id => activeIds.has(id))
        })).filter(g => g.testIds.length > 0);
        setUiTestGroups(validGroups);
        setReferringDoctorOptions(
          normalizeReferringDoctorList(settings.referringDoctors),
        );
      } catch {
        message.warning('Failed to load tests or departments');
      } finally {
        setLoadingTests(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (historyShiftFilter === 'ALL') return;
    if (historyShiftOptions.some((shift) => shift.id === historyShiftFilter)) return;
    setHistoryShiftFilter('ALL');
  }, [historyShiftFilter, historyShiftOptions]);

  useEffect(() => {
    getLabSettings()
      .then((settings) => {
        setPrintLabelSequenceBy(settings.labelSequenceBy ?? 'tube_type');
      })
      .catch(() => {
        // keep fallback from auth lab state
      });
  }, []);

  useEffect(() => {
    if (selectedTests.length === 0) {
      setSubtotal(0);
      return;
    }
    let cancelled = false;
    setLoadingPrice(true);
    getOrderPriceEstimate(selectedTests.map((t) => t.testId), currentShiftId ?? undefined)
      .then((res) => {
        if (!cancelled) setSubtotal(res.subtotal);
      })
      .catch(() => {
        if (!cancelled) setSubtotal(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPrice(false);
      });
    return () => { cancelled = true; };
  }, [selectedTests, currentShiftId]);

  // When there are pending patients (or one is selected), fetch next order number for list and right panel.
  useEffect(() => {
    if (initialHistoryLoading) return;
    const hasPending = patientList.some((r) => !r.createdOrder);
    const selectedIsPending = selectedPatient && !isSelectedLocked;
    if (!hasPending && !selectedIsPending) {
      setNextOrderNumber(null);
      return;
    }
    let cancelled = false;
    getNextOrderNumber(currentShiftId)
      .then((num) => {
        if (!cancelled) setNextOrderNumber(num);
      })
      .catch(() => {
        if (!cancelled) setNextOrderNumber(null);
      });
    return () => { cancelled = true; };
  }, [patientList, selectedPatient, isSelectedLocked, currentShiftId, initialHistoryLoading]);

  const filteredTests = useMemo(() => {
    if (!testSearch.trim()) return testOptions;
    const searchVariants = buildKeyboardSearchVariants(testSearch);
    return testOptions.filter(
      (t) => {
        const haystack = `${t.code} ${(t as any).abbreviation ?? ''} ${t.name}`.toLowerCase();
        return searchVariants.some((variant) => haystack.includes(variant));
      },
    );
  }, [testOptions, testSearch]);
  const tubesRequired = useMemo(() => {
    if (selectedTests.length === 0) return [];
    const groups = new Set<string>();
    const typeByGroup = new Map<string, string>();
    selectedTests.forEach((t) => {
      const type = t.tubeType || 'OTHER';
      let groupKey = type;
      if (printLabelSequenceBy === 'department') {
        const fullTest = testOptions.find((opt) => opt.id === t.testId);
        const deptId = fullTest?.departmentId || 'OTHER';
        groupKey = `${deptId}-${type}`;
      }
      groups.add(groupKey);
      typeByGroup.set(groupKey, type);
    });
    const counts = new Map<string, number>();
    groups.forEach((groupKey) => {
      const type = typeByGroup.get(groupKey)!;
      counts.set(type, (counts.get(type) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([type, count]) => ({
      tubeType: type,
      color: getTubeColor(type),
      count,
    }));
  }, [selectedTests, printLabelSequenceBy, testOptions]);

  const handleAddTest = (testId: string) => {
    const test = testOptions.find((t) => t.id === testId);
    if (!test) return;
    if (selectedTests.some((t) => t.testId === testId)) {
      message.warning('Test already added');
      return;
    }
    setSelectedTests([
      ...selectedTests,
      {
        testId: test.id,
        testCode: test.code,
        testName: test.name,
        tubeType: test.tubeType,
      },
    ]);
    setTestSearch('');
  };

  const handleRemoveTest = (testId: string) => {
    setSelectedTests(selectedTests.filter((t) => t.testId !== testId));
  };

  const normalizeSortToken = (value: string | null | undefined, fallback = '~'): string => {
    const normalized = value?.trim().toLowerCase();
    return normalized && normalized.length > 0 ? normalized : fallback;
  };

  const sortRootOrderTestsForReadonly = (tests: SelectedTest[]): SelectedTest[] =>
    [...tests].sort((a, b) => {
      const categoryCompare = normalizeSortToken(a.sortCategoryKey).localeCompare(
        normalizeSortToken(b.sortCategoryKey),
        undefined,
        { sensitivity: 'base' },
      );
      if (categoryCompare !== 0) return categoryCompare;

      const labelCompare = normalizeSortToken(a.displayLabel).localeCompare(
        normalizeSortToken(b.displayLabel),
        undefined,
        { sensitivity: 'base' },
      );
      if (labelCompare !== 0) return labelCompare;

      return normalizeSortToken(a.testCode).localeCompare(normalizeSortToken(b.testCode), undefined, {
        sensitivity: 'base',
      });
    });

  const getRootOrderTests = (order: OrderDto): SelectedTest[] => {
    const all = (order.samples ?? []).flatMap((sample) => sample.orderTests ?? []);
    const root = all.filter((orderTest) => !orderTest.parentOrderTestId);
    const childrenByParent = new Map<string, OrderTestDto[]>();
    all.forEach((orderTest) => {
      if (!orderTest.parentOrderTestId) return;
      const current = childrenByParent.get(orderTest.parentOrderTestId) ?? [];
      current.push(orderTest);
      childrenByParent.set(orderTest.parentOrderTestId, current);
    });

    return root.map((orderTest) => {
      const testMeta = orderTest.test as (TestDto & { abbreviation?: string | null }) | undefined;
      const displayLabel =
        testMeta?.abbreviation?.trim() ||
        testMeta?.code?.trim() ||
        testMeta?.name?.trim() ||
        '-';
      const sortCategoryKey = normalizeSortToken(testMeta?.category, '~');
      const childTests = childrenByParent.get(orderTest.id) ?? [];
      const subtreeHasVerified = [orderTest, ...childTests].some(
        (candidate) => candidate.status === 'VERIFIED',
      );
      let removable = false;
      let blocked = false;
      let blockedReason: string | null = null;
      let adminReasonRequired = false;

      if (subtreeHasVerified) {
        if (canAdminOverrideLockedTestRemoval) {
          removable = true;
          adminReasonRequired = true;
        } else {
          blocked = true;
          blockedReason =
            'Verified tests can be removed only by a lab admin with a reason.';
        }
      } else if (orderTest.status === 'IN_PROGRESS' && childTests.length > 0) {
        if (canAdminOverrideLockedTestRemoval) {
          removable = true;
          adminReasonRequired = true;
        } else {
          blocked = true;
          blockedReason =
            'In-progress panels can be removed only by a lab admin with a reason.';
        }
      } else if (orderTest.status === 'REJECTED') {
        removable = true;
      } else if (orderTest.status === 'COMPLETED') {
        removable = true;
      } else if (
        orderTest.status === 'PENDING' &&
        childTests.every((child) => child.status === 'PENDING')
      ) {
        removable = true;
      } else {
        blocked = true;
        blockedReason =
          'Only pending, completed, and rejected tests can be removed. In-progress tests stay locked.';
      }

      return {
        testId: orderTest.testId,
        testCode: orderTest.test?.code ?? '-',
        testName: orderTest.test?.name ?? 'Unknown',
        tubeType: orderTest.test?.tubeType ?? 'OTHER',
        displayLabel,
        sortCategoryKey,
        price: orderTest.price != null ? Number(orderTest.price) : null,
        removable,
        blocked,
        blockedReason,
        adminReasonRequired,
        currentStatus: orderTest.status,
        isPanelRoot: childTests.length > 0,
      };
    });
  };

  const handleAddGroupTests = (groupTestIds: string[]) => {
    const testsToAdd = filteredTests.filter(t => groupTestIds.includes(t.id));

    // Add tests that aren't already selected
    const newSelections = testsToAdd.filter(
      t => !selectedTests.some(st => st.testId === t.id)
    ).map(t => ({
      testId: t.id,
      testCode: t.code,
      testName: t.name,
      tubeType: t.tubeType,
    }));

    if (newSelections.length > 0) {
      setSelectedTests(prev => [...prev, ...newSelections]);
      message.success(`Added ${newSelections.length} test(s) from group`);
    } else {
      message.info('All tests from this group are already selected');
    }
  };

  const toggleDeliveryMethod = (method: DeliveryMethod) => {
    setSelectedDeliveryMethods((previous) => {
      const nextSet = new Set(previous);
      if (nextSet.has(method)) {
        nextSet.delete(method);
      } else {
        nextSet.add(method);
      }
      const next = DELIVERY_METHODS.filter((item) => nextSet.has(item));
      if (!isSelectedLocked) {
        draftDeliveryMethodsRef.current = next;
      }
      return next;
    });
  };

  const applyUpdatedOrderToList = (updatedOrder: OrderDto) => {
    const historyItem = toOrderHistoryItem(updatedOrder);
    setOrderDetailsCache((prev) => ({ ...prev, [updatedOrder.id]: updatedOrder }));
    setOrderDetailsErrors((prev) => {
      if (!prev[updatedOrder.id]) return prev;
      const next = { ...prev };
      delete next[updatedOrder.id];
      return next;
    });
    setPatientList((prev) =>
      prev.map((row) =>
        row.createdOrder?.id === updatedOrder.id ? { ...row, patient: updatedOrder.patient, createdOrder: historyItem } : row
      )
    );
  };

  const fetchOrderDetails = useCallback(
    async (orderId: string, mode: 'auto' | 'retry' = 'auto') => {
      if (mode === 'auto' && orderDetailsCache[orderId]) {
        return;
      }
      const nextVersion = (orderDetailsRequestVersionRef.current[orderId] ?? 0) + 1;
      orderDetailsRequestVersionRef.current[orderId] = nextVersion;
      setOrderDetailsLoadingId(orderId);
      if (mode === 'retry') {
        setOrderDetailsErrors((prev) => {
          if (!prev[orderId]) return prev;
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
      try {
        const fullOrder = await getOrder(orderId);
        if (orderDetailsRequestVersionRef.current[orderId] !== nextVersion) {
          return;
        }
        setOrderDetailsCache((prev) => ({ ...prev, [orderId]: fullOrder }));
        setOrderDetailsErrors((prev) => {
          if (!prev[orderId]) return prev;
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      } catch {
        if (orderDetailsRequestVersionRef.current[orderId] !== nextVersion) {
          return;
        }
        setOrderDetailsErrors((prev) => ({
          ...prev,
          [orderId]: 'Failed to load order details. Please retry.',
        }));
      } finally {
        if (orderDetailsRequestVersionRef.current[orderId] === nextVersion) {
          setOrderDetailsLoadingId((current) => (current === orderId ? null : current));
        }
      }
    },
    [orderDetailsCache],
  );

  useEffect(() => {
    const orderId = selectedCreatedOrderSummary?.id;
    if (!orderId) return;
    if (orderDetailsCache[orderId]) return;
    if (selectedOrderDetailsLoading) return;
    if (orderDetailsErrors[orderId]) return;
    void fetchOrderDetails(orderId, 'auto');
  }, [
    fetchOrderDetails,
    orderDetailsCache,
    orderDetailsErrors,
    selectedCreatedOrderSummary,
    selectedOrderDetailsLoading,
  ]);

  useEffect(() => {
    if (!isSelectedLocked) return;
    const sourceDiscount =
      selectedCreatedOrder?.discountPercent ??
      selectedCreatedOrderSummary?.discountPercent;
    if (sourceDiscount == null) return;
    const normalizedDiscount = Math.min(
      100,
      Math.max(0, Number(sourceDiscount)),
    );
    setDiscountPercent((current) =>
      Math.abs(current - normalizedDiscount) < 0.001 ? current : normalizedDiscount,
    );
  }, [isSelectedLocked, selectedCreatedOrder, selectedCreatedOrderSummary]);

  useEffect(() => {
    if (isSelectedLocked) {
      const sourceMethods =
        selectedCreatedOrder?.deliveryMethods ?? selectedCreatedOrderSummary?.deliveryMethods ?? [];
      const normalized = normalizeDeliveryMethods(sourceMethods);
      setSelectedDeliveryMethods((current) => {
        if (current.length === normalized.length && current.every((method, idx) => method === normalized[idx])) {
          return current;
        }
        return normalized;
      });
      return;
    }
    setSelectedDeliveryMethods(draftDeliveryMethodsRef.current);
  }, [isSelectedLocked, selectedCreatedOrder, selectedCreatedOrderSummary]);

  useEffect(() => () => {
    if (discountSaveTimerRef.current !== null) {
      window.clearTimeout(discountSaveTimerRef.current);
      discountSaveTimerRef.current = null;
    }
  }, []);

  const openEditTestsModal = () => {
    if (!selectedCreatedOrder) return;
    const currentRootTests = getRootOrderTests(selectedCreatedOrder);
    setEditingTests(currentRootTests);
    setEditTestsRemovalReason('');
    setEditTestsRemovalReasonModalOpen(false);
    setEditTestsModalOpen(true);
  };

  const handleAddEditingTest = (testId: string) => {
    const test = testOptions.find((item) => item.id === testId);
    if (!test) return;
    if (editingTests.some((item) => item.testId === testId)) {
      message.warning('Test already in order');
      return;
    }
    setEditingTests((prev) => [
      ...prev,
      {
        testId: test.id,
        testCode: test.code,
        testName: test.name,
        tubeType: test.tubeType,
        removable: true,
        blocked: false,
        blockedReason: null,
        adminReasonRequired: false,
        currentStatus: 'PENDING',
        isPanelRoot: false,
      },
    ]);
  };

  const handleRemoveEditingTest = (testId: string) => {
    const target = editingTests.find((item) => item.testId === testId);
    if (target && !target.removable) {
      message.warning(target.blockedReason || 'This test cannot be removed.');
      return;
    }
    setEditingTests((prev) => prev.filter((item) => item.testId !== testId));
  };

  const editTestsTableColumns = [
    {
      title: 'Test Name',
      key: 'test',
      className: 'orders-edit-tests-col-test',
      render: (_: unknown, test: SelectedTest) => {
        return (
          <div className="orders-edit-tests-table-name-block">
            <Text className="orders-edit-tests-table-name">{test.testName}</Text>
            <div className="orders-edit-tests-table-subline">
              <span className="orders-edit-tests-table-code">{test.testCode}</span>
              {test.isPanelRoot ? <span className="orders-edit-tests-mini-chip">Panel</span> : null}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      className: 'orders-edit-tests-col-status',
      render: (_: unknown, test: SelectedTest) => {
        const status = getEditTestStatusDisplay(test.currentStatus);
        return (
          <div className="orders-edit-tests-status-cell">
            <span
              className={`orders-edit-tests-status-badge orders-edit-tests-status-${status.tone}`}
            >
              {status.label}
            </span>
            {test.adminReasonRequired ? (
              <span className="orders-edit-tests-status-note">Need reason</span>
            ) : null}
            {test.blocked ? <span className="orders-edit-tests-status-note">Locked</span> : null}
          </div>
        );
      },
    },
    {
      title: 'Tube Type',
      key: 'tubeType',
      width: 128,
      className: 'orders-edit-tests-col-sample',
      render: (_: unknown, test: SelectedTest) => (
        <span className="orders-edit-tests-table-meta">{formatTokenLabel(test.tubeType)}</span>
      ),
    },
    {
      title: 'Price',
      key: 'price',
      width: 124,
      className: 'orders-edit-tests-col-price',
      render: (_: unknown, test: SelectedTest) => (
        <span className="orders-edit-tests-table-price">
          {test.price != null ? `${test.price.toLocaleString()} IQD` : 'Current pricing'}
        </span>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 150,
      className: 'orders-edit-tests-col-action',
      render: (_: unknown, test: SelectedTest) => {
        const actionNote = getEditTestActionNote(test);
        return (
          <div className="orders-edit-tests-action-cell">
            <Button
              className="orders-edit-tests-action-btn"
              icon={<DeleteOutlined />}
              danger
              disabled={!test.removable}
              onClick={() => handleRemoveEditingTest(test.testId)}
            >
              Delete
            </Button>
            {actionNote ? <Text className="orders-edit-tests-action-note">{actionNote}</Text> : null}
          </div>
        );
      },
    },
  ];

  const submitEditedTests = async (payload?: {
    forceRemoveVerified?: boolean;
    removalReason?: string;
  }) => {
    if (!selectedCreatedOrder?.id) return;
    if (editingTests.length === 0) {
      message.error('At least one test is required');
      return;
    }
    if (selectedOrderIsToday === false) {
      message.error(ONLY_TODAYS_ORDERS_EDITABLE_MESSAGE);
      return;
    }

    setSavingEditedTests(true);
    try {
      const updated = await updateOrderTests(selectedCreatedOrder.id, {
        testIds: editingTests.map((test) => test.testId),
        forceRemoveVerified: payload?.forceRemoveVerified,
        removalReason: payload?.removalReason,
      });
      applyUpdatedOrderToList(updated);
      setEditTestsModalOpen(false);
      setEditTestsRemovalReason('');
      setEditTestsRemovalReasonModalOpen(false);
      message.success('Order tests updated. Order number and sequence stay unchanged.');
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      message.error(msg || 'Failed to update order tests');
    } finally {
      setSavingEditedTests(false);
    }
  };

  const handleSaveEditedTests = async () => {
    if (!selectedCreatedOrder?.id) return;
    if (editingTests.length === 0) {
      message.error('At least one test is required');
      return;
    }

    const originalRootTests = getRootOrderTests(selectedCreatedOrder);
    const selectedTestIds = new Set(editingTests.map((test) => test.testId));
    const removedTests = originalRootTests.filter((test) => !selectedTestIds.has(test.testId));
    const blockedRemovedTest = removedTests.find((test) => !test.removable);
    if (blockedRemovedTest) {
      message.error(blockedRemovedTest.blockedReason || 'This test cannot be removed.');
      return;
    }

    const requiresAdminOverride = removedTests.some((test) => test.adminReasonRequired);
    if (requiresAdminOverride) {
      if (!canAdminOverrideLockedTestRemoval) {
        message.error(
          'Verified tests and in-progress panels can be removed only by a lab admin with a reason.',
        );
        return;
      }
      if (!editTestsRemovalReason.trim()) {
        setEditTestsRemovalReasonModalOpen(true);
        return;
      }
    }

    await submitEditedTests({
      forceRemoveVerified: requiresAdminOverride || undefined,
      removalReason: requiresAdminOverride ? editTestsRemovalReason.trim() : undefined,
    });
  };

  const handleSubmit = async () => {
    if (!selectedPatient) {
      message.error('Please select a patient');
      return;
    }
    if (selectedRow?.createdOrder) {
      message.error('This order is locked');
      return;
    }
    if (selectedTests.length === 0) {
      message.error('Please add at least one test');
      return;
    }

    const slowMessageKey = 'orders-create-slow-feedback';
    const slowFeedbackTimer = window.setTimeout(() => {
      message.loading({
        key: slowMessageKey,
        content: 'Still creating order...',
        duration: 0,
      });
    }, CREATE_ORDER_SLOW_FEEDBACK_MS);

    setSubmitting(true);
    try {
      const testsByTube = selectedTests.reduce(
        (acc, test) => {
          const tube = test.tubeType || 'OTHER';
          if (!acc[tube]) acc[tube] = [];
          acc[tube].push(test);
          return acc;
        },
        {} as Record<string, SelectedTest[]>
      );

      const orderData: CreateOrderDto = {
        patientId: selectedPatient.id,
        patientType: 'WALK_IN',
        discountPercent: discountPercent || undefined,
        notes: referredBy.trim() || undefined,
        deliveryMethods: selectedDeliveryMethods.length > 0 ? selectedDeliveryMethods : undefined,
        ...(currentShiftId ? { shiftId: currentShiftId } : {}),
        samples: Object.entries(testsByTube).map(([tubeType, tests]) => ({
          tubeType: tubeType as CreateOrderDto['samples'][0]['tubeType'],
          tests: tests.map((t) => ({ testId: t.testId })),
        })),
      };

      const createdOrder = await createOrder(orderData, {
        view: 'summary',
        timeoutMs: CREATE_ORDER_TIMEOUT_MS,
      });
      const historyItem = toOrderHistoryItemFromSummary(createdOrder);
      const lockedRowId = `order-${createdOrder.id}`;
      const selectedDraftRowId = selectedRowId ?? `draft-${selectedPatient.id}`;

      setOrderDetailsErrors((prev) => {
        if (!prev[createdOrder.id]) return prev;
        const next = { ...prev };
        delete next[createdOrder.id];
        return next;
      });
      setPatientList((prev) => {
        const nextRows = prev
          .filter((row) => row.rowId !== lockedRowId)
          .map((row) =>
            row.rowId === selectedDraftRowId
              ? {
                rowId: lockedRowId,
                patient: createdOrder.patient ?? selectedPatient,
                createdOrder: historyItem,
              }
              : row,
          );
        if (!nextRows.some((row) => row.rowId === lockedRowId)) {
          nextRows.unshift({
            rowId: lockedRowId,
            patient: createdOrder.patient ?? selectedPatient,
            createdOrder: historyItem,
          });
        }
        return nextRows;
      });
      setSelectedRowId(lockedRowId);
      setListTotal((prev) => prev + 1);
      void fetchOrderDetails(createdOrder.id, 'auto');

      setDraftPatient(null);
      setSelectedTests([]);
      setReferredBy('');
      draftDeliveryMethodsRef.current = [];
      setSelectedDeliveryMethods([]);
      setListPage(1);
      void loadOrderHistory({
        focusOrderId: createdOrder.id,
        pageOverride: 1,
        draftPatientOverride: null,
        mode: 'soft',
      });
      message.success('Order created successfully');
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.code === 'ECONNABORTED') {
        message.error('Order creation timed out after 15 seconds. Check history before retrying.');
        return;
      }
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
            ?.message
          : 'Order creation failed';
      message.error(msg || 'Order creation failed');
    } finally {
      window.clearTimeout(slowFeedbackTimer);
      message.destroy(slowMessageKey);
      setSubmitting(false);
    }
  };

  const removePatientFromList = (rowId: string) => {
    const row = patientList.find((r) => r.rowId === rowId);
    if (!row) return;
    if (row.createdOrder) {
      message.warning('History orders cannot be removed from this screen');
      return;
    }
    setDraftPatient(null);
    setPatientList((prev) => {
      const remaining = prev.filter((item) => item.rowId !== rowId);
      setSelectedRowId((current) => (current === rowId ? (remaining[0]?.rowId ?? null) : current));
      return remaining;
    });
    setSelectedTests([]);
    setDiscountPercent(0);
    setReferredBy('');
    draftDeliveryMethodsRef.current = [];
    setSelectedDeliveryMethods([]);
  };

  const addNewOrderForPatient = (patient: PatientDto) => {
    setDraftPatient(patient);
    const draftRowId = `draft-${patient.id}`;
    setPatientList((prev) => {
      const withoutDraft = prev.filter((row) => !row.rowId.startsWith('draft-'));
      return [{ rowId: draftRowId, patient, createdOrder: null }, ...withoutDraft];
    });
    setSelectedRowId(draftRowId);
    setSelectedTests([]);
    setDiscountPercent(0);
    setReferredBy('');
    draftDeliveryMethodsRef.current = [];
    setSelectedDeliveryMethods([]);
    setListPage(1);
  };

  const openPrint = async (order: OrderDto, type: 'receipt' | 'labels') => {
    if (lockedOrderActionsBusy) return;
    setPrintingAction(type);
    try {
      try {
        const settings = await getLabSettings();
        const nextLabelSequenceBy = settings.labelSequenceBy ?? 'tube_type';
        setPrintLabelSequenceBy(nextLabelSequenceBy);
        const printing = settings.printing;
        const printerName =
          type === 'receipt'
            ? printing?.receiptPrinterName?.trim()
            : printing?.labelsPrinterName?.trim();
        if (printing?.mode === 'direct_qz' && printerName) {
          try {
            if (type === 'receipt') {
              await directPrintReceipt({
                order,
                labName: lab?.name,
                printerName,
              });
            } else {
              await directPrintLabels({
                order,
                printerName,
                labelSequenceBy: nextLabelSequenceBy,
                departments,
              });
            }
            message.success(`${type === 'receipt' ? 'Receipt' : 'Labels'} sent to ${printerName}`);
            return;
          } catch (error) {
            message.warning(`${getDirectPrintErrorMessage(error)} Falling back to print preview.`);
          }
        }
      } catch {
        // if settings fail, continue with fallback preview
      }

      setPrintType(type);
      setPrintOrder(order);
      setPrintModalOpen(true);
    } finally {
      setPrintingAction((current) => (current === type ? null : current));
    }
  };

  const openNewPatientInPatientsTab = () => {
    navigate('/patients', { state: { openNewPatient: true } });
  };

  const handleLockedEditTests = () => {
    if (lockedOrderActionsBusy || !lockedOrderContextActive || !selectedCreatedOrderSummary) return;
    if (!selectedCreatedOrder) {
      void fetchOrderDetails(selectedCreatedOrderSummary.id, 'auto');
      message.info('Order details are still loading. Please try again in a moment.');
      return;
    }
    if (selectedOrderIsToday === false) {
      message.info(ONLY_TODAYS_ORDERS_EDITABLE_MESSAGE);
      return;
    }
    openEditTestsModal();
  };

  const handleLockedPrint = (type: 'receipt' | 'labels') => {
    if (lockedOrderActionsBusy || !lockedOrderContextActive || !selectedCreatedOrderSummary) return;
    if (!selectedCreatedOrder) {
      void fetchOrderDetails(selectedCreatedOrderSummary.id, 'auto');
      message.info('Order details are still loading. Please try again in a moment.');
      return;
    }
    void openPrint(selectedCreatedOrder, type);
  };

  const handleLockedMarkPaid = async () => {
    if (lockedOrderBaseActionsDisabled || !selectedCreatedOrderSummary) return;
    setUpdatingPayment(true);
    try {
      const updated = await updateOrderPayment(selectedCreatedOrderSummary.id, {
        paymentStatus: 'paid',
      });
      message.success('Marked as paid');
      applyUpdatedOrderToList(updated);
    } catch {
      message.error('Failed to update payment');
    } finally {
      setUpdatingPayment(false);
    }
  };

  const handleLockedMarkUnpaid = async () => {
    if (lockedOrderBaseActionsDisabled || !selectedCreatedOrderSummary) return;
    setUpdatingPayment(true);
    try {
      const updated = await updateOrderPayment(selectedCreatedOrderSummary.id, {
        paymentStatus: 'unpaid',
        paidAmount: 0,
      });
      message.success('Marked as unpaid');
      applyUpdatedOrderToList(updated);
    } catch {
      message.error('Failed to update payment');
    } finally {
      setUpdatingPayment(false);
    }
  };

  const handleLockedOpenPartialPayment = () => {
    if (lockedOrderBaseActionsDisabled || !selectedCreatedOrderSummary) return;
    setPartialPaymentAmount(
      selectedCreatedOrderSummary?.paidAmount != null ? Number(selectedCreatedOrderSummary.paidAmount) : 0,
    );
    setPartialPaymentModalOpen(true);
  };

  const handleLockedStartNewOrder = () => {
    if (lockedOrderBaseActionsDisabled || !selectedCreatedOrderSummary || !selectedPatient) return;
    addNewOrderForPatient(selectedCreatedOrderSummary.patient ?? selectedPatient);
  };

  const handleSaveDeliveryPreferences = async () => {
    if (!selectedCreatedOrderSummary || !isSelectedLocked) return;
    setSavingDeliveryMethods(true);
    try {
      const updated = await updateOrderDeliveryMethods(selectedCreatedOrderSummary.id, {
        deliveryMethods: selectedDeliveryMethods,
      });
      applyUpdatedOrderToList(updated);
      setSelectedDeliveryMethods(normalizeDeliveryMethods(updated.deliveryMethods));
      message.success('Delivery preferences saved');
    } catch {
      message.error('Failed to save delivery preferences');
    } finally {
      setSavingDeliveryMethods(false);
    }
  };

  const handleSummaryDiscountChange = (value: number | null) => {
    const normalized = Math.min(100, Math.max(0, Number(value ?? 0)));
    setDiscountPercent(normalized);
    if (!isSelectedLocked || !selectedCreatedOrderSummary) return;

    const serverDiscount = Math.min(
      100,
      Math.max(0, Number(selectedCreatedOrder?.discountPercent ?? selectedCreatedOrderSummary.discountPercent ?? 0)),
    );
    if (Math.abs(serverDiscount - normalized) < 0.001) return;

    if (discountSaveTimerRef.current !== null) {
      window.clearTimeout(discountSaveTimerRef.current);
    }
    discountSaveTimerRef.current = window.setTimeout(() => {
      discountSaveTimerRef.current = null;
      void handleSummaryDiscountCommit(normalized);
    }, 500);
  };

  const handleSummaryDiscountCommit = async (nextDiscount?: number) => {
    if (!isSelectedLocked || !selectedCreatedOrderSummary) return;
    const normalized = Math.round(Math.min(100, Math.max(0, nextDiscount ?? discountPercent)) * 100) / 100;
    const serverDiscount = Math.min(
      100,
      Math.max(0, Number(selectedCreatedOrder?.discountPercent ?? selectedCreatedOrderSummary.discountPercent ?? 0)),
    );
    if (Math.abs(serverDiscount - normalized) < 0.001) return;

    if (discountSaveTimerRef.current !== null) {
      window.clearTimeout(discountSaveTimerRef.current);
      discountSaveTimerRef.current = null;
    }
    const requestVersion = ++discountSaveRequestVersionRef.current;
    setUpdatingDiscount(true);
    try {
      const updated = await updateOrderDiscount(selectedCreatedOrderSummary.id, {
        discountPercent: normalized,
      });
      if (requestVersion !== discountSaveRequestVersionRef.current) {
        return;
      }
      applyUpdatedOrderToList(updated);
      setOrderDetailsCache((prev) => ({ ...prev, [updated.id]: updated }));
    } catch {
      if (requestVersion !== discountSaveRequestVersionRef.current) {
        return;
      }
      setDiscountPercent(serverDiscount);
      message.error('Failed to update discount');
    } finally {
      if (requestVersion === discountSaveRequestVersionRef.current) {
        setUpdatingDiscount(false);
      }
    }
  };

  const totalTests = selectedTests.length;
  const totalPages = Math.max(1, Math.ceil(listTotal / ORDER_PAGE_SIZE));
  const lockedOrderTestsCount = Number(
    selectedCreatedOrderSummary?.testsCount ??
    (selectedCreatedOrder ? getRootOrderTests(selectedCreatedOrder).length : 0),
  );
  const lockedOrderSubtotal = Number(
    selectedCreatedOrder?.totalAmount ??
    selectedCreatedOrderSummary?.totalAmount ??
    selectedCreatedOrderSummary?.finalAmount ??
    0,
  );
  const summaryTestsCount = isSelectedLocked ? lockedOrderTestsCount : totalTests;
  const summarySubtotal = isSelectedLocked
    ? lockedOrderSubtotal
    : (subtotal ?? 0);
  const draftSubtotalUnavailable = !isSelectedLocked && subtotal == null && !loadingPrice;
  const summaryTotalAmount = Math.round(summarySubtotal * (1 - discountPercent / 100) * 100) / 100;
  const createOrderDisabledReason = isSelectedLocked
    ? 'Create order is only available while preparing a new order.'
    : selectedTests.length === 0
      ? 'Select at least one test to create the order.'
      : undefined;

  const handleHistoryDateRangeChange = (
    dates: null | [dayjs.Dayjs | null, dayjs.Dayjs | null],
  ) => {
    if (!dates || !dates[0] || !dates[1]) return;
    const start = dates[0].startOf('day');
    const end = dates[1].startOf('day');
    setHistoryDateRange([start, end]);
    setListPage(1);
  };

  const handleHistoryShiftFilterChange = (value: string) => {
    setHistoryShiftFilter(value);
    setListPage(1);
  };

  const handleApplyHistorySearch = () => {
    const nextQuery = listQueryInput.trim();
    if (listPage !== 1) {
      setListPage(1);
    }
    if (listQuery !== nextQuery) {
      setListQuery(nextQuery);
      return;
    }
    void loadOrderHistory({ pageOverride: 1, mode: 'soft' });
  };

  const handleRefreshHistory = () => {
    void loadOrderHistory({ mode: 'soft' });
  };

  const summarySubtotalLabel = loadingPrice && !isSelectedLocked
    ? '...'
    : draftSubtotalUnavailable
      ? 'DB price unavailable'
      : `${summarySubtotal.toFixed(0)} IQD`;
  const summaryTotalLabel = loadingPrice && !isSelectedLocked
    ? '...'
    : draftSubtotalUnavailable
      ? 'DB price unavailable'
      : `${summaryTotalAmount.toFixed(0)} IQD`;

  const currentPaymentStatus = selectedCreatedOrderSummary?.paymentStatus ?? 'unpaid';
  const lockedDeliveryMethods = normalizeDeliveryMethods(
    selectedCreatedOrder?.deliveryMethods ?? selectedCreatedOrderSummary?.deliveryMethods ?? [],
  );
  const hasLockedDeliveryMethodChanges =
    lockedDeliveryMethods.length !== selectedDeliveryMethods.length ||
    lockedDeliveryMethods.some((method, idx) => method !== selectedDeliveryMethods[idx]);
  const orderDockBar = selectedPatient ? (
    <div className={`order-dock-bar${isDark ? ' order-dock-bar-dark' : ''}`}>
      <div className="order-dock-summary-grid">
        <div className="order-summary-item">
          <Text type="secondary">Tests</Text>
          <Text strong>{summaryTestsCount}</Text>
        </div>
        <div className="order-summary-item">
          <Text type="secondary">Subtotal</Text>
          <Text strong>{summarySubtotalLabel}</Text>
        </div>
        <div className="order-summary-item order-summary-discount">
          <Text type="secondary">{updatingDiscount ? 'Discount (saving...)' : 'Discount'}</Text>
          <Space.Compact>
            <InputNumber
              min={0}
              max={100}
              value={discountPercent}
              onChange={handleSummaryDiscountChange}
              onBlur={() => void handleSummaryDiscountCommit()}
              disabled={submitting || updatingDiscount}
              style={{ width: 70 }}
            />
            <span className="order-summary-suffix">%</span>
          </Space.Compact>
        </div>
        <div className="order-summary-item order-summary-total">
          <Text type="secondary">Total</Text>
          <Text strong>{summaryTotalLabel}</Text>
        </div>
      </div>

      <div className="order-dock-action-row">
        {isSelectedLocked ? (
          <>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleLockedStartNewOrder}
              size="large"
              disabled={lockedOrderBaseActionsDisabled}
              title={lockedOrderBaseActionDisabledTitle}
              className="locked-order-new-btn"
            >
              New order for this patient
            </Button>
            <Tooltip title={lockedOrderEditTestsDisabledReason}>
              <span>
                <Button
                  icon={<PlusOutlined />}
                  onClick={handleLockedEditTests}
                  size="large"
                  loading={savingEditedTests}
                  disabled={lockedOrderEditTestsDisabled}
                >
                  Edit tests
                </Button>
              </span>
            </Tooltip>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={() => handleLockedPrint('receipt')}
              size="large"
              loading={printingAction === 'receipt'}
              disabled={lockedOrderDetailActionsDisabled}
              title={lockedOrderDetailActionDisabledTitle}
            >
              Receipt
            </Button>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => handleLockedPrint('labels')}
              size="large"
              loading={printingAction === 'labels'}
              disabled={lockedOrderDetailActionsDisabled}
              title={lockedOrderDetailActionDisabledTitle}
            >
              Labels
            </Button>
            {currentPaymentStatus === 'unpaid' && (
              <>
                <Button
                  type="primary"
                  loading={updatingPayment}
                  onClick={() => void handleLockedMarkPaid()}
                  size="large"
                  disabled={lockedOrderBaseActionsDisabled}
                  title={lockedOrderBaseActionDisabledTitle}
                >
                  Mark as paid
                </Button>
                <Button
                  loading={updatingPayment}
                  onClick={handleLockedOpenPartialPayment}
                  size="large"
                  disabled={lockedOrderBaseActionsDisabled}
                  title={lockedOrderBaseActionDisabledTitle}
                >
                  Partially paid
                </Button>
              </>
            )}
            {currentPaymentStatus === 'paid' && (
              <Button
                type="dashed"
                size="large"
                loading={updatingPayment}
                style={{
                  borderColor: '#52c41a',
                  color: '#52c41a',
                  backgroundColor: 'rgba(82, 196, 26, 0.1)',
                }}
                onClick={() => void handleLockedMarkUnpaid()}
                disabled={lockedOrderBaseActionsDisabled}
                title={lockedOrderBaseActionDisabledTitle}
              >
                Paid (Click to Unpay)
              </Button>
            )}
            {currentPaymentStatus === 'partial' && (
              <>
                <Button
                  type="primary"
                  loading={updatingPayment}
                  onClick={() => void handleLockedMarkPaid()}
                  size="large"
                  disabled={lockedOrderBaseActionsDisabled}
                  title={lockedOrderBaseActionDisabledTitle}
                >
                  Mark as paid
                </Button>
                <Button
                  type="dashed"
                  size="large"
                  loading={updatingPayment}
                  style={{
                    borderColor: '#faad14',
                    color: '#faad14',
                    backgroundColor: 'rgba(250, 173, 20, 0.1)',
                  }}
                  onClick={handleLockedOpenPartialPayment}
                  disabled={lockedOrderBaseActionsDisabled}
                  title={lockedOrderBaseActionDisabledTitle}
                >
                  Partially paid
                  {selectedCreatedOrderSummary?.paidAmount != null &&
                    ` (${selectedCreatedOrderSummary.paidAmount} / ${selectedCreatedOrderSummary.finalAmount})`}
                </Button>
              </>
            )}
          </>
        ) : (
          <Button
            type="primary"
            size="large"
            icon={<ShoppingCartOutlined />}
            onClick={handleSubmit}
            loading={submitting}
            disabled={selectedTests.length === 0}
            title={createOrderDisabledReason}
            className="order-dock-create-btn"
          >
            Create order
          </Button>
        )}
      </div>
    </div>
  ) : null;
  const orderBottomControls = selectedPatient ? (
    <div className="order-bottom-stack">
      {orderDockBar}
    </div>
  ) : null;

  return (
    <div className="orders-page-shell">
      <Card size="small" className="orders-page-header-card">
        <div className="orders-page-header-row">
          <div>
            <Title level={4} style={{ marginTop: 0, marginBottom: 2 }}>
              Orders {listTotal > 0 && (
                <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 14 }}>({listTotal} total)</Text>
              )}
            </Title>
            <Text type="secondary">Create orders with fast summary response and background detail hydration.</Text>
          </div>
          <div className="orders-page-header-meta">
            {selectedPatient ? (
              <div className="orders-header-context">
                <div className="orders-header-context-row orders-header-context-top">
                  <div className="orders-header-top-main">
                    <Tag color={isSelectedLocked ? 'success' : 'processing'} style={{ margin: 0 }}>
                      {isSelectedLocked ? 'Locked order' : 'Draft order'}
                    </Tag>
                    <Text strong className="orders-header-patient-name" title={getPatientName(selectedPatient)}>
                      {getPatientName(selectedPatient)}
                    </Text>
                  </div>
                  <div className="orders-header-top-side">
                    {selectedCreatedOrderSummary ? (
                      <Tag color="blue" style={{ margin: 0 }}>
                        Order #{selectedCreatedOrderSummary.orderNumber || selectedCreatedOrderSummary.id.substring(0, 8)}
                      </Tag>
                    ) : nextOrderNumber ? (
                      <Tag color="gold" style={{ margin: 0 }}>Next #{nextOrderNumber}</Tag>
                    ) : null}
                  </div>
                </div>
                <div className="orders-header-context-row orders-header-context-bottom">
                  {isSelectedLocked && selectedCreatedOrderSummary ? (
                    <>
                      <div className="orders-header-bottom-main">
                        <span className="orders-header-context-item">
                          <Text type="secondary">Shift:</Text>
                          <Text strong>
                            {selectedCreatedOrderSummary.shift?.name ||
                              selectedCreatedOrderSummary.shift?.code ||
                              currentShiftLabel ||
                              '-'}
                          </Text>
                        </span>
                        <span className="orders-header-context-item">
                          <Text type="secondary">Time:</Text>
                          <Text strong>{dayjs(selectedCreatedOrderSummary.registeredAt).format('YYYY-MM-DD HH:mm')}</Text>
                        </span>
                        <span className="orders-header-context-item orders-header-referred-item">
                          <Text type="secondary">Referred by:</Text>
                          <Text
                            strong
                            className="orders-header-referred-value"
                            title={selectedCreatedOrder?.notes?.trim() || '-'}
                          >
                            {selectedCreatedOrder?.notes?.trim() || '-'}
                          </Text>
                        </span>
                      </div>
                      <div className="orders-header-bottom-side">
                        <Tag
                          color="success"
                          icon={<LockOutlined />}
                          className="orders-header-lock-tag"
                          style={{ margin: 0 }}
                        >
                          Locked for delete - test list can still be edited
                        </Tag>
                      </div>
                    </>
                  ) : (
                    <div className="orders-header-bottom-main">
                      <span className="orders-header-context-item">
                        <Text type="secondary">Shift:</Text>
                        <Text strong>{currentShiftLabel || '-'}</Text>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="orders-header-context">
                <div className="orders-header-context-row orders-header-context-top">
                  <Tag color="default" style={{ margin: 0 }}>
                    No selection
                  </Tag>
                </div>
                <div className="orders-header-context-row orders-header-context-bottom">
                  <Text type="secondary">Select a row to begin</Text>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]} className="orders-main-grid">
        <Col xs={24} md={12} lg={10}>
          <Card
            className="orders-history-card"
            style={{ minWidth: 260, height: 'calc(100vh - 252px)', display: 'flex', flexDirection: 'column' }}
            title="Order History"
            extra={
              <Space>
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={openNewPatientInPatientsTab}
                  disabled={patientBootstrapLoading}
                >
                  New
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleRefreshHistory}
                  loading={historyRefreshing}
                  disabled={patientBootstrapLoading}
                >
                  Refresh
                </Button>
              </Space>
            }
            bodyStyle={{
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            <div className="orders-history-content">
              <Space direction="vertical" style={{ width: '100%', flexShrink: 0 }} size={12}>
                <Input
                  placeholder="Search order #, patient, phone"
                  value={listQueryInput}
                  allowClear
                  prefix={<SearchOutlined />}
                  onChange={(e) => setListQueryInput(e.target.value)}
                  onPressEnter={handleApplyHistorySearch}
                  disabled={historyRefreshing || patientBootstrapLoading}
                />
                <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                  <Select<'ALL' | OrderStatus>
                    style={{ minWidth: 170 }}
                    value={statusFilter}
                    options={ORDER_STATUS_FILTERS}
                    onChange={(value) => {
                      setStatusFilter(value);
                      setListPage(1);
                    }}
                    disabled={historyRefreshing || patientBootstrapLoading}
                  />
                  <RangePicker
                    allowClear={false}
                    value={historyDateRange}
                    onChange={handleHistoryDateRangeChange}
                    disabled={historyRefreshing || patientBootstrapLoading}
                  />
                  {historyShiftOptions.length > 0 ? (
                    <Select<string>
                      style={{ minWidth: 170 }}
                      value={historyShiftFilter}
                      options={[
                        { label: 'All shifts', value: 'ALL' },
                        ...historyShiftOptions.map((shift) => ({
                          label: shift.name?.trim() || shift.code?.trim() || shift.id,
                          value: shift.id,
                        })),
                      ]}
                      onChange={handleHistoryShiftFilterChange}
                      disabled={historyRefreshing || patientBootstrapLoading}
                    />
                  ) : null}
                  <Button
                    type="primary"
                    onClick={handleApplyHistorySearch}
                    loading={historyRefreshing}
                    disabled={patientBootstrapLoading}
                  >
                    Apply
                  </Button>
                </Space>
              </Space>

              {initialHistoryLoading ? (
                <div className="orders-history-loading">
                  <Spin tip={patientBootstrapLoading ? 'Loading patient...' : 'Loading order history...'} />
                </div>
              ) : patientList.length > 0 ? (
                <>
                  <div
                    className={`order-history-scroll${isDark ? ' order-history-scroll-dark' : ''}`}
                  >
                    <div
                      className="order-history-grid-row order-history-grid-header"
                      style={{
                        padding: '6px 8px',
                        borderBottom: styles.border,
                      }}
                    >
                      <Text type="secondary" className="order-history-header-text">Patient</Text>
                      <Text type="secondary" className="order-history-header-text">Status</Text>
                      <Text type="secondary" className="order-history-header-text">Order</Text>
                      <Text type="secondary" className="order-history-header-text">Shift</Text>
                      <Text type="secondary" className="order-history-header-text">Time</Text>
                      <span aria-hidden="true" />
                    </div>

                    <List
                      size="small"
                      className="order-history-list"
                      dataSource={patientList}
                      renderItem={(row) => {
                        const isLocked = row.createdOrder != null;
                        const isSelected = selectedRowId === row.rowId;
                        const name = getPatientName(row.patient);
                        const shiftLabel = row.createdOrder ? getShiftLabel(row.createdOrder) : null;
                        const shiftTagColor = shiftLabel ? getShiftTagColor(shiftLabel) : null;
                        return (
                          <List.Item
                            key={row.rowId}
                            style={{
                              padding: '6px 8px',
                              cursor: 'pointer',
                              backgroundColor: isSelected ? 'rgba(22, 119, 255, 0.08)' : undefined,
                              boxShadow: isSelected ? 'inset 3px 0 0 #1677ff' : undefined,
                            }}
                            onClick={() => setSelectedRowId(row.rowId)}
                          >
                            <div className="order-history-grid-row order-history-grid-body">
                              <div className="order-history-patient-cell">
                                <UserOutlined style={{ fontSize: 14, color: '#1677ff' }} />
                                <Text strong={isSelected} className="order-history-patient-name">
                                  {name || '-'}
                                </Text>
                              </div>

                              <div className="order-history-cell">
                                {isLocked ? (
                                  <Tag
                                    color={ORDER_STATUS_TAG_COLORS[row.createdOrder?.status ?? 'REGISTERED']}
                                    className="order-history-tag"
                                  >
                                    {row.createdOrder?.status ?? 'REGISTERED'}
                                  </Tag>
                                ) : (
                                  <Tag color="gold" icon={<PlusOutlined />} className="order-history-tag">
                                    New
                                  </Tag>
                                )}
                              </div>

                              <Text type="secondary" className="order-history-value-text">
                                {isLocked && row.createdOrder
                                  ? (row.createdOrder.orderNumber || row.createdOrder.id.substring(0, 8))
                                  : (nextOrderNumber ?? '-')}
                              </Text>

                              <div className="order-history-cell">
                                {isLocked ? (
                                  <Tag color={shiftTagColor ?? 'default'} className="order-history-tag">
                                    {shiftLabel}
                                  </Tag>
                                ) : (
                                  <Text type="secondary" className="order-history-value-text">
                                    -
                                  </Text>
                                )}
                              </div>

                              <Text type="secondary" className="order-history-value-text">
                                {isLocked && row.createdOrder
                                  ? dayjs(row.createdOrder.registeredAt).format('YYYY-MM-DD HH:mm')
                                  : '-'}
                              </Text>

                              <div className="order-history-action-cell">
                                {!isLocked ? (
                                  <Button
                                    type="text"
                                    danger
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removePatientFromList(row.rowId);
                                    }}
                                  />
                                ) : null}
                              </div>
                            </div>
                          </List.Item>
                        );
                      }}
                    />
                  </div>
                  <div className="orders-history-footer">
                    <Text type="secondary">
                      Page {listPage} of {totalPages}
                    </Text>
                    <Pagination
                      size="small"
                      current={listPage}
                      total={listTotal}
                      pageSize={ORDER_PAGE_SIZE}
                      showSizeChanger={false}
                      onChange={(page) => setListPage(page)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No orders found"
                    style={{ padding: 24, marginTop: 10 }}
                  />
                  <div className="orders-history-footer">
                    <Text type="secondary">
                      Page {listPage} of {totalPages}
                    </Text>
                    <Pagination
                      size="small"
                      current={listPage}
                      total={listTotal}
                      pageSize={ORDER_PAGE_SIZE}
                      showSizeChanger={false}
                      onChange={(page) => setListPage(page)}
                    />
                  </div>
                </>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12} lg={14}>
          <Card
            className="orders-right-card orders-workspace-card"
            style={{ height: 'calc(100vh - 252px)', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{
              overflow: 'hidden',
              paddingTop: 12,
              paddingInline: 12,
              paddingBottom: 0,
              flex: 1,
              minHeight: 0,
            }}
          >
            {!selectedPatient ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Select an order from history, or go to Patients to create a new order"
                style={{ padding: 60 }}
              />
            ) : isSelectedLocked && selectedCreatedOrderSummary ? (
              <div className="locked-order-view">
                <div className="locked-order-content">
                  <Card type="inner" className="orders-section-card" title="Tests in this order">
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      You can update tests for this order without changing order number or existing label sequence numbers.
                    </Text>
                    {selectedOrderDetailsLoading ? (
                      <Spin tip="Loading order details..." />
                    ) : selectedCreatedOrder ? (() => {
                      const orderTests = sortRootOrderTestsForReadonly(getRootOrderTests(selectedCreatedOrder));

                      let lockedTubesRequired: { tubeType: string; color: string; count: number }[] = [];
                      if (orderTests.length > 0) {
                        const groups = new Set<string>();
                        const typeByGroup = new Map<string, string>();
                        orderTests.forEach((t) => {
                          const type = t.tubeType || 'OTHER';
                          let groupKey = type;
                          if (printLabelSequenceBy === 'department') {
                            const fullTest = testOptions.find((opt) => opt.id === t.testId);
                            const deptId = fullTest?.departmentId || 'OTHER';
                            groupKey = `${deptId}-${type}`;
                          }
                          groups.add(groupKey);
                          typeByGroup.set(groupKey, type);
                        });
                        const counts = new Map<string, number>();
                        groups.forEach((groupKey) => {
                          const type = typeByGroup.get(groupKey)!;
                          counts.set(type, (counts.get(type) || 0) + 1);
                        });
                        lockedTubesRequired = Array.from(counts.entries()).map(([type, count]) => ({
                          tubeType: type,
                          color: getTubeColor(type),
                          count,
                        }));
                      }

                      return (
                        <Row gutter={[12, 12]}>
                          <Col span={18}>
                            {orderTests.length === 0 ? (
                              <Text type="secondary">No tests in this order.</Text>
                            ) : (
                              <div
                                className={`order-tests-readonly-wrapper${
                                  isDark ? ' order-tests-readonly-wrapper-dark' : ''
                                }`}
                              >
                                <div className="order-tests-readonly-grid-header">
                                  <span className="order-tests-readonly-label">Selected tests</span>
                                  <Text type="secondary" className="order-tests-readonly-count">
                                    {orderTests.length} tests
                                  </Text>
                                </div>
                                <Table
                                  dataSource={orderTests}
                                  rowKey="testId"
                                  pagination={false}
                                  size="small"
                                  tableLayout="fixed"
                                  scroll={{ y: 256 }}
                                  className="order-tests-readonly-table"
                                  columns={[
                                    {
                                      title: 'Test',
                                      key: 'displayLabel',
                                      className: 'order-tests-readonly-col-test',
                                      render: (_: unknown, orderTest: SelectedTest) => (
                                        <span
                                          className="order-tests-readonly-table-abbrev"
                                          title={`${orderTest.testName} (${orderTest.testCode})`}
                                        >
                                          {orderTest.displayLabel || '-'}
                                        </span>
                                      ),
                                    },
                                    {
                                      title: 'Status',
                                      key: 'status',
                                      width: 112,
                                      className: 'order-tests-readonly-col-status',
                                      render: (_: unknown, orderTest: SelectedTest) => {
                                        const status = getEditTestStatusDisplay(orderTest.currentStatus);
                                        return (
                                          <span
                                            className={`order-tests-readonly-status-badge order-tests-readonly-status-${status.tone}`}
                                          >
                                            {status.label}
                                          </span>
                                        );
                                      },
                                    },
                                    {
                                      title: 'Tube Type',
                                      key: 'tubeType',
                                      width: 104,
                                      className: 'order-tests-readonly-col-tube',
                                      render: (_: unknown, orderTest: SelectedTest) => (
                                        <span className="order-tests-readonly-table-chip">
                                          {formatTokenLabel(orderTest.tubeType)}
                                        </span>
                                      ),
                                    },
                                    {
                                      title: 'Price',
                                      key: 'price',
                                      width: 96,
                                      className: 'order-tests-readonly-col-price',
                                      render: (_: unknown, orderTest: SelectedTest) => (
                                        <span className="order-tests-readonly-table-price">
                                          {orderTest.price != null
                                            ? `${orderTest.price.toLocaleString()} IQD`
                                            : '-'}
                                        </span>
                                      ),
                                    },
                                  ]}
                                />
                              </div>
                            )}
                          </Col>
                          <Col span={6}>
                            <div
                              className={`order-composer-tubes-summary${
                                isDark ? ' order-composer-tubes-summary-dark' : ''
                              }`}
                            >
                              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                <Text strong className="order-composer-tubes-title">
                                  Tubes required:
                                </Text>
                                {lockedTubesRequired.length === 0 ? (
                                  <Text type="secondary" className="order-composer-tubes-empty">
                                    0 tubes
                                  </Text>
                                ) : (
                                  <Space size={14} wrap>
                                    {lockedTubesRequired.map((tr) => (
                                      <Space key={tr.tubeType} size={6} align="center">
                                        <TubeIcon color={tr.color} />
                                        <Space size={2} direction="vertical" align="start" style={{ lineHeight: 1.2 }}>
                                          <Text strong className="order-composer-tubes-count">
                                            {tr.count}
                                          </Text>
                                          <Text
                                            type="secondary"
                                            className="order-composer-tubes-label"
                                          >
                                            {tr.tubeType?.replace(/_/g, ' ').toLowerCase() || 'tube'}
                                          </Text>
                                        </Space>
                                      </Space>
                                    ))}
                                  </Space>
                                )}
                              </Space>
                            </div>
                            <div
                              className={`order-delivery-preferences${isDark ? ' order-delivery-preferences-dark' : ''}`}
                            >
                              <Text strong style={{ fontSize: 13 }}>Preferred delivery:</Text>
                              <div className="order-delivery-buttons">
                                {DELIVERY_METHODS.map((method) => (
                                  <Button
                                    key={method}
                                    size="small"
                                    type={selectedDeliveryMethods.includes(method) ? 'primary' : 'default'}
                                    disabled={lockedOrderBaseActionsDisabled}
                                    onClick={() => toggleDeliveryMethod(method)}
                                  >
                                    {DELIVERY_METHOD_LABELS[method]}
                                  </Button>
                                ))}
                              </div>
                              <Button
                                block
                                size="small"
                                onClick={() => void handleSaveDeliveryPreferences()}
                                loading={savingDeliveryMethods}
                                disabled={lockedOrderBaseActionsDisabled || !hasLockedDeliveryMethodChanges}
                              >
                                Save preferences
                              </Button>
                            </div>
                          </Col>
                        </Row>
                      );
                    })() : selectedOrderDetailsError ? (
                      <Result
                        status="warning"
                        title="Unable to load order details"
                        subTitle={selectedOrderDetailsError}
                        extra={
                          <Button
                            onClick={() => void fetchOrderDetails(selectedCreatedOrderSummary.id, 'retry')}
                            loading={selectedOrderDetailsLoading}
                          >
                            Retry
                          </Button>
                        }
                      />
                    ) : (
                      <Spin tip="Loading order details..." />
                    )}
                  </Card>
                </div>
                {orderBottomControls}
              </div>
            ) : (
              <div className="draft-order-view">
                <div className="draft-order-content">
                  <Row gutter={[12, { xs: 12, xl: 0 }]} className="order-composer-grid">
                    <Col xs={24} xl={16}>
                      <Card
                        size="small"
                        className="orders-section-card order-composer-select-card"
                        title="Select tests"
                      >
                        <div className="order-draft-referred-row">
                          <Text strong style={{ display: 'block', marginBottom: 6 }}>
                            Referred by
                          </Text>
                          <AutoComplete
                            value={referredBy}
                            onChange={setReferredBy}
                            options={referringDoctorOptions.map((name) => ({ value: name }))}
                            placeholder="Select from list or type doctor name"
                            style={{ width: '100%', marginBottom: 12 }}
                            filterOption={(inputValue, option) =>
                              String(option?.value ?? '')
                                .toLowerCase()
                                .includes(inputValue.toLowerCase())
                            }
                            allowClear
                          />
                        </div>
                        <Select
                          showSearch
                          placeholder="Search tests by name or code..."
                          style={{ width: '100%', marginBottom: 12 }}
                          value={null}
                          onChange={handleAddTest}
                          filterOption={false}
                          onSearch={setTestSearch}
                          loading={loadingTests}
                          notFoundContent={loadingTests ? <Spin size="small" /> : 'No tests found'}
                          options={filteredTests.map((t) => ({
                            value: t.id,
                            label: (
                              <Space>
                                <Text strong>{t.code}</Text>
                                <Text>{(t as any).abbreviation ? `${(t as any).abbreviation} - ${t.name}` : t.name}</Text>
                                <Text type="secondary">({t.tubeType})</Text>
                              </Space>
                            ),
                          }))}
                        />

                        <div className="order-composer-toolbar">
                          <Text strong>Selected tests</Text>
                          <Text type="secondary">{selectedTests.length} selected</Text>
                        </div>

                        <div className="order-selected-tests-panel">
                          {selectedTests.length === 0 ? (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description="No tests selected. Use search above or test groups."
                              style={{ padding: 24 }}
                            />
                          ) : (
                            <Table
                              dataSource={selectedTests}
                              rowKey="testId"
                              pagination={false}
                              size="small"
                              scroll={{ y: '100%' }}
                              className="order-selected-tests-table"
                              tableLayout="fixed"
                              columns={[
                                {
                                  title: 'Test',
                                  dataIndex: 'testCode',
                                  key: 'testCode',
                                  className: 'order-selected-col-test',
                                  ellipsis: true,
                                  render: (_, record) => (
                                    <Text className="order-selected-test-name" title={record.testName}>
                                      {record.testName}
                                    </Text>
                                  ),
                                },
                                {
                                  title: 'Sample',
                                  dataIndex: 'tubeType',
                                  key: 'tubeType',
                                  className: 'order-selected-col-tube',
                                  render: (tubeType: string) => (
                                    <span className="order-selected-test-tube">
                                      {tubeType || '-'}
                                    </span>
                                  ),
                                },
                                {
                                  title: '',
                                  key: 'action',
                                  align: 'right',
                                  className: 'order-selected-col-action',
                                  width: 52,
                                  render: (_, record) => (
                                    <Button
                                      type="text"
                                      danger
                                      className="order-selected-test-delete-btn"
                                      icon={<DeleteOutlined />}
                                      onClick={() => handleRemoveTest(record.testId)}
                                      size="small"
                                    />
                                  ),
                                },
                              ]}
                              style={{ border: styles.borderDark, borderRadius: 8 }}
                            />
                          )}
                        </div>
                      </Card>
                    </Col>

                    <Col xs={24} xl={8}>
                      <Card size="small" className="orders-section-card" title="Quick groups">
                        {uiTestGroups.length === 0 ? (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="No test groups saved"
                            style={{ padding: 24, marginTop: 8 }}
                          />
                        ) : (
                          <>
                            <div className="order-composer-groups">
                              {uiTestGroups.map((group) => (
                                <Button
                                  key={group.id}
                                  onClick={() => handleAddGroupTests(group.testIds)}
                                >
                                  {group.name}
                                </Button>
                              ))}
                            </div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Group selection uses dynamic lab settings and avoids duplicate tests.
                            </Text>
                          </>
                        )}
                      </Card>

                      <div
                        className={`order-composer-tubes-summary order-composer-tubes-summary-spaced${
                          isDark ? ' order-composer-tubes-summary-dark' : ''
                        }`}
                      >
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          <Text strong className="order-composer-tubes-title">
                            Tubes required by type:
                          </Text>
                          {tubesRequired.length === 0 ? (
                            <Text type="secondary" className="order-composer-tubes-empty">
                              0 tubes
                            </Text>
                          ) : (
                            <Space size={14} wrap>
                              {tubesRequired.map((tr) => (
                                <Space key={tr.tubeType} size={6} align="center">
                                  <TubeIcon color={tr.color} />
                                  <Space size={2} direction="vertical" align="start" style={{ lineHeight: 1.2 }}>
                                    <Text strong className="order-composer-tubes-count">
                                      {tr.count}
                                    </Text>
                                    <Text
                                      type="secondary"
                                      className="order-composer-tubes-label"
                                    >
                                      {tr.tubeType?.replace(/_/g, ' ').toLowerCase() || 'tube'}
                                    </Text>
                                  </Space>
                                </Space>
                              ))}
                            </Space>
                          )}
                          <Text type="secondary" className="order-composer-tubes-hint">
                            Grouped by {printLabelSequenceBy === 'department' ? 'department' : 'tube type'}
                          </Text>
                        </Space>
                      </div>

                      <div
                        className={`order-delivery-preferences${isDark ? ' order-delivery-preferences-dark' : ''}`}
                      >
                        <Text strong style={{ fontSize: 13 }}>Preferred delivery:</Text>
                        <div className="order-delivery-buttons">
                          {DELIVERY_METHODS.map((method) => (
                            <Button
                              key={method}
                              size="small"
                              type={selectedDeliveryMethods.includes(method) ? 'primary' : 'default'}
                              disabled={submitting}
                              onClick={() => toggleDeliveryMethod(method)}
                            >
                              {DELIVERY_METHOD_LABELS[method]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
                {orderBottomControls}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="Partially paid"
        open={partialPaymentModalOpen}
        onCancel={() => setPartialPaymentModalOpen(false)}
        onOk={async () => {
          if (!selectedCreatedOrderSummary?.id) return;
          const final = Number(selectedCreatedOrderSummary.finalAmount ?? 0);
          const amount = Number(partialPaymentAmount) || 0;
          if (amount <= 0) {
            message.warning('Enter amount paid (greater than 0)');
            return;
          }
          if (amount >= final) {
            message.info('Amount is full - use "Mark as paid" instead.');
            return;
          }
          setUpdatingPayment(true);
          try {
            const updated = await updateOrderPayment(selectedCreatedOrderSummary.id, {
              paymentStatus: 'partial',
              paidAmount: Math.round(amount * 100) / 100,
            });
            message.success('Marked as partially paid');
            applyUpdatedOrderToList(updated);
            setPartialPaymentModalOpen(false);
          } catch {
            message.error('Failed to update payment');
          } finally {
            setUpdatingPayment(false);
          }
        }}
        okText="Mark partially paid"
        cancelButtonProps={{ disabled: updatingPayment }}
        okButtonProps={{ loading: updatingPayment }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Text type="secondary">Enter how much the patient has paid so far.</Text>
          {selectedCreatedOrderSummary && (
            <>
              <div>
                <Text strong>Amount paid (IQD)</Text>
                <div style={{ marginTop: 8 }}>
                  <InputNumber
                    min={0}
                    max={Number(selectedCreatedOrderSummary.finalAmount ?? 0)}
                    value={partialPaymentAmount}
                    onChange={(v) => setPartialPaymentAmount(Number(v) ?? 0)}
                    style={{ width: '100%', maxWidth: 240 }}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
                  />
                </div>
              </div>
              <Text type="secondary">
                Total due: {Number(selectedCreatedOrderSummary.finalAmount ?? 0).toLocaleString()} IQD
              </Text>
            </>
          )}
        </Space>
      </Modal>

      <Modal
        title={
          <div className="orders-edit-tests-modal-heading">
            <span className="orders-edit-tests-modal-icon">
              <LockOutlined />
            </span>
            <div className="orders-edit-tests-modal-heading-copy">
              <span className="orders-edit-tests-modal-title">Edit tests in order</span>
              <span className="orders-edit-tests-modal-subtitle">
                {editTestsOrderNumber ? `Locked order #${editTestsOrderNumber}` : 'Locked order editor'}
              </span>
            </div>
          </div>
        }
        open={editTestsModalOpen}
        width={900}
        className={`orders-edit-tests-modal${isDark ? ' orders-edit-tests-modal-dark' : ''}`}
        onCancel={() => {
          if (!savingEditedTests) {
            setEditTestsModalOpen(false);
            setEditTestsRemovalReasonModalOpen(false);
            setEditTestsRemovalReason('');
          }
        }}
        onOk={handleSaveEditedTests}
        okText="Save tests"
        okButtonProps={{ loading: savingEditedTests }}
        cancelButtonProps={{ disabled: savingEditedTests }}
        destroyOnClose
      >
        <div className="orders-edit-tests-shell">
          <Text className="orders-edit-tests-description" type="secondary">
            Remove pending, completed, and rejected tests here. Removing a panel removes the whole
            panel. Verified tests and in-progress panels require lab-admin override with a reason.
            Other in-progress tests stay locked. Order number and sample sequence numbers stay
            unchanged.
          </Text>

          <div className="orders-edit-tests-toolbar">
            <div className="orders-edit-tests-toolbar-copy">
              <Text strong>Add another test</Text>
              <Text type="secondary">Search by code, abbreviation, or test name.</Text>
            </div>
            <Select
              showSearch
              className="orders-edit-tests-select"
              placeholder="Add test by code or name"
              value={null}
              loading={loadingTests}
              onChange={handleAddEditingTest}
              optionFilterProp="label"
              filterOption={(input, option) => {
                const label = String(option?.label ?? '').toLowerCase();
                const variants = buildKeyboardSearchVariants(input);
                if (variants.length === 0) return true;
                return variants.some((variant) => label.includes(variant));
              }}
              options={testOptions.map((test) => ({
                value: test.id,
                label: (test as any).abbreviation
                  ? `${test.code} - ${(test as any).abbreviation} - ${test.name} (${test.tubeType})`
                  : `${test.code} - ${test.name} (${test.tubeType})`,
              }))}
            />
          </div>

          {editingTests.length === 0 ? (
            <div className="orders-edit-tests-empty">
              <Text strong>No tests selected</Text>
              <Text type="secondary">
                Keep at least one test in the order, or add new tests from the search field above.
              </Text>
            </div>
          ) : (
            <Table
              className="orders-edit-tests-table"
              dataSource={editingTests}
              columns={editTestsTableColumns}
              rowKey="testId"
              rowClassName={(test) =>
                `orders-edit-tests-table-row${test.blocked ? ' is-blocked' : ''}${
                  test.adminReasonRequired ? ' is-admin-review' : ''
                }`
              }
              pagination={false}
              size="small"
              tableLayout="fixed"
              scroll={{ y: 360, x: 760 }}
            />
          )}
        </div>
      </Modal>

      <Modal
        title="Reason required"
        open={editTestsRemovalReasonModalOpen}
        className={`orders-edit-reason-modal${isDark ? ' orders-edit-reason-modal-dark' : ''}`}
        onCancel={() => {
          if (!savingEditedTests) {
            setEditTestsRemovalReasonModalOpen(false);
            setEditTestsRemovalReason('');
          }
        }}
        onOk={() => {
          void handleSaveEditedTests();
        }}
        okText="Save tests"
        okButtonProps={{
          loading: savingEditedTests,
          disabled: !editTestsRemovalReason.trim(),
        }}
        cancelButtonProps={{ disabled: savingEditedTests }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text type="secondary">
            Verified test removal requires a reason. This will be saved in the audit log.
          </Text>
          <Input.TextArea
            rows={4}
            maxLength={300}
            value={editTestsRemovalReason}
            onChange={(event) => setEditTestsRemovalReason(event.target.value)}
            placeholder="Enter removal reason"
          />
        </Space>
      </Modal>

      <PrintPreviewModal
        open={printModalOpen}
        onClose={() => {
          setPrintModalOpen(false);
          setPrintOrder(null);
        }}
        order={printOrder}
        type={printType}
        labName={lab?.name}
        labelSequenceBy={printLabelSequenceBy}
        departments={departments}
      />
    </div>
  );
}
