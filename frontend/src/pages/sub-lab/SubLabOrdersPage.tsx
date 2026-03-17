import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Grid,
  Input,
  List,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getSubLabPortalOrder,
  getSubLabPortalOrders,
  type OrderDto,
  type OrderHistoryItemDto,
  type OrderResultStatus,
  type OrderStatus,
  type OrderTestDto,
} from '../../api/client';
import './SubLabPortal.css';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type StatusFilter = 'ALL' | OrderStatus;

function getRootOrderTests(order: OrderDto): OrderTestDto[] {
  return (order.samples ?? [])
    .flatMap((sample) => sample.orderTests ?? [])
    .filter((orderTest) => !orderTest.parentOrderTestId);
}

function renderResultStatus(status: OrderResultStatus | undefined) {
  switch (status) {
    case 'VERIFIED':
      return <Tag color="green">Verified</Tag>;
    case 'COMPLETED':
      return <Tag color="blue">Completed</Tag>;
    case 'REJECTED':
      return <Tag color="red">Rejected</Tag>;
    default:
      return <Tag>Pending</Tag>;
  }
}

function getPortalResultSummaryText(row: OrderHistoryItemDto): string {
  if (!row.reportReady) {
    return 'Hidden until ready';
  }
  return row.resultSummary?.trim() ? row.resultSummary : 'Result ready';
}

function getPortalOrderTestResultText(selectedOrder: OrderDto, row: OrderTestDto): string {
  if (!selectedOrder.reportReady) {
    return 'Hidden until report ready';
  }
  if (row.resultText?.trim()) return row.resultText.trim();
  if (row.resultValue != null) {
    return `${row.resultValue}${row.test?.unit ? ` ${row.test.unit}` : ''}`;
  }
  if (row.resultParameters) {
    const parts = Object.entries(row.resultParameters)
      .filter(([, value]) => String(value ?? '').trim().length > 0)
      .map(([key, value]) => `${key}: ${value}`);
    if (parts.length > 0) return parts.join(', ');
  }
  if (row.cultureResult) {
    return row.cultureResult.noGrowth
      ? row.cultureResult.noGrowthResult || 'No growth'
      : `${row.cultureResult.isolates.length} isolate(s)`;
  }
  return '-';
}

