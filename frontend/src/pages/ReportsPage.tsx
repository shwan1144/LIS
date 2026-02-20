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
  downloadTestResultsPDF,
  enterResult,
  logReportDelivery,
  searchOrders,
  updateOrderPayment,
  type OrderDto,
  type OrderStatus,
  type OrderTestDto,
  type TestParameterDefinition,
} from '../api/client';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type DeliveryChannel = 'WHATSAPP' | 'VIBER';

type EditResultContext = {
  orderTestId: string;
  patientName: string;
  testCode: string;
  testName: string;
  testUnit: string | null;
  normalMin: number | null;
  normalMax: number | null;
  normalText: string | null;
  parameterDefinitions: TestParameterDefinition[];
  wasVerified: boolean;
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

function formatOrderTestResultPreview(orderTest: OrderTestDto): string {
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

function getResultAvailability(order: OrderDto): { ready: boolean; completed: number; total: number } {
  const tests = (order.samples ?? []).flatMap((sample) => sample.orderTests ?? []);
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

function getOrderTestRows(order: OrderDto): ExpandedOrderTestRow[] {
  const rows: ExpandedOrderTestRow[] = [];

  for (const sample of order.samples ?? []) {
    const sampleLabel = sample.sampleId || sample.barcode || sample.id.substring(0, 8);
    for (const orderTest of sample.orderTests ?? []) {
      rows.push({
        key: orderTest.id,
        sampleLabel,
        testCode: orderTest.test?.code || '-',
        testName: orderTest.test?.name || '-',
        resultPreview: formatOrderTestResultPreview(orderTest),
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

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('COMPLETED');
  const [downloading, setDownloading] = useState<string | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState<OrderDto | null>(null);
  const [paymentModalPendingAction, setPaymentModalPendingAction] = useState<(() => void) | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  const [editResultModalOpen, setEditResultModalOpen] = useState(false);
  const [editResultContext, setEditResultContext] = useState<EditResultContext | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [editResultForm] = Form.useForm<{
    resultValue?: number | null;
    resultText?: string;
    resultParameters?: Record<string, string>;
  }>();
  const compactCellStyle = { paddingTop: 6, paddingBottom: 6, fontSize: 12 };

  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedOrderIds.includes(order.id)),
    [orders, selectedOrderIds],
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
      const result = await searchOrders({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        search: searchText.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        size: 1000,
      });
      setOrders(result?.items || []);
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
    if (!orders.some((order) => order.id === expandedId)) {
      setExpandedOrderIds([]);
    }
  }, [expandedOrderIds, orders]);

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
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');

      if (printWindow) {
        const revoke = () => window.URL.revokeObjectURL(url);
        printWindow.onload = () => {
          printWindow.print();
          setTimeout(revoke, 5000);
        };
        printWindow.onafterprint = revoke;
      } else {
        window.URL.revokeObjectURL(url);
      }
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
    const valueCandidate =
      orderTest.resultValue !== null && orderTest.resultValue !== undefined
        ? Number(orderTest.resultValue)
        : undefined;
    const parameterDefinitions = orderTest.test?.parameterDefinitions ?? [];
    const existingParams = orderTest.resultParameters ?? {};
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

    setEditResultContext({
      orderTestId: orderTest.id,
      patientName: order.patient?.fullName || '-',
      testCode: orderTest.test?.code || '-',
      testName: orderTest.test?.name || '-',
      testUnit: orderTest.test?.unit ?? null,
      normalMin: orderTest.test?.normalMin ?? null,
      normalMax: orderTest.test?.normalMax ?? null,
      normalText: orderTest.test?.normalText ?? null,
      parameterDefinitions,
      wasVerified: orderTest.status === 'VERIFIED',
    });

    editResultForm.setFieldsValue({
      resultValue: Number.isFinite(valueCandidate) ? valueCandidate : undefined,
      resultText: orderTest.resultText || undefined,
      resultParameters: { ...defaults, ...existingParams },
    });

    setEditResultModalOpen(true);
  };

  const handleEditResultSave = async () => {
    if (!editResultContext) return;

    const values = await editResultForm.validateFields();
    const resultValue = values.resultValue ?? null;
    const resultText = values.resultText?.trim() || null;
    const rawParams = values.resultParameters ?? {};
    const resultParameters = Object.fromEntries(
      Object.entries(rawParams).filter(([, value]) => {
        const v = value != null ? String(value).trim() : '';
        return v !== '' && v !== '__other__';
      }),
    );
    const hasResultParameters = Object.keys(resultParameters).length > 0;

    if (resultValue === null && !resultText && !hasResultParameters) {
      message.warning('Enter numeric result, text result, or parameter values.');
      return;
    }

    setSavingResult(true);
    try {
      await enterResult(editResultContext.orderTestId, {
        resultValue,
        resultText,
        resultParameters: hasResultParameters ? resultParameters : null,
        forceEditVerified: editResultContext.wasVerified,
      });

      message.success(
        editResultContext.wasVerified
          ? 'Verified result updated by admin'
          : 'Result updated',
      );

      setEditResultModalOpen(false);
      setEditResultContext(null);
      editResultForm.resetFields();
      await loadOrders();
    } catch (error) {
      console.error('Failed to update result', error);
      message.error('Failed to update result');
    } finally {
      setSavingResult(false);
    }
  };

  const renderExpandedOrder = (order: OrderDto) => {
    const rows = getOrderTestRows(order);

    if (rows.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tests found" />;
    }

    const columns = [
      {
        title: 'Sample',
        dataIndex: 'sampleLabel',
        key: 'sampleLabel',
        width: 110,
        render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Test',
        key: 'test',
        width: 240,
        render: (_: unknown, row: ExpandedOrderTestRow) => (
          <div style={{ lineHeight: '14px' }}>
            <Text strong style={{ display: 'block', fontSize: 12 }}>{row.testCode}</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{row.testName}</Text>
          </div>
        ),
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Result name',
        dataIndex: 'resultPreview',
        key: 'resultPreview',
        width: 200,
        render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Flag',
        key: 'flag',
        width: 110,
        render: (_: unknown, row: ExpandedOrderTestRow) => {
          const meta = row.flag ? RESULT_FLAG_META[row.flag] : null;
          if (!meta) return <Tag style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>-</Tag>;
          return <Tag color={meta.color} style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>{meta.label}</Tag>;
        },
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Status',
        key: 'status',
        width: 110,
        render: (_: unknown, row: ExpandedOrderTestRow) => (
          <Tag color={ORDER_TEST_STATUS_COLORS[row.status] || 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>
            {row.status.replace('_', ' ')}
          </Tag>
        ),
        onCell: () => ({ style: compactCellStyle }),
      },
      {
        title: 'Verified At',
        key: 'verifiedAt',
        width: 140,
        render: (_: unknown, row: ExpandedOrderTestRow) =>
          <Text style={{ fontSize: 12 }}>{row.verifiedAt ? dayjs(row.verifiedAt).format('YYYY-MM-DD HH:mm') : '-'}</Text>,
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
                    style={{ paddingInline: 4 }}
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
      <div className="reports-expanded-panel">
        <Table
          className="reports-subtests-table"
          size="small"
          columns={columns}
          dataSource={rows}
          rowKey="key"
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: 780 }}
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
      title: 'Reports',
      key: 'reports',
      render: (_: unknown, record: OrderDto) => {
        const availability = getResultAvailability(record);
        const testsCount =
          typeof record.testsCount === 'number'
            ? record.testsCount
            : (record.samples ?? []).reduce((sum, sample) => sum + (sample.orderTests?.length || 0), 0);

        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(180px, 240px) max-content minmax(130px, 170px) minmax(260px, 1fr)',
              alignItems: 'center',
              columnGap: 6,
            }}
          >
            <Space size={8} style={{ minWidth: 0 }}>
              <UserOutlined style={{ fontSize: 14, color: '#1677ff' }} />
              <div style={{ minWidth: 0 }}>
                <Text strong ellipsis style={{ display: 'block', fontSize: 12, lineHeight: '15px' }}>
                  {record.patient?.fullName?.trim() || '-'}
                </Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 10 }}>
                  {dayjs(record.registeredAt).format('YYYY-MM-DD HH:mm')}
                </Text>
              </div>
            </Space>

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

            <div style={{ minWidth: 0 }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                Order: {record.orderNumber || record.id.substring(0, 8)}
              </Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 10 }}>
                Phone: {record.patient?.phone || '-'}
              </Text>
            </div>

            <div style={{ minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
              {renderOrderActions(record)}
            </div>
          </div>
        );
      },
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
          const run = action();
          if (typeof run === 'function') run();
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
        .reports-orders-table .ant-table-thead > tr > th {
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
        title="Edit report result"
        open={editResultModalOpen}
        onCancel={() => {
          setEditResultModalOpen(false);
          setEditResultContext(null);
          editResultForm.resetFields();
        }}
        onOk={handleEditResultSave}
        okText="Save result"
        confirmLoading={savingResult}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {editResultContext && (
            <>
              <Text strong>{editResultContext.patientName}</Text>
              <Text type="secondary">
                {editResultContext.testCode} - {editResultContext.testName}
              </Text>
              {editResultContext.wasVerified ? (
                <Tag color="gold">Verified result correction (admin only)</Tag>
              ) : null}
              {(editResultContext.normalMin !== null ||
                editResultContext.normalMax !== null ||
                editResultContext.normalText) && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Normal range:{' '}
                  {editResultContext.normalText ||
                    `${editResultContext.normalMin ?? '-'} - ${editResultContext.normalMax ?? '-'} ${editResultContext.testUnit || ''}`}
                </Text>
              )}
            </>
          )}

          <Form form={editResultForm} layout="vertical">
            {(editResultContext?.parameterDefinitions.length ?? 0) === 0 ? (
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="resultValue"
                    label={`Numeric result${editResultContext?.testUnit ? ` (${editResultContext.testUnit})` : ''}`}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      placeholder="e.g. 7.2"
                      controls={false}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="resultText" label="Text result">
                    <Input.TextArea rows={3} placeholder="Optional text result" />
                  </Form.Item>
                </Col>
              </Row>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Text strong style={{ fontSize: 14 }}>Parameters</Text>
                <Row gutter={[16, 0]}>
                  {editResultContext?.parameterDefinitions.map((def) => (
                    <Form.Item
                      noStyle
                      key={def.code}
                      shouldUpdate={(prev, curr) => prev?.resultParameters?.[def.code] !== curr?.resultParameters?.[def.code]}
                    >
                      {() => {
                        const params = editResultForm.getFieldValue('resultParameters') ?? {};
                        const value = params[def.code];
                        const isAbnormal =
                          (def.normalOptions?.length ?? 0) > 0 &&
                          value != null &&
                          String(value).trim() !== '' &&
                          !def.normalOptions!.includes(String(value).trim());
                        const labelNode = isAbnormal ? (
                          <Space size={6}>
                            <span>{def.label}</span>
                            <Tag color="orange">Abnormal</Tag>
                          </Space>
                        ) : (
                          def.label
                        );

                        return (
                          <Col xs={24} md={12}>
                            <Form.Item
                              name={['resultParameters', def.code]}
                              label={labelNode}
                              style={{ marginBottom: 12 }}
                            >
                              {def.type === 'select' ? (
                                <Select
                                  allowClear
                                  placeholder={`Select ${def.label}`}
                                  options={(def.options ?? []).map((option) => ({
                                    label: option,
                                    value: option,
                                  }))}
                                  showSearch
                                  optionFilterProp="label"
                                />
                              ) : (
                                <Input placeholder={`Enter ${def.label}`} />
                              )}
                            </Form.Item>
                          </Col>
                        );
                      }}
                    </Form.Item>
                  ))}
                </Row>
              </Space>
            )}
          </Form>

          <Text type="secondary" style={{ fontSize: 12 }}>
            Use Edit to enter detailed values. Admin can also correct verified results from this tab.
          </Text>
        </Space>
      </Modal>

      <Title level={2}>Reports</Title>
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
              onChange={(value) => setStatusFilter(value as OrderStatus | 'ALL')}
              style={{ width: 180 }}
              options={[
                { value: 'COMPLETED', label: 'Completed (Default)' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'REGISTERED', label: 'Registered' },
                { value: 'COLLECTED', label: 'Collected' },
                { value: 'CANCELLED', label: 'Cancelled' },
                { value: 'ALL', label: 'All Statuses' },
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
          ) : orders.length === 0 ? (
            <Empty description="No orders found" />
          ) : (
            <Table
              className="reports-orders-table"
              columns={columns}
              dataSource={orders}
              rowKey="id"
              rowClassName={(record) => (expandedOrderIds.includes(record.id) ? 'reports-order-row-expanded' : '')}
              showHeader={false}
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
              scroll={{ x: 980 }}
              pagination={{ pageSize: 20 }}
            />
          )}
        </Space>
      </Card>
    </div>
  );
}
