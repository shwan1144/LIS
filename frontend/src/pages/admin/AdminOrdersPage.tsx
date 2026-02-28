import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  getAdminLab,
  getAdminLabs,
  getAdminOrder,
  getAdminOrders,
  getAdminOrderResultsPdf,
  type AdminLabDto,
  type AdminOrderDetail,
  type AdminOrderListItem,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  ADMIN_DATE_RANGE_EVENT,
  ADMIN_DATE_RANGE_KEY,
  ADMIN_LAB_SCOPE_EVENT,
  ADMIN_SELECTED_LAB_KEY,
  type StoredAdminDateRange,
} from '../../utils/admin-ui';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const DEFAULT_PAGE_SIZE = 25;

type OrderStatusFilter = '' | 'REGISTERED' | 'COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export function AdminOrdersPage() {
  const { user } = useAuth();
  const canExportResults = user?.role === 'SUPER_ADMIN';
  const [labs, setLabs] = useState<AdminLabDto[]>([]);
  const [loadingLabs, setLoadingLabs] = useState(false);

  const [labId, setLabId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<OrderStatusFilter>('');
  const [searchText, setSearchText] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => getInitialDateRange());

  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [labsError, setLabsError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [downloadingResultsPdf, setDownloadingResultsPdf] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);

  const loadLabs = async () => {
    setLoadingLabs(true);
    setLabsError(null);
    try {
      const items = await getAdminLabs();
      setLabs(items);
    } catch (error) {
      setLabsError(getErrorMessage(error) || 'Failed to load labs');
    } finally {
      setLoadingLabs(false);
    }
  };

  useEffect(() => {
    const savedLabId = localStorage.getItem(ADMIN_SELECTED_LAB_KEY) ?? undefined;
    setLabId(savedLabId || undefined);
    void loadLabs();
  }, []);

  const loadOrders = async () => {
    setLoadingOrders(true);
    setOrdersError(null);
    try {
      const result = await getAdminOrders({
        labId,
        status: status || undefined,
        q: searchApplied || undefined,
        dateFrom: dateRange[0].startOf('day').toISOString(),
        dateTo: dateRange[1].endOf('day').toISOString(),
        page,
        size,
      });
      setOrders(result.items);
      setTotal(result.total);
    } catch (error) {
      setOrdersError(getErrorMessage(error) || 'Failed to load orders');
      setOrders([]);
      setTotal(0);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, [labId, status, searchApplied, dateRange, page, size]);

  const activeFilterTags = useMemo(() => {
    const tags: string[] = [];
    const selectedLab = labs.find((item) => item.id === labId);
    if (selectedLab) {
      tags.push(`Lab: ${selectedLab.name}`);
    }
    if (status) {
      tags.push(`Status: ${status.replace(/_/g, ' ')}`);
    }
    if (searchApplied) {
      tags.push(`Search: ${searchApplied}`);
    }
    tags.push(
      `Date: ${dateRange[0].format('YYYY-MM-DD')} to ${dateRange[1].format('YYYY-MM-DD')}`,
    );
    return tags;
  }, [dateRange, labId, labs, searchApplied, status]);

  const handleLabChange = async (value: string | undefined) => {
    setLabId(value);
    setPage(1);
    if (!value) {
      localStorage.removeItem(ADMIN_SELECTED_LAB_KEY);
      window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId: null } }));
      return;
    }

    localStorage.setItem(ADMIN_SELECTED_LAB_KEY, value);
    window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId: value } }));

    // Keep scope label responsive even if labs list was stale
    if (!labs.some((lab) => lab.id === value)) {
      try {
        const lab = await getAdminLab(value);
        setLabs((prev) => {
          const exists = prev.some((item) => item.id === lab.id);
          return exists ? prev : [...prev, lab];
        });
      } catch {
        // ignore soft refresh failure
      }
    }
  };

  const handleDateRangeChange = (value: [Dayjs, Dayjs] | null) => {
    if (!value) return;
    setDateRange(value);
    setPage(1);
    const payload: StoredAdminDateRange = {
      preset: 'custom',
      start: value[0].toISOString(),
      end: value[1].toISOString(),
    };
    localStorage.setItem(ADMIN_DATE_RANGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(ADMIN_DATE_RANGE_EVENT, { detail: payload }));
  };

  const handleOpenDrawer = async (orderId: string) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setSelectedOrder(null);
    try {
      const detail = await getAdminOrder(orderId);
      setSelectedOrder(detail);
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to load order details');
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleOpenResultsPdf = async () => {
    if (!canExportResults) {
      message.warning('Export is disabled for AUDITOR');
      return;
    }
    if (!selectedOrder) return;
    setDownloadingResultsPdf(true);
    try {
      const blob = await getAdminOrderResultsPdf(selectedOrder.id);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      const blobMessage = await getBlobErrorMessage(error);
      message.error(blobMessage || getErrorMessage(error) || 'Failed to open results PDF');
    } finally {
      setDownloadingResultsPdf(false);
    }
  };

  const columns: ColumnsType<AdminOrderListItem> = [
    {
      title: 'Date/Time',
      dataIndex: 'registeredAt',
      key: 'registeredAt',
      width: 170,
      render: (value: string) => formatDate(value),
    },
    {
      title: 'Lab',
      key: 'lab',
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.labName || '-'}</Text>
          <Text type="secondary">{row.labCode || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Order #',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      width: 150,
      render: (value: string | null) => value || '-',
    },
    {
      title: 'Patient',
      key: 'patient',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.patientName || '-'}</Text>
          <Text type="secondary">{row.patientPhone || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: string) => <Tag color={statusColor(value)}>{value.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 140,
      render: (_, row) => `${row.verifiedTestsCount}/${row.testsCount} verified`,
    },
    {
      title: 'Amount',
      dataIndex: 'finalAmount',
      key: 'finalAmount',
      width: 120,
      align: 'right',
      render: (value: number | null) => formatMoney(value),
    },
    {
      title: 'Flags',
      key: 'flags',
      width: 110,
      render: (_, row) => (row.hasCriticalFlag ? <Tag color="red">Critical</Tag> : '-'),
    },
  ];

  const detailTestRows = useMemo(() => {
    if (!selectedOrder) return [];
    return selectedOrder.samples.flatMap((sample) =>
      sample.orderTests.map((orderTest) => ({
        key: orderTest.id,
        sampleBarcode: sample.barcode || '-',
        tubeType: sample.tubeType || '-',
        testCode: orderTest.test?.code || '-',
        testName: orderTest.test?.name || '-',
        status: orderTest.status,
        flag: orderTest.flag,
        result:
          orderTest.resultValue !== null
            ? `${orderTest.resultValue}${orderTest.test?.unit ? ` ${orderTest.test.unit}` : ''}`
            : (orderTest.resultText || '-'),
      })),
    );
  }, [selectedOrder]);

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        Orders
      </Title>
      <Text type="secondary">Cross-lab order monitoring with drill-down details.</Text>

      <Card style={{ marginTop: 16 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {labsError ? (
            <Alert
              type="warning"
              showIcon
              message={labsError}
              action={
                <Button size="small" onClick={() => void loadLabs()}>
                  Retry labs
                </Button>
              }
            />
          ) : null}

          <Space wrap>
            <Select
              allowClear
              placeholder="All Labs"
              style={{ width: 240 }}
              loading={loadingLabs}
              value={labId}
              options={labs.map((lab) => ({
                label: `${lab.name} (${lab.code})`,
                value: lab.id,
              }))}
              onChange={(value) => void handleLabChange(value)}
            />
            <Select<OrderStatusFilter>
              placeholder="All statuses"
              style={{ width: 170 }}
              value={status}
              options={[
                { label: 'All statuses', value: '' },
                { label: 'Registered', value: 'REGISTERED' },
                { label: 'Collected', value: 'COLLECTED' },
                { label: 'In Progress', value: 'IN_PROGRESS' },
                { label: 'Completed', value: 'COMPLETED' },
                { label: 'Cancelled', value: 'CANCELLED' },
              ]}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
            <RangePicker value={dateRange} onChange={(value) => handleDateRangeChange(value as [Dayjs, Dayjs] | null)} />
            <Input.Search
              allowClear
              placeholder="Order #, patient, phone, national ID, barcode"
              style={{ width: 340 }}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onSearch={(value) => {
                setSearchApplied(value.trim());
                setPage(1);
              }}
            />
            <Button
              onClick={() => {
                const initialRange = getInitialDateRange();
                setStatus('');
                setSearchText('');
                setSearchApplied('');
                setDateRange(initialRange);
                setPage(1);
                setSize(DEFAULT_PAGE_SIZE);
              }}
            >
              Reset filters
            </Button>
            <Button onClick={() => void loadOrders()} disabled={loadingOrders}>
              Retry
            </Button>
          </Space>

          <Space wrap>
            {activeFilterTags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </Space>

          {ordersError ? (
            <Alert
              type="error"
              showIcon
              message={ordersError}
              action={
                <Button size="small" onClick={() => void loadOrders()}>
                  Retry orders
                </Button>
              }
            />
          ) : null}

          <Table
            rowKey="id"
            loading={loadingOrders}
            columns={columns}
            dataSource={orders}
            locale={{ emptyText: 'No orders found for current filters.' }}
            onRow={(record) => ({
              onClick: () => {
                void handleOpenDrawer(record.id);
              },
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: page,
              pageSize: size,
              total,
              showSizeChanger: true,
              showTotal: (value) => `${value} orders`,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                if (nextSize && nextSize !== size) {
                  setSize(nextSize);
                }
              },
            }}
          />
        </Space>
      </Card>

      <Drawer
        title={selectedOrder ? `Order ${selectedOrder.orderNumber || selectedOrder.id}` : 'Order details'}
        width={900}
        open={drawerOpen}
        loading={drawerLoading}
        extra={
          <Button
            type="primary"
            onClick={() => void handleOpenResultsPdf()}
            disabled={!selectedOrder || !canExportResults}
            loading={downloadingResultsPdf}
          >
            Open Results PDF
          </Button>
        }
        onClose={() => setDrawerOpen(false)}
      >
        {!selectedOrder ? (
          <Text type="secondary">Select an order to view details.</Text>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions title="Order Overview" bordered size="small" column={2}>
              <Descriptions.Item label="Lab">{selectedOrder.lab?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Order #">{selectedOrder.orderNumber || '-'}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColor(selectedOrder.status)}>{selectedOrder.status.replace(/_/g, ' ')}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Registered">{formatDate(selectedOrder.registeredAt)}</Descriptions.Item>
              <Descriptions.Item label="Payment">{selectedOrder.paymentStatus || '-'}</Descriptions.Item>
              <Descriptions.Item label="Amount">{formatMoney(selectedOrder.finalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Tests">{selectedOrder.testsCount}</Descriptions.Item>
              <Descriptions.Item label="Verified">{selectedOrder.verifiedTestsCount}</Descriptions.Item>
            </Descriptions>

            <Descriptions title="Patient" bordered size="small" column={2}>
              <Descriptions.Item label="Name">{selectedOrder.patient?.fullName || '-'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{selectedOrder.patient?.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="National ID">
                {selectedOrder.patient?.nationalId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Sex">{selectedOrder.patient?.sex || '-'}</Descriptions.Item>
            </Descriptions>

            <Table
              size="small"
              rowKey="key"
              pagination={false}
              dataSource={detailTestRows}
              columns={[
                { title: 'Sample', dataIndex: 'sampleBarcode', key: 'sampleBarcode', width: 160 },
                { title: 'Tube', dataIndex: 'tubeType', key: 'tubeType', width: 110 },
                { title: 'Test', dataIndex: 'testName', key: 'testName' },
                { title: 'Code', dataIndex: 'testCode', key: 'testCode', width: 100 },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 120,
                  render: (value: string) => <Tag color={testStatusColor(value)}>{value}</Tag>,
                },
                { title: 'Result', dataIndex: 'result', key: 'result', width: 180 },
                {
                  title: 'Flag',
                  dataIndex: 'flag',
                  key: 'flag',
                  width: 80,
                  render: (value: string | null) =>
                    value ? <Tag color={value === 'HH' || value === 'LL' ? 'red' : 'orange'}>{value}</Tag> : '-',
                },
              ]}
            />
          </Space>
        )}
      </Drawer>
    </div>
  );
}

function getInitialDateRange(): [Dayjs, Dayjs] {
  const saved = localStorage.getItem(ADMIN_DATE_RANGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as StoredAdminDateRange;
      const start = dayjs(parsed.start);
      const end = dayjs(parsed.end);
      if (start.isValid() && end.isValid()) return [start, end];
    } catch {
      // ignore parse errors
    }
  }
  return [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatMoney(value: number | null): string {
  if (value === null || Number.isNaN(Number(value))) return '-';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'IQD',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function statusColor(status: string): string {
  if (status === 'COMPLETED') return 'green';
  if (status === 'IN_PROGRESS') return 'blue';
  if (status === 'COLLECTED') return 'geekblue';
  if (status === 'CANCELLED') return 'red';
  return 'gold';
}

function testStatusColor(status: string): string {
  if (status === 'VERIFIED') return 'green';
  if (status === 'COMPLETED') return 'blue';
  if (status === 'IN_PROGRESS') return 'cyan';
  if (status === 'REJECTED') return 'red';
  return 'default';
}

function getErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('response' in err)) {
    return null;
  }
  const data = (err as { response?: { data?: { message?: string | string[] } } }).response?.data;
  const msg = data?.message;
  if (Array.isArray(msg)) {
    return msg[0] ?? null;
  }
  if (typeof msg === 'string') {
    return msg;
  }
  return null;
}

async function getBlobErrorMessage(err: unknown): Promise<string | null> {
  if (!err || typeof err !== 'object' || !('response' in err)) {
    return null;
  }

  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (!(data instanceof Blob)) {
    return null;
  }

  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) {
      return parsed.message[0] ?? null;
    }
    if (typeof parsed.message === 'string') {
      return parsed.message;
    }
  } catch {
    return null;
  }
  return null;
}
