import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card,
  Button,
  Space,
  message,
  Select,
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
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  createOrder,
  getTests,
  getPatient,
  getOrder,
  getDepartments,
  getOrdersWorklist,
  saveOrdersWorklist,
  getNextOrderNumber,
  getOrderPriceEstimate,
  downloadOrderReceiptPDF,
  downloadTestResultsPDF,
  updateOrderPayment,
  type CreateOrderDto,
  type PatientDto,
  type TestDto,
  type OrderDto,
  type DepartmentDto,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useOrdersWorklist, type PatientRow } from '../contexts/OrdersWorklistContext';
import { PrintPreviewModal } from '../components/Print';

const { Title, Text } = Typography;

interface SelectedTest {
  testId: string;
  testCode: string;
  testName: string;
  tubeType: string;
}

function generateRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getPatientName(p: PatientDto) {
  return p.fullName?.trim() || '';
}

export function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const { lab, currentShiftId, currentShiftLabel } = useAuth();
  const worklistContext = useOrdersWorklist();
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

  const [patientList, setPatientList] = useState<PatientRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [worklistLoading, setWorklistLoading] = useState(true);
  const [patientLoading, setPatientLoading] = useState(false);

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
  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null);
  const [savingBeforeNavigate, setSavingBeforeNavigate] = useState(false);
  const [nextOrderNumber, setNextOrderNumber] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [partialPaymentModalOpen, setPartialPaymentModalOpen] = useState(false);
  const [partialPaymentAmount, setPartialPaymentAmount] = useState<number>(0);

  const selectedRow = useMemo(
    () => patientList.find((r) => r.rowId === selectedRowId) ?? null,
    [patientList, selectedRowId]
  );
  const selectedPatient = selectedRow?.patient ?? null;
  const selectedCreatedOrder = selectedRow?.createdOrder ?? null;
  const isSelectedLocked = selectedRow != null && selectedRow.createdOrder != null;

  // Day key so worklist reloads when calendar day changes (count restarts, list can be empty).
  const [dayKey, setDayKey] = useState(() => dayjs().format('YYYY-MM-DD'));
  useEffect(() => {
    const interval = setInterval(() => {
      const next = dayjs().format('YYYY-MM-DD');
      setDayKey((prev) => (next !== prev ? next : prev));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Single effect: load worklist for current shift/day and merge "Go to order" patient if present.
  // Reload when shift or day changes so order box count restarts from 1 and list is fresh/empty.
  const pendingPatientIdRef = useRef<string | null>(null);
  useEffect(() => {
    const patientIdFromState = (location.state as { patientId?: string })?.patientId ?? null;
    if (patientIdFromState) pendingPatientIdRef.current = patientIdFromState;

    // Empty the list when shift or day changes so order box count restarts and UI is fresh.
    setPatientList([]);
    setSelectedRowId(null);
    setWorklistLoading(true);
    let cancelled = false;

    getOrdersWorklist(currentShiftId)
      .then((items) => {
        if (cancelled) return;
        const serverList: PatientRow[] = items.map((item) => ({
          rowId: item.rowId,
          patient: item.patient,
          createdOrder: item.createdOrder,
        }));

        const toAdd = pendingPatientIdRef.current;
        pendingPatientIdRef.current = null;
        if (toAdd) {
          window.history.replaceState({}, document.title, location.pathname);
          const contextList = worklistContext?.getList(currentShiftId) ?? [];
          const list = contextList.length > 0 ? contextList : serverList;
          return getPatient(toAdd)
            .then((p) => {
              if (cancelled) return { list, selectId: list[0]?.rowId ?? null };
              const existingPending = list.find((r) => r.patient.id === p.id && r.createdOrder === null);
              if (existingPending) {
                return { list, selectId: existingPending.rowId };
              }
              const newRow: PatientRow = {
                rowId: generateRowId(),
                patient: p,
                createdOrder: null,
              };
              return { list: [newRow, ...list], selectId: newRow.rowId };
            })
            .catch(() => {
              if (!cancelled) message.error('Patient not found');
              return { list, selectId: list.length > 0 ? list[0].rowId : null };
            });
        }
        return Promise.resolve({ list: serverList, selectId: serverList.length > 0 ? serverList[0].rowId : null });
      })
      .then((result) => {
        if (cancelled || !result) return;
        const { list, selectId } = result;
        setPatientList(list);
        worklistContext?.setList(currentShiftId, list);
        setSelectedRowId(selectId);
        setSelectedTests([]);
        setDiscountPercent(0);
        // Persist list so other browsers/devices see it (including pending patients from "Go to order").
        const items = list.map((r) => ({
          rowId: r.rowId,
          patientId: r.patient.id,
          orderId: r.createdOrder?.id,
        }));
        saveOrdersWorklist(currentShiftId, items).catch(() => message.error('Failed to save order list'));
      })
      .catch((err) => {
        if (!cancelled) message.error(err?.message?.includes('Patient') ? 'Patient not found' : 'Failed to load order list');
      })
      .finally(() => {
        if (!cancelled) setWorklistLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentShiftId, dayKey]);

  // Keep context in sync so when we navigate away and back we still have the list (multiple pending)
  useEffect(() => {
    worklistContext?.setList(currentShiftId, patientList);
  }, [patientList, currentShiftId]);

  // Save worklist to server when it changes (scoped to current shift)
  const hasLoadedWorklist = useRef(false);
  useEffect(() => {
    if (!hasLoadedWorklist.current) return;
    const items = patientList.map((r) => ({
      rowId: r.rowId,
      patientId: r.patient.id,
      orderId: r.createdOrder?.id,
    }));
    saveOrdersWorklist(currentShiftId, items).catch(() => message.error('Failed to save order list'));
  }, [patientList, currentShiftId]);

  useEffect(() => {
    if (!worklistLoading) hasLoadedWorklist.current = true;
  }, [worklistLoading]);

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

      const newOrder = await createOrder(orderData);
      const fullOrder = await getOrder(newOrder.id);

      setPatientList((prev) =>
        prev.map((r) =>
          r.rowId === selectedRow?.rowId ? { ...r, createdOrder: fullOrder } : r
        )
      );
      setSelectedTests([]);
      setDiscountPercent(0);
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
    if (row?.createdOrder) {
      message.warning('Cannot remove a patient with a completed order');
      return;
    }
    const remaining = patientList.filter((r) => r.rowId !== rowId);
    setPatientList(remaining);
    if (selectedRowId === rowId) {
      setSelectedRowId(remaining[0]?.rowId ?? null);
      setSelectedTests([]);
    }
  };

  const addNewOrderForPatient = (patient: PatientDto) => {
    const newRow: PatientRow = {
      rowId: generateRowId(),
      patient,
      createdOrder: null,
    };
    setPatientList((prev) => [newRow, ...prev]);
    setSelectedRowId(newRow.rowId);
    setSelectedTests([]);
    setDiscountPercent(0);
  };

  const openPrint = (order: OrderDto, type: 'receipt' | 'labels') => {
    setPrintType(type);
    setPrintOrder(order);
    setPrintModalOpen(true);
  };

  const goToPatients = () => {
    const items = patientList.map((r) => ({
      rowId: r.rowId,
      patientId: r.patient.id,
      orderId: r.createdOrder?.id,
    }));
    setSavingBeforeNavigate(true);
    saveOrdersWorklist(currentShiftId, items)
      .then(() => navigate('/patients'))
      .catch(() => {
        message.error('Failed to save list');
      })
      .finally(() => setSavingBeforeNavigate(false));
  };

  const totalTests = selectedTests.length;
  const totalAfterDiscount = Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        Orders {patientList.length > 0 && (
          <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 14 }}>({patientList.length} total)</Text>
        )}
      </Title>

      {patientLoading || worklistLoading ? (
        <Card>
          <Spin tip={worklistLoading ? 'Loading order list...' : 'Loading patient...'} />
        </Card>
      ) : patientList.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                Go to <strong>Patients</strong> and click <strong>Go to order</strong> on a patient to add them here.
              </span>
            }
            style={{ padding: 48 }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={goToPatients} loading={savingBeforeNavigate}>
              Go to Patients
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={16}>
          {/* Left: Patient list */}
          <Col xs={24} md={10} lg={8}>
            <Card
              style={{ minWidth: 260 }}
              title="Patients"
              extra={
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={goToPatients}
                  loading={savingBeforeNavigate}
                >
                  Add
                </Button>
              }
              bodyStyle={{ padding: 0 }}
            >
              <List
                dataSource={patientList}
                renderItem={(row, index) => {
                  const isLocked = row.createdOrder != null;
                  const isSelected = selectedRowId === row.rowId;
                  const name = getPatientName(row.patient);
                  return (
                    <List.Item
                      key={row.rowId}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(22, 119, 255, 0.08)' : undefined,
                        borderLeft: isSelected ? '3px solid #1677ff' : undefined,
                      }}
                      onClick={() => setSelectedRowId(row.rowId)}
                      actions={
                        !isLocked
                          ? [
                              <Button
                                type="text"
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePatientFromList(row.rowId);
                                }}
                              />,
                            ]
                          : undefined
                      }
                    >
                      <List.Item.Meta
                        avatar={<UserOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                        title={
                          <Space>
                            <Text strong={isSelected}>{name || '—'}</Text>
                            {isLocked && (
                              <Tag color="success" icon={<LockOutlined />}>
                                Ordered
                              </Tag>
                            )}
                          </Space>
                        }
                        description={
                          isLocked && row.createdOrder ? (
                            <Space direction="vertical" size={0}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {row.createdOrder.orderNumber || row.createdOrder.id.substring(0, 8)}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {row.createdOrder.shift?.name || row.createdOrder.shift?.code || '—'} ·{' '}
                                {dayjs(row.createdOrder.registeredAt).format('HH:mm')}
                              </Text>
                            </Space>
                          ) : !isLocked ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Order # (pending): {nextOrderNumber ?? '…'}
                            </Text>
                          ) : null
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            </Card>
          </Col>

          {/* Right: Test selection or order success */}
          <Col xs={24} md={14} lg={16}>
            <Card bodyStyle={{ minHeight: 'calc(100vh - 200px)' }}>
              {!selectedPatient ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Select a patient from the list to create an order"
                  style={{ padding: 60 }}
                />
              ) : isSelectedLocked && selectedCreatedOrder ? (
                <div>
                  <Result
                    status="success"
                    icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    title="Order created"
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
                          <Text strong>
                            {selectedCreatedOrder.shift?.name ||
                              selectedCreatedOrder.shift?.code ||
                              currentShiftLabel ||
                              '—'}
                          </Text>
                        </div>
                        <div>
                          <Text type="secondary">Time: </Text>
                          <Text strong>
                            {dayjs(selectedCreatedOrder.registeredAt).format('YYYY-MM-DD HH:mm')}
                          </Text>
                        </div>
                        <div>
                          <Tag color="success" icon={<LockOutlined />}>
                            Locked — cannot be edited or deleted
                          </Tag>
                        </div>
                      </Space>
                    }
                  />
                  {/* Read-only list of tests in this order */}
                  <Card type="inner" title="Tests in this order" style={{ marginTop: 16 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      You cannot add, remove, or edit tests. Reprint receipt or labels below.
                    </Text>
                    {(() => {
                      const orderTests = (selectedCreatedOrder.samples ?? []).flatMap(
                        (s) => s.orderTests ?? []
                      );
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
                              <Tag key={ot.id} style={{ margin: 0 }}>
                                {ot.test?.code ?? ot.test?.name ?? '—'}
                                {ot.test?.name && ot.test?.code ? ` · ${ot.test.name}` : ''}
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
                        type="primary"
                        icon={<PrinterOutlined />}
                        onClick={() => openPrint(selectedCreatedOrder, 'receipt')}
                        size="large"
                      >
                        Reprint Receipt
                      </Button>
                      <Button
                        icon={<PrinterOutlined />}
                        onClick={() => openPrint(selectedCreatedOrder, 'labels')}
                        size="large"
                      >
                        Reprint Labels
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
                              if (!selectedCreatedOrder?.id || !worklistContext) return;
                              setUpdatingPayment(true);
                              try {
                                const updated = await updateOrderPayment(selectedCreatedOrder.id, {
                                  paymentStatus: 'paid',
                                });
                                message.success('Marked as paid');
                                const list = worklistContext.getList(currentShiftId ?? null);
                                const newList = list.map((r) =>
                                  r.createdOrder?.id === selectedCreatedOrder.id
                                    ? { ...r, createdOrder: updated }
                                    : r
                                );
                                worklistContext.setList(currentShiftId ?? null, newList);
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

                  <Button type="link" onClick={goToPatients} loading={savingBeforeNavigate}>
                    ← Back to Patients
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
          if (!selectedCreatedOrder?.id || !worklistContext) return;
          const final = Number(selectedCreatedOrder.finalAmount ?? 0);
          const amount = Number(partialPaymentAmount) || 0;
          if (amount <= 0) {
            message.warning('Enter amount paid (greater than 0)');
            return;
          }
          if (amount >= final) {
            message.info('Amount is full — use "Mark as paid" instead.');
            return;
          }
          setUpdatingPayment(true);
          try {
            const updated = await updateOrderPayment(selectedCreatedOrder.id, {
              paymentStatus: 'partial',
              paidAmount: Math.round(amount * 100) / 100,
            });
            message.success('Marked as partially paid');
            const list = worklistContext.getList(currentShiftId ?? null);
            const newList = list.map((r) =>
              r.createdOrder?.id === selectedCreatedOrder.id ? { ...r, createdOrder: updated } : r
            );
            worklistContext.setList(currentShiftId ?? null, newList);
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

      <PrintPreviewModal
        open={printModalOpen}
        onClose={() => {
          setPrintModalOpen(false);
          setPrintOrder(null);
        }}
        order={printOrder}
        type={printType}
        labName={lab?.name}
      />
    </div>
  );
}
