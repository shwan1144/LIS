import { useState, useEffect, useMemo, useCallback } from 'react';
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
  searchOrders,
  getNextOrderNumber,
  getOrderPriceEstimate,
  getLabSettings,
  downloadOrderReceiptPDF,
  updateOrderPayment,
  updateOrderTests,
  type CreateOrderDto,
  type PatientDto,
  type TestDto,
  type OrderDto,
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
  createdOrder: OrderDto | null;
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

function getShiftLabel(order: OrderDto): string {
  return order.shift?.name?.trim() || order.shift?.code?.trim() || 'No shift';
}

function getShiftTagColor(shiftLabel: string): (typeof SHIFT_COLOR_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < shiftLabel.length; i += 1) {
    hash = (hash * 31 + shiftLabel.charCodeAt(i)) | 0;
  }
  return SHIFT_COLOR_PALETTE[Math.abs(hash) % SHIFT_COLOR_PALETTE.length];
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
      summaryCard: isDark
        ? { backgroundColor: 'rgba(82, 196, 26, 0.15)', borderColor: 'rgba(82, 196, 26, 0.4)' }
        : { backgroundColor: '#f6ffed', borderColor: '#b7eb8f' },
    }),
    [isDark]
  );
  const orderHistoryGridTemplate = 'minmax(220px, 1.8fr) 108px 88px 84px 120px';

  const [patientList, setPatientList] = useState<OrderListRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [worklistLoading, setWorklistLoading] = useState(true);
  const [patientLoading, setPatientLoading] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listQueryInput, setListQueryInput] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [draftPatient, setDraftPatient] = useState<PatientDto | null>(null);

  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [testOptions, setTestOptions] = useState<TestDto[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [testSearch, setTestSearch] = useState('');
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);

  const [subtotal, setSubtotal] = useState(0);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);

  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'receipt' | 'labels'>('receipt');
  const [printOrder, setPrintOrder] = useState<OrderDto | null>(null);
  const [printLabelSequenceBy, setPrintLabelSequenceBy] = useState<'tube_type' | 'department'>(
    lab?.labelSequenceBy ?? 'tube_type',
  );
  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null);
  const [nextOrderNumber, setNextOrderNumber] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [partialPaymentModalOpen, setPartialPaymentModalOpen] = useState(false);
  const [partialPaymentAmount, setPartialPaymentAmount] = useState<number>(0);
  const [editTestsModalOpen, setEditTestsModalOpen] = useState(false);
  const [editingTests, setEditingTests] = useState<SelectedTest[]>([]);
  const [savingEditedTests, setSavingEditedTests] = useState(false);

  const selectedRow = useMemo(
    () => patientList.find((r) => r.rowId === selectedRowId) ?? null,
    [patientList, selectedRowId]
  );
  const selectedPatient = selectedRow?.patient ?? null;
  const selectedCreatedOrder = selectedRow?.createdOrder ?? null;
  const isSelectedLocked = selectedRow != null && selectedRow.createdOrder != null;

  const loadOrderHistory = useCallback(
    async (options?: {
      focusOrderId?: string;
      pageOverride?: number;
      draftPatientOverride?: PatientDto | null;
    }) => {
      const effectivePage = options?.pageOverride ?? listPage;
      const effectiveDraft =
        options?.draftPatientOverride !== undefined
          ? options.draftPatientOverride
          : draftPatient;

      setWorklistLoading(true);
      try {
        const result = await searchOrders({
          page: effectivePage,
          size: ORDER_PAGE_SIZE,
          search: listQuery.trim() || undefined,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        });

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
          if (effectiveDraft) {
            return `draft-${effectiveDraft.id}`;
          }
          return rows[0]?.rowId ?? null;
        });
      } catch {
        message.error('Failed to load order history');
        if (effectiveDraft) {
          setPatientList([
            {
              rowId: `draft-${effectiveDraft.id}`,
              patient: effectiveDraft,
              createdOrder: null,
            },
          ]);
          setSelectedRowId(`draft-${effectiveDraft.id}`);
        } else {
          setPatientList([]);
          setSelectedRowId(null);
        }
        setListTotal(0);
      } finally {
        setWorklistLoading(false);
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

    let cancelled = false;
    setPatientLoading(true);
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
          setPatientLoading(false);
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
    async function load() {
      setLoadingTests(true);
      try {
        const [tests, deps] = await Promise.all([getTests(true), getDepartments()]);
        setTestOptions(tests);
        setDepartments(deps);
      } catch {
        message.error('Failed to load tests');
      } finally {
        setLoadingTests(false);
      }
    }
    load();
  }, []);

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
        if (!cancelled) setSubtotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoadingPrice(false);
      });
    return () => { cancelled = true; };
  }, [selectedTests, currentShiftId]);

  // When there are pending patients (or one is selected), fetch next order number for list and right panel.
  useEffect(() => {
    if (worklistLoading) return;
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
  }, [patientList, selectedPatient, isSelectedLocked, currentShiftId, worklistLoading]);

  const testsFilteredByDepartment = useMemo(() => {
    if (!selectedDepartmentId) return testOptions;
    return testOptions.filter((t) => t.departmentId === selectedDepartmentId);
  }, [testOptions, selectedDepartmentId]);

  const filteredTests = useMemo(() => {
    const base = testsFilteredByDepartment;
    if (!testSearch.trim()) return base;
    const search = testSearch.toLowerCase();
    return base.filter(
      (t) =>
        t.name.toLowerCase().includes(search) ||
        t.code.toLowerCase().includes(search)
    );
  }, [testsFilteredByDepartment, testSearch]);

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

  const applyUpdatedOrderToList = (updatedOrder: OrderDto) => {
    setPatientList((prev) =>
      prev.map((row) =>
        row.createdOrder?.id === updatedOrder.id ? { ...row, createdOrder: updatedOrder } : row
      )
    );
  };

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

      setDraftPatient(null);
      setSelectedTests([]);
      setDiscountPercent(0);
      setListPage(1);
      await loadOrderHistory({
        focusOrderId: createdOrder.id,
        pageOverride: 1,
        draftPatientOverride: null,
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
  };

  const openNewPatientInPatientsTab = () => {
    navigate('/patients', { state: { openNewPatient: true } });
  };

  const totalTests = selectedTests.length;
  const totalAfterDiscount = Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100;
  const totalPages = Math.max(1, Math.ceil(listTotal / ORDER_PAGE_SIZE));

  const handleApplyHistorySearch = () => {
    const nextQuery = listQueryInput.trim();
    if (listPage !== 1) {
      setListPage(1);
    }
    if (listQuery !== nextQuery) {
      setListQuery(nextQuery);
      return;
    }
    void loadOrderHistory({ pageOverride: 1 });
  };

  const handleRefreshHistory = () => {
    void loadOrderHistory();
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        Orders {listTotal > 0 && (
          <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 14 }}>({listTotal} total)</Text>
        )}
      </Title>

      {patientLoading || worklistLoading ? (
        <Card>
          <Spin tip={patientLoading ? 'Loading patient...' : 'Loading order history...'} />
        </Card>
      ) : (
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
                  >
                    New
                  </Button>
                  <Button size="small" icon={<ReloadOutlined />} onClick={handleRefreshHistory}>
                    Refresh
                  </Button>
                </Space>
              }
              bodyStyle={{ padding: 12 }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Input
                  placeholder="Search order #, patient, phone"
                  value={listQueryInput}
                  allowClear
                  prefix={<SearchOutlined />}
                  onChange={(e) => setListQueryInput(e.target.value)}
                  onPressEnter={handleApplyHistorySearch}
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
                  />
                  <Button type="primary" onClick={handleApplyHistorySearch}>
                    Apply
                  </Button>
                </Space>
              </Space>

              {patientList.length > 0 ? (
                <div
                  style={{
                    marginTop: 10,
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
                        columnGap: 6,
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
              ) : null}

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
                              columnGap: 6,
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
                                style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}
                              >
                                {row.createdOrder?.status ?? 'REGISTERED'}
                              </Tag>
                            ) : (
                              <Tag
                                color="gold"
                                icon={<PlusOutlined />}
                                style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}
                              >
                                New
                              </Tag>
                            )}

                            <Text type="secondary" style={{ fontSize: 10, lineHeight: '14px' }}>
                              {isLocked && row.createdOrder
                                ? (row.createdOrder.orderNumber || row.createdOrder.id.substring(0, 8))
                                : (nextOrderNumber ?? '-')}
                            </Text>

                            {isLocked ? (
                              <Tag
                                color={shiftTagColor ?? 'default'}
                                style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}
                              >
                                {shiftLabel}
                              </Tag>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 10, lineHeight: '14px' }}>
                                -
                              </Text>
                            )}

                            <Text type="secondary" style={{ fontSize: 10, lineHeight: '14px' }}>
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
              {patientList.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No orders found"
                  style={{ padding: 24 }}
                />
              ) : null}
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
            </Card>
          </Col>

          {/* Right: Test selection or order success */}
          <Col xs={24} md={12} lg={14}>
            <Card bodyStyle={{ minHeight: 'calc(100vh - 200px)' }}>
              {!selectedPatient ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Select an order from history, or go to Patients to create a new order"
                  style={{ padding: 60 }}
                />
              ) : isSelectedLocked && selectedCreatedOrder ? (
                <div>
                  <Result
                    status="success"
                    icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    title="Order details"
                    subTitle={
                      <Space direction="vertical" size={8} style={{ marginTop: 16, textAlign: 'left' }}>
                        <div>
                          <Text type="secondary">Patient: </Text>
                          <Text strong style={{ fontSize: 16 }}>
                            {getPatientName(selectedCreatedOrder.patient ?? selectedPatient)}
                          </Text>
                        </div>
                        <div>
                          <Text type="secondary">Order ID: </Text>
                          <Text strong>{selectedCreatedOrder.orderNumber || selectedCreatedOrder.id}</Text>
                        </div>
                        <div>
                          <Text type="secondary">Shift: </Text>
                          <Tag
                            color={getShiftTagColor(getShiftLabel(selectedCreatedOrder))}
                            style={{ margin: 0, fontSize: 12, lineHeight: '18px', paddingInline: 8 }}
                          >
                            {selectedCreatedOrder.shift?.name ||
                              selectedCreatedOrder.shift?.code ||
                              currentShiftLabel ||
                              '-'}
                          </Tag>
                        </div>
                        <div>
                          <Text type="secondary">Time: </Text>
                          <Text strong>
                            {dayjs(selectedCreatedOrder.registeredAt).format('YYYY-MM-DD HH:mm')}
                          </Text>
                        </div>
                        <div>
                          <Tag color="success" icon={<LockOutlined />}>
                            Locked for delete - test list can still be edited
                          </Tag>
                        </div>
                      </Space>
                    }
                  />
                  {/* Read-only list of tests in this order */}
                  <Card type="inner" title="Tests in this order" style={{ marginTop: 16 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      You can update tests for this order without changing order number or existing label sequence numbers.
                    </Text>
                    {(() => {
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
                                {ot.testCode ?? ot.testName ?? '-'}
                                {ot.testName && ot.testCode ? ` - ${ot.testName}` : ''}
                              </Tag>
                            ))}
                          </Space>
                        </div>
                      );
                    })()}
                  </Card>
                  <div style={{ marginTop: 16 }}>
                    <Space wrap>
                      <Button
                        icon={<PlusOutlined />}
                        onClick={openEditTestsModal}
                        size="large"
                      >
                        Edit tests
                      </Button>
                      <Button
                        type="primary"
                        icon={<PrinterOutlined />}
                        onClick={() => openPrint(selectedCreatedOrder, 'receipt')}
                        size="large"
                      >
                        Receipt
                      </Button>
                      <Button
                        icon={<PrinterOutlined />}
                        onClick={() => openPrint(selectedCreatedOrder, 'labels')}
                        size="large"
                      >
                        Labels
                      </Button>
                      <Button
                        icon={<PrinterOutlined />}
                        loading={downloadingPDF === 'receipt'}
                        onClick={async () => {
                          setDownloadingPDF('receipt');
                          try {
                            const blob = await downloadOrderReceiptPDF(selectedCreatedOrder.id);
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `receipt-${selectedCreatedOrder.orderNumber || selectedCreatedOrder.id.substring(0, 8)}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                            message.success('Receipt downloaded');
                          } catch {
                            message.error('Failed to download receipt');
                          } finally {
                            setDownloadingPDF(null);
                          }
                        }}
                        size="large"
                      >
                        Download Receipt PDF
                      </Button>
                      {selectedCreatedOrder.paymentStatus !== 'paid' && (
                        <Space wrap>
                          <Button
                            type="primary"
                            loading={updatingPayment}
                            onClick={async () => {
                              if (!selectedCreatedOrder?.id) return;
                              setUpdatingPayment(true);
                              try {
                                const updated = await updateOrderPayment(selectedCreatedOrder.id, {
                                  paymentStatus: 'paid',
                                });
                                message.success('Marked as paid');
                                applyUpdatedOrderToList(updated);
                              } catch {
                                message.error('Failed to update payment');
                              } finally {
                                setUpdatingPayment(false);
                              }
                            }}
                            size="large"
                          >
                            Mark as paid
                          </Button>
                          <Button
                            loading={updatingPayment}
                            onClick={() => {
                              setPartialPaymentAmount(
                                selectedCreatedOrder?.paidAmount != null
                                  ? Number(selectedCreatedOrder.paidAmount)
                                  : 0
                              );
                              setPartialPaymentModalOpen(true);
                            }}
                            size="large"
                          >
                            Partially paid
                          </Button>
                        </Space>
                      )}
                      {selectedCreatedOrder.paymentStatus === 'paid' && (
                        <Tag color="green">Paid</Tag>
                      )}
                      {selectedCreatedOrder.paymentStatus === 'partial' && (
                        <Tag color="orange">
                          Partially paid
                          {selectedCreatedOrder.paidAmount != null &&
                            ` (${selectedCreatedOrder.paidAmount} / ${selectedCreatedOrder.finalAmount})`}
                        </Tag>
                      )}
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => addNewOrderForPatient(selectedCreatedOrder.patient ?? selectedPatient!)}
                        size="large"
                      >
                        New order for this patient
                      </Button>
                    </Space>
                  </div>
                </div>
              ) : (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div style={{ padding: '12px 0', borderBottom: styles.border }}>
                    <Text type="secondary">Patient: </Text>
                    <Text strong style={{ fontSize: 18 }}>
                      {getPatientName(selectedPatient)}
                    </Text>
                  </div>
                  {nextOrderNumber && (
                    <div style={{ padding: '8px 0', borderBottom: styles.border }}>
                      <Text type="secondary">Order number (after creation): </Text>
                      <Text strong style={{ fontSize: 16 }}>
                        {nextOrderNumber}
                      </Text>
                    </div>
                  )}

                  <div>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      Select tests
                    </Text>
                    <Row gutter={8} style={{ marginBottom: 12 }}>
                      <Col flex="none">
                        <Select
                          placeholder="All departments"
                          allowClear
                          style={{ minWidth: 180 }}
                          value={selectedDepartmentId || undefined}
                          onChange={(v) => setSelectedDepartmentId(v || null)}
                          options={departments.map((d) => ({
                            value: d.id,
                            label: d.name || d.code,
                          }))}
                        />
                      </Col>
                      <Col flex="auto">
                        <Select
                          showSearch
                          placeholder="Search tests by name or code..."
                          style={{ width: '100%' }}
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
                                <Text>{t.name}</Text>
                                <Text type="secondary">({t.tubeType})</Text>
                              </Space>
                            ),
                          }))}
                        />
                      </Col>
                    </Row>
                  </div>

                  {selectedTests.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No tests selected. Use the department dropdown or search above to add tests."
                      style={{ padding: 24 }}
                    />
                  ) : (
                    <div
                      style={{
                        border: styles.borderDark,
                        borderRadius: 8,
                        padding: 12,
                        maxHeight: 280,
                        overflow: 'auto',
                      }}
                    >
                      <Space direction="vertical" style={{ width: '100%' }} size={8}>
                        {selectedTests.map((test) => (
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
                            </Space>
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemoveTest(test.testId)}
                            />
                          </div>
                        ))}
                      </Space>
                    </div>
                  )}

                  <Card
                    style={styles.summaryCard}
                  >
                    <Row gutter={16} align="middle" justify="space-between" wrap>
                      <Col>
                        <Space size="large">
                          <Text strong>Total tests: {totalTests}</Text>
                          {selectedTests.length > 0 && (
                            <>
                              <Text type="secondary">
                                Subtotal: {loadingPrice ? '...' : `$${subtotal.toFixed(2)}`}
                              </Text>
                              <Space.Compact>
                                <Text type="secondary">Discount:</Text>
                                <InputNumber
                                  min={0}
                                  max={100}
                                  value={discountPercent}
                                  onChange={(v) => setDiscountPercent(Number(v) || 0)}
                                  style={{ width: 64, marginLeft: 8 }}
                                />
                                <span style={{ padding: '0 4px', lineHeight: '32px' }}>%</span>
                              </Space.Compact>
                              <Text strong style={{ fontSize: 16 }}>
                                Total: {loadingPrice ? '...' : `$${totalAfterDiscount.toFixed(2)}`}
                              </Text>
                            </>
                          )}
                        </Space>
                      </Col>
                      <Col>
                        <Button
                          type="primary"
                          size="large"
                          icon={<ShoppingCartOutlined />}
                          onClick={handleSubmit}
                          loading={submitting}
                          disabled={selectedTests.length === 0}
                        >
                          Create order
                        </Button>
                      </Col>
                    </Row>
                  </Card>

                  <Button type="link" icon={<PlusOutlined />} onClick={openNewPatientInPatientsTab}>
                    New patient
                  </Button>
                </Space>
              )}
            </Card>
          </Col>
        </Row>
      )}

      <Modal
        title="Partially paid"
        open={partialPaymentModalOpen}
        onCancel={() => setPartialPaymentModalOpen(false)}
        onOk={async () => {
          if (!selectedCreatedOrder?.id) return;
          const final = Number(selectedCreatedOrder.finalAmount ?? 0);
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
            const updated = await updateOrderPayment(selectedCreatedOrder.id, {
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
          {selectedCreatedOrder && (
            <>
              <div>
                <Text strong>Amount paid (IQD)</Text>
                <div style={{ marginTop: 8 }}>
                  <InputNumber
                    min={0}
                    max={Number(selectedCreatedOrder.finalAmount ?? 0)}
                    value={partialPaymentAmount}
                    onChange={(v) => setPartialPaymentAmount(Number(v) ?? 0)}
                    style={{ width: '100%', maxWidth: 240 }}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
                  />
                </div>
              </div>
              <Text type="secondary">
                Total due: {Number(selectedCreatedOrder.finalAmount ?? 0).toLocaleString()} IQD
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
              label: `${test.code} - ${test.name} (${test.tubeType})`,
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
