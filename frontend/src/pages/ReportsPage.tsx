import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Button,
  Space,
  message,
  Typography,
  DatePicker,
  Table,
  Tag,
  Spin,
  Empty,
  Tooltip,
  Input,
  Select,
  Dropdown,
  Grid,
  Modal,
  Progress,
  Collapse,
} from 'antd';
import {
  FilePdfOutlined,
  SearchOutlined,
  WhatsAppOutlined,
  MessageOutlined,
  PrinterOutlined,
  MoreOutlined,
  DownloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  searchOrders,
  downloadTestResultsPDF,
  logReportDelivery,
  updateOrderPayment,
  type OrderDto,
  type OrderStatus,
  type OrderTestDto,
} from '../api/client';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;
type DeliveryChannel = 'WHATSAPP' | 'VIBER';

/** Keep digits only (for wa.me and mobile deep links) */
function cleanPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Build a message for sharing order results */
function buildResultsMessage(order: OrderDto): string {
  const patientName = order.patient?.fullName?.trim() || 'Patient';
  const orderNum = order.orderNumber || order.id.substring(0, 8);
  const date = dayjs(order.registeredAt).format('YYYY-MM-DD');

  return `Hello ${patientName},\n\nYour lab results for Order #${orderNum} (${date}) are ready.\n\nPlease visit our laboratory to collect your report or contact us for more information.\n\nThank you!`;
}