export function SubLabOrdersPage() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [items, setItems] = useState<OrderHistoryItemDto[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const result = await getSubLabPortalOrders({
        page: 1,
        size: 100,
        search: search.trim() || undefined,
        status: status !== 'ALL' ? status : undefined,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
      });
      setItems(result.items ?? []);
    } catch {
      message.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const selectedRootTests = useMemo(
    () => (selectedOrder ? getRootOrderTests(selectedOrder) : []),
    [selectedOrder],
  );

  const openOrder = async (orderId: string) => {
    setDrawerOpen(true);
    setSelectedOrderLoading(true);
    setSelectedOrder(null);
    try {
      const order = await getSubLabPortalOrder(orderId);
      setSelectedOrder(order);
    } catch {
      message.error('Failed to load order details');
    } finally {
      setSelectedOrderLoading(false);
    }
  };

  return (
    <div className="sub-lab-portal-page">
      <Space
        className="sub-lab-page-header"
        align="center"
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Referred Orders
          </Title>
          <Text type="secondary">
            Track samples your main laboratory registered under this sub-lab account.
          </Text>
        </div>
      </Space>

      <Card className="sub-lab-portal-card" style={{ marginBottom: 16 }}>
        <div className="sub-lab-filters">
          <RangePicker
            allowClear={false}
            value={dateRange}
            onChange={(value) => {
              if (value?.[0] && value?.[1]) {
                setDateRange([value[0], value[1]]);
              }
            }}
            className="sub-lab-filter-control"
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search order number or patient"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="sub-lab-filter-control sub-lab-filter-search"
          />
          <Select
            value={status}
            onChange={setStatus}
            className="sub-lab-filter-control"
            options={[
              { value: 'ALL', label: 'All statuses' },
              { value: 'REGISTERED', label: 'Registered' },
              { value: 'IN_PROGRESS', label: 'In progress' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
          <Button type="primary" onClick={() => void loadOrders()} loading={loading} className="sub-lab-filter-apply">
            Apply
          </Button>
        </div>
      </Card>

      <Card className="sub-lab-portal-card">
        {isMobile ? (
          <List
            loading={loading}
            dataSource={items}
            pagination={items.length > 15 ? { pageSize: 15 } : false}
            locale={{ emptyText: 'No orders found' }}
            renderItem={(row) => (
              <List.Item>
                <Card
                  size="small"
                  className="sub-lab-order-mobile-card"
                  onClick={() => void openOrder(row.id)}
                >
                  <div className="sub-lab-order-mobile-top">
                    <div>
                      <Text strong>{row.orderNumber || row.id.slice(0, 8)}</Text>
                      <div>
                        <Text type="secondary">{row.patient.fullName || '-'}</Text>
                      </div>
                    </div>
                    <Tag>{row.status.replace('_', ' ')}</Tag>
                  </div>
                  <div className="sub-lab-order-mobile-meta">
                    <Text type="secondary">Registered</Text>
                    <Text>{new Date(row.registeredAt).toLocaleString()}</Text>
                  </div>
                  <div className="sub-lab-order-mobile-meta">
                    <Text type="secondary">Results</Text>
                    <div>{renderResultStatus(row.resultStatus)}</div>
                  </div>
                  <div className="sub-lab-order-mobile-result">
                    <Text type="secondary">Result</Text>
                    <Text>{getPortalResultSummaryText(row)}</Text>
                  </div>
                  <div className="sub-lab-order-mobile-footer">
                    <Text>{row.testsCount} tests</Text>
                    <Text strong>
                      {new Intl.NumberFormat('en-IQ', { maximumFractionDigits: 0 }).format(row.finalAmount || 0)} IQD
                    </Text>
                  </div>
                </Card>
              </List.Item>
            )}
          />
        ) : (
          <Table
            className="sub-lab-orders-table"
            rowKey="id"
            loading={loading}
            dataSource={items}
            pagination={{ pageSize: 15 }}
            scroll={{ x: 1040 }}
            onRow={(row) => ({
              onClick: () => void openOrder(row.id),
              className: 'sub-lab-orders-clickable-row',
            })}
            columns={[
              {
                title: 'Order',
                key: 'order',
                width: 220,
                render: (_value, row) => (
                  <Space direction="vertical" size={0}>
                    <Text strong>{row.orderNumber || row.id.slice(0, 8)}</Text>
                    <Text type="secondary">{row.patient.fullName || '-'}</Text>
                  </Space>
                ),
              },
              {
                title: 'Registered',
                dataIndex: 'registeredAt',
                key: 'registeredAt',
                width: 180,
                render: (value: string) => new Date(value).toLocaleString(),
              },
              {
                title: 'Order Status',
                dataIndex: 'status',
                key: 'status',
                width: 140,
                render: (value: OrderStatus) => <Tag>{value.replace('_', ' ')}</Tag>,
              },
              {
                title: 'Results',
                dataIndex: 'resultStatus',
                key: 'resultStatus',
                width: 140,
                render: (value: OrderResultStatus | undefined) => renderResultStatus(value),
              },
              {
                title: 'Result',
                key: 'resultSummary',
                render: (_value, row) => (
                  <Text
                    type={row.reportReady ? undefined : 'secondary'}
                    ellipsis={{ tooltip: row.resultSummary || undefined }}
                  >
                    {getPortalResultSummaryText(row)}
                  </Text>
                ),
              },
              {
                title: 'Tests',
                dataIndex: 'testsCount',
                key: 'testsCount',
                width: 90,
              },
              {
                title: 'Payable',
                dataIndex: 'finalAmount',
                key: 'finalAmount',
                width: 120,
                render: (value: number) =>
                  `${new Intl.NumberFormat('en-IQ', { maximumFractionDigits: 0 }).format(value || 0)} IQD`,
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        width={isMobile ? '100%' : 920}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        className="sub-lab-order-drawer"
        title={selectedOrder?.orderNumber || 'Order details'}
      >
        {selectedOrderLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : selectedOrder ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {!selectedOrder.reportReady ? (
              <Alert
                type="info"
                showIcon
                message="Final results are not ready yet"
                description="You can track workflow status now. Result values become visible after the order is fully report-ready."
              />
            ) : null}

            <Card size="small" title="Order summary" className="sub-lab-portal-card">
              <Space direction="vertical" size={6}>
                <Text>
                  <Text strong>Patient:</Text> {selectedOrder.patient.fullName || '-'}
                </Text>
                <Text>
                  <Text strong>Registered:</Text> {new Date(selectedOrder.registeredAt).toLocaleString()}
                </Text>
                <Text>
                  <Text strong>Referred by:</Text> {selectedOrder.notes || 'Himself'}
                </Text>
                <Text>
                  <Text strong>Status:</Text> {selectedOrder.status}
                </Text>
                <Text>
                  <Text strong>Result summary:</Text> {selectedOrder.reportReady ? (selectedRootTests.map((row) => getPortalOrderTestResultText(selectedOrder, row)).filter(Boolean).slice(0, 3).join(' | ') || 'Result ready') : 'Hidden until report ready'}
                </Text>
              </Space>
            </Card>

            <Card size="small" title="Tests" className="sub-lab-portal-card">
              {isMobile ? (
                <List
                  dataSource={selectedRootTests}
                  renderItem={(row) => (
                    <List.Item>
                      <div className="sub-lab-test-mobile-card">
                        <div className="sub-lab-test-mobile-top">
                          <div>
                            <Text strong>{row.test.code}</Text>
                            <div>
                              <Text type="secondary">{row.test.name}</Text>
                            </div>
                          </div>
                          <Tag>{row.status}</Tag>
                        </div>
                        <div className="sub-lab-test-mobile-result">
                          <Text type="secondary">Result</Text>
                          <Text>{getPortalOrderTestResultText(selectedOrder, row)}</Text>
                        </div>
                        <div className="sub-lab-test-mobile-meta">
                          <Text type="secondary">Verified</Text>
                          <Text>{row.verifiedAt ? new Date(row.verifiedAt).toLocaleString() : '-'}</Text>
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Table
                  rowKey="id"
                  dataSource={selectedRootTests}
                  pagination={false}
                  scroll={{ x: 760 }}
                  columns={[
                    {
                      title: 'Test',
                      key: 'test',
                      render: (_value, row) => (
                        <Space direction="vertical" size={0}>
                          <Text strong>{row.test.code}</Text>
                          <Text type="secondary">{row.test.name}</Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      key: 'status',
                      width: 130,
                    },
                    {
                      title: 'Result',
                      key: 'result',
                      render: (_value, row) =>
                        selectedOrder.reportReady ? (
                          getPortalOrderTestResultText(selectedOrder, row)
                        ) : (
                          <Text type="secondary">{getPortalOrderTestResultText(selectedOrder, row)}</Text>
                        ),
                    },
                    {
                      title: 'Verified',
                      dataIndex: 'verifiedAt',
                      key: 'verifiedAt',
                      width: 180,
                      render: (value: string | null) => (value ? new Date(value).toLocaleString() : '-'),
                    },
                  ]}
                />
              )}
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
}
