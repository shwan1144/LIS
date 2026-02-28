import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Card,
  Button,
  Space,
  message,
  Select,
  Input,
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
} from 'antd';
import {
  ShoppingCartOutlined,
  PrinterOutlined,
  UserOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
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
  searchOrdersHistory,
  getOrder,
  getNextOrderNumber,
  getOrderPriceEstimate,
  getLabSettings,
  updateOrderPayment,
  updateOrderDiscount,
  updateOrderTests,
  updateLabSettings,
  type CreateOrderDto,
  type PatientDto,
  type TestDto,
  type OrderDto,
  type OrderHistoryItemDto,
  type OrderStatus,
  type DepartmentDto,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { PrintPreviewModal } from '../components/Print';
import {
  directPrintLabels,
  directPrintReceipt,
  getDirectPrintErrorMessage,
} from '../printing/direct-print';
import './OrdersPage.css';

const { Title, Text } = Typography;

interface SelectedTest {
  testId: string;
  testCode: string;
  testName: string;
  tubeType: string;
  locked?: boolean;
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
const ORDER_STATUS_FILTERS: Array<{ label: string; value: 'ALL' | OrderStatus }> = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Registered', value: 'REGISTERED' },
  { label: 'Collected', value: 'COLLECTED' },
  { label: 'In progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];
const ORDER_STATUS_TAG_COLORS: Record<OrderStatus, string> = {
  REGISTERED: 'blue',
  COLLECTED: 'purple',
  IN_PROGRESS: 'cyan',
  COMPLETED: 'green',
  CANCELLED: 'red',
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

function toOrderHistoryItem(order: OrderDto): OrderHistoryItemDto {
  const readyTestsCount = Number(order.readyTestsCount ?? 0) || 0;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    registeredAt: order.registeredAt,
    paymentStatus:
      order.paymentStatus === 'paid' || order.paymentStatus === 'partial'
        ? order.paymentStatus
        : 'unpaid',
    paidAmount: order.paidAmount != null ? Number(order.paidAmount) : null,
    finalAmount: Number(order.finalAmount ?? 0),
    patient: order.patient,
    shift: order.shift,
    testsCount: Number(order.testsCount ?? 0) || 0,
    readyTestsCount,
    reportReady: Boolean(order.reportReady) || readyTestsCount > 0,
  };
}

export function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const { lab, currentShiftId, currentShiftLabel } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const styles = useMemo(
    () => ({
      border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #f0f0f0',
      borderDark: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #d9d9d9',
      bgSubtle: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
    }),
    [isDark]
  );
  const orderHistoryGridTemplate = 'minmax(150px, 1.9fr) 88px 76px 74px 98px';

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

  const [subtotal, setSubtotal] = useState(0);
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
  const [orderDetailsCache, setOrderDetailsCache] = useState<Record<string, OrderDto>>({});
  const [orderDetailsLoadingId, setOrderDetailsLoadingId] = useState<string | null>(null);
  const [orderDetailsErrors, setOrderDetailsErrors] = useState<Record<string, string>>({});
  const orderDetailsRequestVersionRef = useRef<Record<string, number>>({});
  const discountSaveTimerRef = useRef<number | null>(null);
  const discountSaveRequestVersionRef = useRef(0);

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
  const isSelectedLocked = selectedRow != null && selectedRow.createdOrder != null;
  const selectedOrderDetailsLoading =
    selectedCreatedOrderSummary != null && orderDetailsLoadingId === selectedCreatedOrderSummary.id;
  const selectedOrderDetailsError =
    selectedCreatedOrderSummary != null ? orderDetailsErrors[selectedCreatedOrderSummary.id] ?? null : null;
  const lockedOrderContextActive = isSelectedLocked && selectedCreatedOrderSummary != null;
  const lockedOrderActionsReady = lockedOrderContextActive && selectedCreatedOrder != null;
  const lockedOrderActionsBusy =
    submitting ||
    updatingPayment ||
    updatingDiscount ||
    savingEditedTests ||
    printingAction !== null;
  const lockedOrderActionsDisabled = lockedOrderActionsBusy || !lockedOrderActionsReady;
  const lockedOrderActionDisabledTitle = lockedOrderActionsBusy
    ? 'Please wait until the current action finishes.'
    : !lockedOrderContextActive
      ? 'Select a locked order to use these actions.'
      : !selectedCreatedOrder
        ? 'Order details are still loading.'
        : undefined;

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
    [draftPatient, listPage, listQuery, statusFilter],
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
        const [depts, tsts, settings] = await Promise.all([
          getDepartments(),
          getTests(),
          getLabSettings()
        ]);
        setDepartments(depts);
        setTestOptions(tsts);
        const activeIds = new Set(tsts.filter((t) => t.isActive).map((t) => t.id));
        const validGroups = (settings.uiTestGroups || []).map(g => ({
          ...g,
          testIds: g.testIds.filter(id => activeIds.has(id))
        })).filter(g => g.testIds.length > 0);
        setUiTestGroups(validGroups);
        setPrintLabelSequenceBy(settings.labelSequenceBy ?? 'tube_type');
      } catch {
        message.warning('Failed to load tests or departments');
      } finally {
        setLoadingTests(false);
      }
    }
    init();
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
        if (!cancelled) setSubtotal(0);
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
    const search = testSearch.toLowerCase();
    return testOptions.filter(
      (t) =>
        t.name.toLowerCase().includes(search) ||
        t.code.toLowerCase().includes(search)
    );
  }, [testOptions, testSearch]);

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

  const getRootOrderTests = (order: OrderDto): SelectedTest[] => {
    const all = (order.samples ?? []).flatMap((sample) => sample.orderTests ?? []);
    const root = all.filter((orderTest) => !orderTest.parentOrderTestId);
    const childrenByParent = new Map<string, typeof all>();
    all.forEach((orderTest) => {
      if (!orderTest.parentOrderTestId) return;
      const current = childrenByParent.get(orderTest.parentOrderTestId) ?? [];
      current.push(orderTest);
      childrenByParent.set(orderTest.parentOrderTestId, current);
    });

    return root.map((orderTest) => {
      const childTests = childrenByParent.get(orderTest.id) ?? [];
      const hasProcessedChild = childTests.some((child) => child.status !== 'PENDING');
      return {
        locked: orderTest.status !== 'PENDING' || hasProcessedChild,
        testId: orderTest.testId,
        testCode: orderTest.test?.code ?? '-',
        testName: orderTest.test?.name ?? 'Unknown',
        tubeType: orderTest.test?.tubeType ?? 'OTHER',
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
    if (!isSelectedLocked || !selectedCreatedOrder) return;
    const normalizedDiscount = Math.min(
      100,
      Math.max(0, Number(selectedCreatedOrder.discountPercent ?? 0)),
    );
    setDiscountPercent((current) =>
      Math.abs(current - normalizedDiscount) < 0.001 ? current : normalizedDiscount,
    );
  }, [isSelectedLocked, selectedCreatedOrder]);

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
      },
    ]);
  };

  const handleRemoveEditingTest = (testId: string) => {
    const target = editingTests.find((item) => item.testId === testId);
    if (target?.locked) {
      message.warning('Completed/entered test is locked and cannot be removed.');
      return;
    }
    setEditingTests((prev) => prev.filter((item) => item.testId !== testId));
  };

  const handleSaveEditedTests = async () => {
    if (!selectedCreatedOrder?.id) return;
    if (editingTests.length === 0) {
      message.error('At least one test is required');
      return;
    }

    setSavingEditedTests(true);
    try {
      const updated = await updateOrderTests(selectedCreatedOrder.id, {
        testIds: editingTests.map((test) => test.testId),
      });
      applyUpdatedOrderToList(updated);
      setEditTestsModalOpen(false);
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
        ...(currentShiftId ? { shiftId: currentShiftId } : {}),
        samples: Object.entries(testsByTube).map(([tubeType, tests]) => ({
          tubeType: tubeType as CreateOrderDto['samples'][0]['tubeType'],
          tests: tests.map((t) => ({ testId: t.testId })),
        })),
      };

      const createdOrder = await createOrder(orderData);
      const historyItem = toOrderHistoryItem(createdOrder);
      const lockedRowId = `order-${createdOrder.id}`;
      const selectedDraftRowId = selectedRowId ?? `draft-${selectedPatient.id}`;

      setOrderDetailsCache((prev) => ({ ...prev, [createdOrder.id]: createdOrder }));
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

      setDraftPatient(null);
      setSelectedTests([]);
      setListPage(1);
      void loadOrderHistory({
        focusOrderId: createdOrder.id,
        pageOverride: 1,
        draftPatientOverride: null,
        mode: 'soft',
      });
      message.success('Order created successfully');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
            ?.message
          : 'Order creation failed';
      message.error(msg || 'Order creation failed');
    } finally {
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
    if (lockedOrderActionsDisabled || !selectedCreatedOrder) return;
    openEditTestsModal();
  };

  const handleLockedPrint = (type: 'receipt' | 'labels') => {
    if (lockedOrderActionsDisabled || !selectedCreatedOrder) return;
    void openPrint(selectedCreatedOrder, type);
  };

  const handleLockedMarkPaid = async () => {
    if (lockedOrderActionsDisabled || !selectedCreatedOrderSummary) return;
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
    if (lockedOrderActionsDisabled || !selectedCreatedOrderSummary) return;
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
    if (lockedOrderActionsDisabled || !selectedCreatedOrderSummary) return;
    setPartialPaymentAmount(
      selectedCreatedOrderSummary?.paidAmount != null ? Number(selectedCreatedOrderSummary.paidAmount) : 0,
    );
    setPartialPaymentModalOpen(true);
  };

  const handleLockedStartNewOrder = () => {
    if (lockedOrderActionsDisabled || !selectedCreatedOrderSummary || !selectedPatient) return;
    addNewOrderForPatient(selectedCreatedOrderSummary.patient ?? selectedPatient);
  };

  const handleSummaryDiscountChange = (value: number | null) => {
    const normalized = Math.min(100, Math.max(0, Number(value ?? 0)));
    setDiscountPercent(normalized);
    if (!isSelectedLocked || !selectedCreatedOrderSummary || !selectedCreatedOrder) return;

    const serverDiscount = Math.min(100, Math.max(0, Number(selectedCreatedOrder.discountPercent ?? 0)));
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
    if (!isSelectedLocked || !selectedCreatedOrderSummary || !selectedCreatedOrder) return;
    const normalized = Math.round(Math.min(100, Math.max(0, nextDiscount ?? discountPercent)) * 100) / 100;
    const serverDiscount = Math.min(100, Math.max(0, Number(selectedCreatedOrder.discountPercent ?? 0)));
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
  const totalAfterDiscount = Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100;
  const totalPages = Math.max(1, Math.ceil(listTotal / ORDER_PAGE_SIZE));
  const lockedOrderTestsCount = Number(
    selectedCreatedOrderSummary?.testsCount ??
    (selectedCreatedOrder ? getRootOrderTests(selectedCreatedOrder).length : 0),
  );
  const lockedOrderSubtotal = Number(
    selectedCreatedOrder?.totalAmount ??
    selectedCreatedOrderSummary?.finalAmount ??
    0,
  );
  const summaryTestsCount = isSelectedLocked ? lockedOrderTestsCount : totalTests;
  const summarySubtotal = isSelectedLocked
    ? lockedOrderSubtotal
    : subtotal;
  const summaryTotalAmount = Math.round(summarySubtotal * (1 - discountPercent / 100) * 100) / 100;
  const createOrderDisabledReason = isSelectedLocked
    ? 'Create order is only available while preparing a new order.'
    : selectedTests.length === 0
      ? 'Select at least one test to create the order.'
      : undefined;

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

  const orderSummaryBar = selectedPatient ? (
    <Card
      className={`order-summary-bar${isDark ? ' order-summary-bar-dark' : ''}`}
      bodyStyle={{ padding: 10 }}
    >
      <div className="order-summary-grid">
        <div className="order-summary-item">
          <Text type="secondary">Tests</Text>
          <Text strong>{summaryTestsCount}</Text>
        </div>
        <div className="order-summary-item">
          <Text type="secondary">Subtotal</Text>
          <Text strong>{loadingPrice && !isSelectedLocked ? '...' : `${summarySubtotal.toFixed(0)} IQD`}</Text>
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
              disabled={submitting || updatingDiscount || (isSelectedLocked && !selectedCreatedOrder)}
              style={{ width: 70 }}
            />
            <span className="order-summary-suffix">%</span>
          </Space.Compact>
        </div>
        <div className="order-summary-item order-summary-total">
          <Text type="secondary">Total</Text>
          <Text strong>{loadingPrice && !isSelectedLocked ? '...' : `${summaryTotalAmount.toFixed(0)} IQD`}</Text>
        </div>
        <div className="order-summary-action">
          <Button
            type="primary"
            size="large"
            icon={<ShoppingCartOutlined />}
            onClick={handleSubmit}
            loading={submitting}
            disabled={isSelectedLocked || selectedTests.length === 0}
            title={createOrderDisabledReason}
          >
            Create order
          </Button>
        </div>
      </div>
    </Card>
  ) : null;

  const currentPaymentStatus = selectedCreatedOrderSummary?.paymentStatus ?? 'unpaid';
  const lockedOrderActionBar = selectedPatient ? (
    <div
      className={`locked-order-action-bar${isDark ? ' locked-order-action-bar-dark' : ''}${lockedOrderContextActive ? '' : ' locked-order-action-bar-inactive'}`}
    >
      <div className="locked-order-action-row">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleLockedStartNewOrder}
          size="large"
          disabled={lockedOrderActionsDisabled}
          title={lockedOrderActionDisabledTitle}
          className="locked-order-new-btn"
        >
          New order for this patient
        </Button>
        <Button
          icon={<PlusOutlined />}
          onClick={handleLockedEditTests}
          size="large"
          loading={savingEditedTests}
          disabled={lockedOrderActionsDisabled}
          title={lockedOrderActionDisabledTitle}
        >
          Edit tests
        </Button>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          onClick={() => handleLockedPrint('receipt')}
          size="large"
          loading={printingAction === 'receipt'}
          disabled={lockedOrderActionsDisabled}
          title={lockedOrderActionDisabledTitle}
        >
          Receipt
        </Button>
        <Button
          icon={<PrinterOutlined />}
          onClick={() => handleLockedPrint('labels')}
          size="large"
          loading={printingAction === 'labels'}
          disabled={lockedOrderActionsDisabled}
          title={lockedOrderActionDisabledTitle}
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
              disabled={lockedOrderActionsDisabled}
              title={lockedOrderActionDisabledTitle}
            >
              Mark as paid
            </Button>
            <Button
              loading={updatingPayment}
              onClick={handleLockedOpenPartialPayment}
              size="large"
              disabled={lockedOrderActionsDisabled}
              title={lockedOrderActionDisabledTitle}
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
            disabled={lockedOrderActionsDisabled}
            title={lockedOrderActionDisabledTitle}
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
              disabled={lockedOrderActionsDisabled}
              title={lockedOrderActionDisabledTitle}
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
              disabled={lockedOrderActionsDisabled}
              title={lockedOrderActionDisabledTitle}
            >
              Partially paid
              {selectedCreatedOrderSummary?.paidAmount != null &&
                ` (${selectedCreatedOrderSummary.paidAmount} / ${selectedCreatedOrderSummary.finalAmount})`}
            </Button>
          </>
        )}
      </div>
    </div>
  ) : null;
  const orderBottomControls = selectedPatient ? (
    <div className="order-bottom-stack">
      {orderSummaryBar}
      {lockedOrderActionBar}
    </div>
  ) : null;

  return (
    <div>
      <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>
        Orders {listTotal > 0 && (
          <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 14 }}>({listTotal} total)</Text>
        )}
      </Title>

      <Row gutter={16}>
        {/* Left: Order history */}
        <Col xs={24} md={12} lg={10}>
          <Card
            style={{ minWidth: 260 }}
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
              height: 'calc(100vh - 200px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                width: '100%',
              }}
            >
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
                <div style={{ marginTop: 10, flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spin tip={patientBootstrapLoading ? 'Loading patient...' : 'Loading order history...'} />
                </div>
              ) : patientList.length > 0 ? (
                <>
                  <div
                    className={`order-history-scroll${isDark ? ' order-history-scroll-dark' : ''}`}
                  >
                    <div
                      style={{
                        padding: '4px 8px 6px',
                        borderBottom: styles.border,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 14 }} />
                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                            display: 'grid',
                            gridTemplateColumns: orderHistoryGridTemplate,
                            columnGap: 4,
                          }}
                        >
                          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Patient</Text>
                          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Status</Text>
                          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Order</Text>
                          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Shift</Text>
                          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Time</Text>
                        </div>
                        <div style={{ width: 24 }} />
                      </div>
                    </div>

                    <List
                      size="small"
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
                              borderLeft: isSelected ? '3px solid #1677ff' : undefined,
                            }}
                            onClick={() => setSelectedRowId(row.rowId)}
                          >
                            <div
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 8,
                              }}
                            >
                              <Space size={8} align="start" style={{ minWidth: 0, flex: 1 }}>
                                <UserOutlined style={{ fontSize: 14, color: '#1677ff', marginTop: 2 }} />
                                <div
                                  style={{
                                    minWidth: 0,
                                    flex: 1,
                                    display: 'grid',
                                    gridTemplateColumns: orderHistoryGridTemplate,
                                    alignItems: 'center',
                                    columnGap: 4,
                                  }}
                                >
                                  <Text
                                    strong={isSelected}
                                    style={{
                                      fontSize: 13,
                                      lineHeight: '16px',
                                      wordBreak: 'break-word',
                                      margin: 0,
                                    }}
                                  >
                                    {name || '-'}
                                  </Text>

                                  {isLocked ? (
                                    <Tag
                                      color={ORDER_STATUS_TAG_COLORS[row.createdOrder?.status ?? 'REGISTERED']}
                                      style={{
                                        margin: 0,
                                        fontSize: 10,
                                        lineHeight: '14px',
                                        paddingInline: 4,
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {row.createdOrder?.status ?? 'REGISTERED'}
                                    </Tag>
                                  ) : (
                                    <Tag
                                      color="gold"
                                      icon={<PlusOutlined />}
                                      style={{
                                        margin: 0,
                                        fontSize: 10,
                                        lineHeight: '14px',
                                        paddingInline: 4,
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      New
                                    </Tag>
                                  )}

                                  <Text
                                    type="secondary"
                                    style={{
                                      fontSize: 10,
                                      lineHeight: '14px',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {isLocked && row.createdOrder
                                      ? (row.createdOrder.orderNumber || row.createdOrder.id.substring(0, 8))
                                      : (nextOrderNumber ?? '-')}
                                  </Text>

                                  {isLocked ? (
                                    <Tag
                                      color={shiftTagColor ?? 'default'}
                                      style={{
                                        margin: 0,
                                        fontSize: 10,
                                        lineHeight: '14px',
                                        paddingInline: 4,
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {shiftLabel}
                                    </Tag>
                                  ) : (
                                    <Text
                                      type="secondary"
                                      style={{
                                        fontSize: 10,
                                        lineHeight: '14px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                    >
                                      -
                                    </Text>
                                  )}

                                  <Text
                                    type="secondary"
                                    style={{
                                      fontSize: 10,
                                      lineHeight: '14px',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {isLocked && row.createdOrder
                                      ? dayjs(row.createdOrder.registeredAt).format('YYYY-MM-DD HH:mm')
                                      : '-'}
                                  </Text>
                                </div>
                              </Space>

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
                          </List.Item>
                        );
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, flexShrink: 0 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
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

        {/* Right: Test selection or order success */}
        <Col xs={24} md={12} lg={14}>
          <Card className="orders-right-card" bodyStyle={{ height: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            {!selectedPatient ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Select an order from history, or go to Patients to create a new order"
                style={{ padding: 60 }}
              />
            ) : isSelectedLocked && selectedCreatedOrderSummary ? (
              <div className="locked-order-view">
                <div className="locked-order-content">
                  <Card size="small" className="locked-order-summary-card">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space size={10} align="center">
                        <CheckCircleOutlined className="locked-order-summary-icon" />
                        <Text strong className="locked-order-summary-title">
                          Order details
                        </Text>
                      </Space>
                      <div className="locked-order-summary-meta">
                        <div>
                          <Text type="secondary">Patient: </Text>
                          <Text strong>{getPatientName(selectedCreatedOrderSummary.patient ?? selectedPatient)}</Text>
                        </div>
                        <div>
                          <Text type="secondary">Order ID: </Text>
                          <Text strong>
                            {selectedCreatedOrderSummary.orderNumber || selectedCreatedOrderSummary.id}
                          </Text>
                        </div>
                        <div>
                          <Text type="secondary">Shift: </Text>
                          <Tag
                            color={getShiftTagColor(getShiftLabel(selectedCreatedOrderSummary))}
                            style={{ margin: 0, fontSize: 12, lineHeight: '18px', paddingInline: 8 }}
                          >
                            {selectedCreatedOrderSummary.shift?.name ||
                              selectedCreatedOrderSummary.shift?.code ||
                              currentShiftLabel ||
                              '-'}
                          </Tag>
                        </div>
                        <div>
                          <Text type="secondary">Time: </Text>
                          <Text strong>
                            {dayjs(selectedCreatedOrderSummary.registeredAt).format('YYYY-MM-DD HH:mm')}
                          </Text>
                        </div>
                      </div>
                      <Tag color="success" icon={<LockOutlined />} style={{ marginInlineEnd: 0, width: 'fit-content' }}>
                        Locked for delete - test list can still be edited
                      </Tag>
                    </Space>
                  </Card>
                  {/* Read-only list of tests in this order */}
                  <Card type="inner" title="Tests in this order" style={{ marginTop: 10 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      You can update tests for this order without changing order number or existing label sequence numbers.
                    </Text>
                    {selectedOrderDetailsLoading ? (
                      <Spin tip="Loading order details..." />
                    ) : selectedCreatedOrder ? (() => {
                      const orderTests = getRootOrderTests(selectedCreatedOrder);
                      if (orderTests.length === 0) {
                        return <Text type="secondary">No tests in this order.</Text>;
                      }
                      return (
                        <div
                          style={{
                            border: styles.border,
                            borderRadius: 8,
                            padding: 12,
                            backgroundColor: styles.bgSubtle,
                          }}
                        >
                          <Space wrap size={[8, 8]}>
                            {orderTests.map((ot) => (
                              <Tag key={ot.testId} style={{ margin: 0 }}>
                                {ot.testCode ?? '-'}
                              </Tag>
                            ))}
                          </Space>
                        </div>
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
                <Space direction="vertical" size={12} style={{ width: '100%' }} className="draft-order-content">
                <div style={{ padding: '8px 0', borderBottom: styles.border }}>
                  <Text type="secondary">Patient: </Text>
                  <Text strong style={{ fontSize: 16 }}>
                    {getPatientName(selectedPatient)}
                  </Text>
                </div>
                {nextOrderNumber && (
                  <div style={{ padding: '6px 0', borderBottom: styles.border }}>
                    <Text type="secondary">Order number (after creation): </Text>
                    <Text strong style={{ fontSize: 14 }}>
                      {nextOrderNumber}
                    </Text>
                  </div>
                )}

                <div>
                  <Row gutter={24} style={{ marginBottom: 4 }}>
                    {/* Left Pane: Search & Selected Tests */}
                    <Col xs={24} md={12}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>
                        Select tests
                      </Text>
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
                          scroll={{ y: 280 }}
                          showHeader={false}
                          columns={[
                            {
                              title: 'Test',
                              dataIndex: 'testCode',
                              key: 'testCode',
                              render: (text: string) => <Text strong>{text}</Text>,
                            },
                            {
                              title: 'Action',
                              key: 'action',
                              align: 'right',
                              width: 50,
                              render: (_, record) => (
                                <Button
                                  type="text"
                                  danger
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
                    </Col>

                    {/* Right Pane: Test Groups */}
                    <Col xs={24} md={12}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text strong>Quick Select Groups</Text>
                      </div>

                      {uiTestGroups.length === 0 ? (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="No test groups saved. Select tests and create one!"
                          style={{ padding: 24, marginTop: 24 }}
                        />
                      ) : (
                        <div
                          style={{
                            border: styles.border,
                            borderRadius: 8,
                            padding: 12,
                            backgroundColor: styles.bgSubtle,
                            minHeight: 120
                          }}
                        >
                          <Space wrap size={[8, 8]}>
                            {uiTestGroups.map((group) => (
                              <Button
                                key={group.id}
                                onClick={() => handleAddGroupTests(group.testIds)}
                              >
                                {group.name}
                              </Button>
                            ))}
                          </Space>
                        </div>
                      )}
                    </Col>
                  </Row>
                </div>

                <Button type="link" icon={<PlusOutlined />} onClick={openNewPatientInPatientsTab}>
                  New patient
                </Button>
                </Space>
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
        title="Edit tests in order"
        open={editTestsModalOpen}
        onCancel={() => {
          if (!savingEditedTests) {
            setEditTestsModalOpen(false);
          }
        }}
        onOk={handleSaveEditedTests}
        okText="Save tests"
        okButtonProps={{ loading: savingEditedTests }}
        cancelButtonProps={{ disabled: savingEditedTests }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text type="secondary">
            Add/remove pending tests only. Completed or entered tests stay locked. Order number and sample sequence numbers stay unchanged.
          </Text>
          <Select
            showSearch
            placeholder="Add test by code or name"
            value={null}
            onChange={handleAddEditingTest}
            optionFilterProp="label"
            options={testOptions.map((test) => ({
              value: test.id,
              label: (test as any).abbreviation ? `${test.code} - ${(test as any).abbreviation} - ${test.name} (${test.tubeType})` : `${test.code} - ${test.name} (${test.tubeType})`,
            }))}
          />
          {editingTests.length === 0 ? (
            <Text type="secondary">No tests selected.</Text>
          ) : (
            <div
              style={{
                border: styles.border,
                borderRadius: 8,
                padding: 12,
                maxHeight: 260,
                overflow: 'auto',
              }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {editingTests.map((test) => (
                  <div
                    key={test.testId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: styles.bgSubtle,
                      borderRadius: 6,
                    }}
                  >
                    <Space>
                      <Text strong>{test.testCode}</Text>
                      <Text>{test.testName}</Text>
                      <Text type="secondary">({test.tubeType})</Text>
                      {test.locked ? <Tag color="gold">Locked</Tag> : null}
                    </Space>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={test.locked}
                      onClick={() => handleRemoveEditingTest(test.testId)}
                    />
                  </div>
                ))}
              </Space>
            </div>
          )}
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