export function ReportsPage() {
  const screens = useBreakpoint();
  const isCompactActions = !screens.lg;
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
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

  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedOrderIds.includes(o.id)),
    [orders, selectedOrderIds],
  );

  const canReleaseResults = (order: OrderDto): boolean => {
    const availability = getResultsAvailability(order);
    return availability.ready && order.paymentStatus === 'paid';
  };

  const getResultsAvailability = (order: OrderDto): { ready: boolean; completed: number; total: number } => {
    const tests = (order.samples ?? []).flatMap((s) => s.orderTests ?? []);
    if (tests.length === 0) {
      return { ready: false, completed: 0, total: 0 };
    }
    const verified = tests.filter((t) => t.status === 'VERIFIED').length;
    const total = tests.length;
    // Only ready when all tests are verified
    const ready = verified === total && total > 0;
    return { ready, completed: verified, total };
  };

  /** Calculate test progress: elapsed time vs expected completion time */
  const getTestProgress = (order: OrderDto, orderTest: OrderTestDto) => {
    const registeredAt = dayjs(order.registeredAt);
    const now = dayjs();
    const elapsedMinutes = now.diff(registeredAt, 'minute');
    const expectedMinutes = orderTest.test?.expectedCompletionMinutes;
    
    if (!expectedMinutes || expectedMinutes <= 0) {
      return { progress: null, remaining: null, isOverdue: false };
    }
    
    const progress = Math.min(100, Math.max(0, (elapsedMinutes / expectedMinutes) * 100));
    const remainingMinutes = expectedMinutes - elapsedMinutes;
    const isOverdue = remainingMinutes < 0;
    
    return {
      progress: progress,
      remaining: Math.abs(remainingMinutes),
      isOverdue,
      elapsed: elapsedMinutes,
      expected: expectedMinutes,
    };
  };

  /** Render expandable content showing test progress */
  const renderTestProgress = (order: OrderDto) => {
    const tests = (order.samples ?? []).flatMap((s) => s.orderTests ?? []);
    if (tests.length === 0) {
      return <Typography.Text type="secondary">No tests found</Typography.Text>;
    }

    return (
      <div style={{ padding: '8px 0' }}>
        {tests.map((test) => {
          const isCompleted = test.status === 'COMPLETED' || test.status === 'VERIFIED';
          const progress = getTestProgress(order, test);
          const testName = test.test?.name || test.test?.code || 'Unknown test';
          
          return (
            <div key={test.id} style={{ marginBottom: 12, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Typography.Text strong style={{ minWidth: 80 }}>{testName}</Typography.Text>
                {!isCompleted && progress.progress !== null ? (
                  <>
                    <div style={{ flex: 1, maxWidth: 300 }}>
                      <Progress
                        percent={Math.round(progress.progress)}
                        status={progress.isOverdue ? 'exception' : 'active'}
                        strokeColor={progress.isOverdue ? '#ff4d4f' : '#52c41a'}
                        showInfo={false}
                        style={{ margin: 0 }}
                      />
                    </div>
                    <Typography.Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {progress.isOverdue
                        ? `Overdue by ${Math.round(progress.remaining)} min`
                        : `${Math.round(progress.remaining)} min remaining`}
                    </Typography.Text>
                  </>
                ) : isCompleted ? (
                  <>
                    <div style={{ flex: 1, maxWidth: 300 }}>
                      <Progress percent={100} strokeColor="#52c41a" showInfo={false} style={{ margin: 0 }} />
                    </div>
                    <Typography.Text type="success" style={{ fontSize: 13 }}>
                      ✓ Completed
                    </Typography.Text>
                  </>
                ) : progress.progress === null ? (
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    Expected completion time not set for this test
                  </Typography.Text>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
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
    } catch (err) {
      console.error('Failed to load orders:', err);
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

  const triggerPdfDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
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
    } catch (err: unknown) {
      const is403 = err && typeof err === 'object' && 'response' in err && (err as { response?: { status?: number } }).response?.status === 403;
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
    } catch (err: unknown) {
      const is403 = err && typeof err === 'object' && 'response' in err && (err as { response?: { status?: number } }).response?.status === 403;
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
    } catch (err) {
      console.error('Failed to log report delivery', err);
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
    const msg = buildResultsMessage(order);
    await logDelivery(order, 'WHATSAPP');
    const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(msg)}`;
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
    const msg = buildResultsMessage(order);
    await logDelivery(order, 'VIBER');
    const url = `viber://chat?number=${encodeURIComponent(cleanedPhone)}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleBulkDownload = async () => {
    if (selectedOrders.length === 0) {
      message.info('Select at least one order');
      return;
    }
    const paidOrders = selectedOrders.filter((o) => o.paymentStatus === 'paid');
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
        success++;
      } catch {
        failed++;
      }
    }
    setDownloading(null);
    message.success(
      `Downloaded ${success} report(s)${failed ? `, failed ${failed}` : ''}${unpaidCount ? ` (${unpaidCount} unpaid skipped)` : ''}`
    );
  };

  const handleBulkSend = async (channel: DeliveryChannel) => {
    if (selectedOrders.length === 0) {
      message.info('Select at least one order');
      return;
    }
    const paidWithPhone = selectedOrders.filter(
      (o) => o.paymentStatus === 'paid' && !!o.patient?.phone
    );
    const unpaidCount = selectedOrders.filter((o) => o.paymentStatus !== 'paid').length;
    if (paidWithPhone.length === 0) {
      message.warning(
        unpaidCount
          ? 'Selected orders are unpaid or have no phone. Mark as paid to send.'
          : 'Selected orders have no phone number.'
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
      sent++;
    }
    setDownloading(null);
    message.success(
      `Prepared ${sent} ${channel} message(s)${unpaidCount ? ` (${unpaidCount} unpaid skipped)` : ''}`
    );
  };

  const columns = [
    {
      title: 'Patient',
      key: 'patient',
      render: (_: unknown, record: OrderDto) =>
        record.patient?.fullName?.trim() || '-',
    },
    {
      title: 'Order #',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      render: (text: string, record: OrderDto) => text || record.id.substring(0, 8),
    },
    {
      title: 'Date',
      dataIndex: 'registeredAt',
      key: 'registeredAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colors: Record<string, string> = {
          REGISTERED: 'blue',
          COLLECTED: 'cyan',
          IN_PROGRESS: 'orange',
          COMPLETED: 'green',
          VERIFIED: 'green',
          CANCELLED: 'red',
        };
        return <Tag color={colors[status] || 'default'}>{status.replace('_', ' ')}</Tag>;
      },
    },
    {
      title: 'Tests',
      key: 'tests',
      render: (_: unknown, record: OrderDto) => {
        if (typeof record.testsCount === 'number') return record.testsCount;
        if (!record.samples || !Array.isArray(record.samples)) return '-';
        const count = record.samples.reduce(
          (sum, s) => sum + (s.orderTests?.length || 0),
          0,
        );
        return count;
      },
    },
    {
      title: 'Report Ready',
      key: 'reportReady',
      render: (_: unknown, record: OrderDto) => {
        const availability = getResultsAvailability(record);
        if (!availability.ready) {
          return <Tag color="default">Pending</Tag>;
        }
        return (
          <Tag color="green">
            Ready {availability.completed}/{availability.total}
          </Tag>
        );
      },
    },
    {
      title: 'Phone',
      key: 'phone',
      render: (_: unknown, record: OrderDto) => record.patient?.phone || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: OrderDto) => {
        const hasPhone = !!record.patient?.phone;
        const availability = getResultsAvailability(record);
        const reportReady = availability.ready;
        const paid = record.paymentStatus === 'paid';
        const canRelease = reportReady && paid;
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
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Button type="text" icon={<MoreOutlined />} />
            </Dropdown>
          );
        }

        return (
          <Space>
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
            <Tooltip title={!reportReady ? notReadyTooltip : !hasPhone ? 'No phone number' : paymentTooltip || 'Send via WhatsApp'}>
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
            <Tooltip title={!reportReady ? notReadyTooltip : !hasPhone ? 'No phone number' : paymentTooltip || 'Send via Viber'}>
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
        // ignore
      }
    } catch {
      message.error('Failed to mark as paid');
    } finally {
      setMarkingPaid(false);
    }
  };

  return (
    <div>
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
              ? `Paid: ${Number(paymentModalOrder.paidAmount).toLocaleString()} IQD · Remaining: ${(Number(paymentModalOrder.finalAmount) - Number(paymentModalOrder.paidAmount)).toLocaleString()} IQD`
              : `Amount to pay: ${Number(paymentModalOrder.finalAmount).toLocaleString()} IQD`}
          </Typography.Paragraph>
        )}
        <Typography.Paragraph type="secondary">
          Click &quot;Mark as paid&quot; to confirm payment and continue.
        </Typography.Paragraph>
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
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={loadOrders}
              style={{ width: 260 }}
            />
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as OrderStatus | 'ALL')}
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
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={loadOrders}
              loading={loading}
            >
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
              columns={columns}
              dataSource={orders}
              rowKey="id"
              rowSelection={{
                selectedRowKeys: selectedOrderIds,
                onChange: (keys) => setSelectedOrderIds(keys as string[]),
              }}
              expandable={{
                expandedRowRender: (record) => renderTestProgress(record),
                rowExpandable: (record) => {
                  const availability = getResultsAvailability(record);
                  return !availability.ready || availability.completed < availability.total;
                },
              }}
              pagination={{ pageSize: 20 }}
            />
          )}
        </Space>
      </Card>
    </div>
  );
}
