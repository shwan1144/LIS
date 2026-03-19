import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { FilePdfOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  downloadSubLabTestResultsPDF,
  getSubLabPortalOrder,
  getSubLabPortalOrders,
  type OrderDto,
  type OrderHistoryItemDto,
  type OrderResultStatus,
  type OrderStatus,
  type OrderTestDto,
} from '../../api/client';
import { getResultFlagLabel, getResultFlagTagColor } from '../../utils/result-flag';
import './SubLabPortal.css';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type StatusFilter = 'ALL' | OrderStatus;
type TestReferenceLike = {
  normalMin?: number | null;
  normalMax?: number | null;
  normalMinMale?: number | null;
  normalMaxMale?: number | null;
  normalMinFemale?: number | null;
  normalMaxFemale?: number | null;
  normalText?: string | null;
  normalTextMale?: string | null;
  normalTextFemale?: string | null;
};

function getRootOrderTests(order: OrderDto): OrderTestDto[] {
  return (order.samples ?? [])
    .flatMap((sample) => sample.orderTests ?? [])
    .filter((orderTest) => !orderTest.parentOrderTestId);
}

function hasPanelRootTest(order: OrderDto): boolean {
  return getRootOrderTests(order).some((orderTest) => orderTest.test?.type === 'PANEL');
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

function getPortalOrderTestResultText(
  selectedOrder: OrderDto,
  row: OrderTestDto,
  options?: { includeUnit?: boolean },
): string {
  if (!selectedOrder.reportReady) {
    return 'Hidden until report ready';
  }
  if (row.resultText?.trim()) return row.resultText.trim();
  if (row.resultValue != null) {
    const suffix = options?.includeUnit !== false && row.test?.unit ? ` ${row.test.unit}` : '';
    return `${row.resultValue}${suffix}`;
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

function formatDisplayDecimal(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  if (!/^[-+]?\d+(\.\d+)?$/.test(raw)) return raw;
  return raw.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/^\+/, '');
}

function resolveSexSpecificNormalText(
  test: TestReferenceLike | null | undefined,
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

function resolveSexSpecificRange(
  test: TestReferenceLike | null | undefined,
  patientSex: string | null | undefined,
): { normalMin: number | null; normalMax: number | null } {
  if (!test) {
    return { normalMin: null, normalMax: null };
  }
  const sex = String(patientSex ?? '').trim().toUpperCase();
  if (sex === 'M' || sex === 'MALE') {
    return {
      normalMin: test.normalMinMale ?? test.normalMin ?? null,
      normalMax: test.normalMaxMale ?? test.normalMax ?? null,
    };
  }
  if (sex === 'F' || sex === 'FEMALE') {
    return {
      normalMin: test.normalMinFemale ?? test.normalMin ?? null,
      normalMax: test.normalMaxFemale ?? test.normalMax ?? null,
    };
  }
  return {
    normalMin: test.normalMin ?? null,
    normalMax: test.normalMax ?? null,
  };
}

function formatReferenceRange(
  normalText: string | null | undefined,
  normalMin: string | number | null | undefined,
  normalMax: string | number | null | undefined,
): string {
  if (normalText && normalText.length > 0) return normalText;
  const min = formatDisplayDecimal(normalMin);
  const max = formatDisplayDecimal(normalMax);
  if (min === '-' && max === '-') return '-';
  return `${min} - ${max}`;
}

function formatPortalReferenceRange(order: OrderDto, row: OrderTestDto): string {
  const normalText = resolveSexSpecificNormalText(row.test, order.patient?.sex ?? null);
  const resolvedRange = resolveSexSpecificRange(row.test, order.patient?.sex ?? null);
  return formatReferenceRange(normalText, resolvedRange.normalMin, resolvedRange.normalMax);
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${new Intl.NumberFormat('en-IQ', { maximumFractionDigits: 0 }).format(value)} IQD`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
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
  const [orderDetailsById, setOrderDetailsById] = useState<Record<string, OrderDto>>({});
  const [orderDetailsLoadingIds, setOrderDetailsLoadingIds] = useState<string[]>([]);
  const [orderDetailsErrors, setOrderDetailsErrors] = useState<Record<string, string>>({});
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const [selectedDrawerOrderId, setSelectedDrawerOrderId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [downloadingPdfOrderId, setDownloadingPdfOrderId] = useState<string | null>(null);

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

  const ensureOrderDetails = useCallback(
    async (orderId: string, options?: { force?: boolean }): Promise<OrderDto | null> => {
      if (!options?.force && orderDetailsById[orderId]) {
        return orderDetailsById[orderId];
      }
      if (orderDetailsLoadingIds.includes(orderId)) {
        return null;
      }

      setOrderDetailsLoadingIds((previous) =>
        previous.includes(orderId) ? previous : [...previous, orderId],
      );
      setOrderDetailsErrors((previous) => {
        if (!previous[orderId]) return previous;
        const next = { ...previous };
        delete next[orderId];
        return next;
      });

      try {
        const order = await getSubLabPortalOrder(orderId);
        setOrderDetailsById((previous) => ({ ...previous, [orderId]: order }));
        return order;
      } catch {
        setOrderDetailsErrors((previous) => ({
          ...previous,
          [orderId]: 'Failed to load order details',
        }));
        return null;
      } finally {
        setOrderDetailsLoadingIds((previous) => previous.filter((id) => id !== orderId));
      }
    },
    [orderDetailsById, orderDetailsLoadingIds],
  );

  const selectedOrder = selectedDrawerOrderId ? orderDetailsById[selectedDrawerOrderId] ?? null : null;
  const selectedOrderLoading = selectedDrawerOrderId
    ? orderDetailsLoadingIds.includes(selectedDrawerOrderId)
    : false;
  const selectedOrderError = selectedDrawerOrderId
    ? orderDetailsErrors[selectedDrawerOrderId] ?? null
    : null;
  const selectedRootTests = useMemo(
    () => (selectedOrder ? getRootOrderTests(selectedOrder) : []),
    [selectedOrder],
  );

  const openOrder = async (orderId: string) => {
    setDrawerOpen(true);
    setSelectedDrawerOrderId(orderId);
    const order = await ensureOrderDetails(orderId);
    if (!order) {
      message.error('Failed to load order details');
    }
  };

  const handleDownloadPortalPdf = useCallback(async (order: OrderDto) => {
    setDownloadingPdfOrderId(order.id);
    try {
      const blob = await downloadSubLabTestResultsPDF(order.id);
      downloadBlob(blob, `results-${order.orderNumber || order.id.slice(0, 8)}.pdf`);
    } catch {
      message.error('Failed to download PDF');
    } finally {
      setDownloadingPdfOrderId((current) => (current === order.id ? null : current));
    }
  }, []);

  useEffect(() => {
    if (expandedOrderIds.length === 0) return;
    const expandedId = expandedOrderIds[0];
    if (!items.some((item) => item.id === expandedId)) {
      setExpandedOrderIds([]);
    }
  }, [expandedOrderIds, items]);

  const renderExpandedOrder = (row: OrderHistoryItemDto) => {
    const order = orderDetailsById[row.id];
    const isLoadingDetail = orderDetailsLoadingIds.includes(row.id);
    const detailError = orderDetailsErrors[row.id];

    if (isLoadingDetail && !order) {
      return (
        <div className="sub-lab-expanded-shell">
          <div className="sub-lab-expanded-state">
            <Spin size="small" />
          </div>
        </div>
      );
    }

    if (!order && !detailError) {
      return (
        <div className="sub-lab-expanded-shell">
          <div className="sub-lab-expanded-state">
            <Spin size="small" />
          </div>
        </div>
      );
    }

    if (!order) {
      return (
        <div className="sub-lab-expanded-shell">
          <div className="sub-lab-expanded-state">
            <Text type="danger">{detailError || 'Failed to load order details'}</Text>
            <Button size="small" onClick={() => void ensureOrderDetails(row.id, { force: true })}>
              Retry
            </Button>
          </div>
        </div>
      );
    }

    const rootTests = getRootOrderTests(order);
    const panelOrder = hasPanelRootTest(order);

    return (
      <div className="sub-lab-expanded-shell">
        <div className="sub-lab-expanded-header">
          <div className="sub-lab-expanded-copy">
            <Text strong>{order.patient.fullName || '-'}</Text>
            <Text type="secondary">
              Order {order.orderNumber || order.id.slice(0, 8)} | {rootTests.length} tests
            </Text>
          </div>
          {panelOrder ? (
            <Button
              type="primary"
              icon={<FilePdfOutlined />}
              size="small"
              disabled={!order.reportReady}
              loading={downloadingPdfOrderId === order.id}
              onClick={(event) => {
                event.stopPropagation();
                void handleDownloadPortalPdf(order);
              }}
            >
              PDF
            </Button>
          ) : null}
        </div>

        {!order.reportReady ? (
          <Alert
            type="info"
            showIcon
            message="Final results are not ready yet"
            description="You can track workflow status now. Result values become visible after the order is fully report-ready."
            className="sub-lab-expanded-alert"
          />
        ) : null}

        <Table
          className="sub-lab-expanded-tests-table"
          rowKey="id"
          size="small"
          dataSource={rootTests}
          pagination={false}
          scroll={{ x: 980 }}
          locale={{ emptyText: 'No tests found' }}
          columns={[
            {
              title: 'Test',
              key: 'test',
              width: 240,
              render: (_value, orderTest) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{orderTest.test.code}</Text>
                  <Text type="secondary">{orderTest.test.name}</Text>
                </Space>
              ),
            },
            {
              title: 'Result',
              key: 'result',
              width: 220,
              render: (_value, orderTest) =>
                order.reportReady ? (
                  <Text>{getPortalOrderTestResultText(order, orderTest, { includeUnit: false })}</Text>
                ) : (
                  <Text type="secondary">{getPortalOrderTestResultText(order, orderTest, { includeUnit: false })}</Text>
                ),
            },
            {
              title: 'Unit',
              key: 'unit',
              width: 90,
              render: (_value, orderTest) => orderTest.test?.unit || '-',
            },
            {
              title: 'Flag',
              key: 'flag',
              width: 110,
              render: (_value, orderTest) => {
                const flagLabel = getResultFlagLabel(orderTest.flag);
                if (!flagLabel) {
                  return <Text type="secondary">-</Text>;
                }
                return <Tag color={getResultFlagTagColor(orderTest.flag)}>{flagLabel}</Tag>;
              },
            },
            {
              title: 'Normal Range',
              key: 'normalRange',
              width: 180,
              render: (_value, orderTest) => formatPortalReferenceRange(order, orderTest),
            },
            {
              title: 'Price',
              key: 'price',
              width: 120,
              render: (_value, orderTest) => formatPrice(orderTest.price),
            },
          ]}
        />
      </div>
    );
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
            expandable={{
              expandedRowKeys: expandedOrderIds,
              expandRowByClick: true,
              expandedRowRender: renderExpandedOrder,
              onExpand: (expanded, row) => {
                setExpandedOrderIds(expanded ? [row.id] : []);
                if (expanded) {
                  void ensureOrderDetails(row.id);
                }
              },
            }}
            onRow={() => ({
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
        width="100%"
        open={isMobile ? drawerOpen : false}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedDrawerOrderId(null);
        }}
        className="sub-lab-order-drawer"
        title={selectedOrder?.orderNumber || 'Order details'}
      >
        {selectedOrderLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : selectedOrderError && !selectedOrder ? (
          <Alert
            type="error"
            showIcon
            message={selectedOrderError}
            action={
              selectedDrawerOrderId ? (
                <Button size="small" onClick={() => void ensureOrderDetails(selectedDrawerOrderId, { force: true })}>
                  Retry
                </Button>
              ) : undefined
            }
          />
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
                {hasPanelRootTest(selectedOrder) ? (
                  <Button
                    type="primary"
                    icon={<FilePdfOutlined />}
                    disabled={!selectedOrder.reportReady}
                    loading={downloadingPdfOrderId === selectedOrder.id}
                    onClick={() => {
                      void handleDownloadPortalPdf(selectedOrder);
                    }}
                  >
                    PDF
                  </Button>
                ) : null}
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
