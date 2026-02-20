import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  DatePicker,
  message,
  Typography,
  Tooltip,
  Modal,
  Statistic,
  Row,
  Col,
  Descriptions,
  Badge,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getWorklist,
  getWorklistStats,
  verifyResult,
  verifyMultipleResults,
  rejectResult,
  getDepartments,
  type WorklistItem,
  type WorklistStats,
  type DepartmentDto,
  OrderTestStatus,
  ResultFlag,
} from '../api/client';

const { Title, Text } = Typography;
const { Search } = Input;

const flagColors: Record<string, string> = {
  [ResultFlag.NORMAL]: 'green',
  [ResultFlag.HIGH]: 'orange',
  [ResultFlag.LOW]: 'blue',
  [ResultFlag.CRITICAL_HIGH]: 'red',
  [ResultFlag.CRITICAL_LOW]: 'red',
};

const flagLabels: Record<string, string> = {
  [ResultFlag.NORMAL]: 'Normal',
  [ResultFlag.HIGH]: 'High',
  [ResultFlag.LOW]: 'Low',
  [ResultFlag.CRITICAL_HIGH]: 'Critical High',
  [ResultFlag.CRITICAL_LOW]: 'Critical Low',
};

interface VerificationOrderGroup {
  orderId: string;
  orderNumber: string;
  patientName: string;
  patientAge: number | null;
  patientSex: string | null;
  registeredAt: string;
  items: WorklistItem[];
}

function groupVerificationByOrder(items: WorklistItem[]): VerificationOrderGroup[] {
  const byOrder = new Map<string, WorklistItem[]>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }

  return Array.from(byOrder.entries()).map(([orderId, orderItems]) => {
    const first = orderItems[0];
    return {
      orderId,
      orderNumber: first.orderNumber,
      patientName: first.patientName,
      patientAge: first.patientAge,
      patientSex: first.patientSex,
      registeredAt: first.registeredAt,
      items: orderItems,
    };
  });
}

export function VerificationPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<WorklistStats | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(dayjs());
  const [departmentId, setDepartmentId] = useState<string | ''>('');
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [page, setPage] = useState(1);
  const [size] = useState(50);

  // Selection for batch verify
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);

  // Reject modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingItem, setRejectingItem] = useState<WorklistItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Detail view modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<WorklistItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Only load COMPLETED status (awaiting verification)
      const result = await getWorklist({
        status: [OrderTestStatus.COMPLETED],
        search: search.trim() || undefined,
        date: dateFilter?.format('YYYY-MM-DD'),
        departmentId: departmentId || undefined,
        page,
        size,
      });
      setData(result.items);
      setTotal(result.total);
    } catch {
      message.error('Failed to load verification queue');
    } finally {
      setLoading(false);
    }
  }, [search, dateFilter, departmentId, page, size]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getWorklistStats();
      setStats(result);
    } catch {
      // Silently fail for stats
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const depts = await getDepartments();
      setDepartments(depts);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStats();
    loadDepartments();
  }, [loadStats, loadDepartments]);

  const groupedData = useMemo(() => groupVerificationByOrder(data), [data]);

  useEffect(() => {
    if (expandedRowIds.length === 0) return;
    const expandedId = expandedRowIds[0];
    if (!groupedData.some((group) => group.orderId === expandedId)) {
      setExpandedRowIds([]);
    }
  }, [groupedData, expandedRowIds]);

  useEffect(() => {
    setSelectedRowKeys((keys) => keys.filter((key) => groupedData.some((group) => group.orderId === key)));
  }, [groupedData]);

  const handleVerify = async (id: string) => {
    try {
      await verifyResult(id);
      message.success('Result verified');
      loadData();
      loadStats();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to verify';
      message.error(msg || 'Failed to verify');
    }
  };

  const handleBatchVerify = async () => {
    if (selectedRowKeys.length === 0) return;
    const idsToVerify = groupedData
      .filter((group) => selectedRowKeys.includes(group.orderId))
      .flatMap((group) => group.items.map((item) => item.id));
    if (idsToVerify.length === 0) return;
    try {
      const result = await verifyMultipleResults(idsToVerify);
      message.success(`Verified ${result.verified} result(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      loadData();
      loadStats();
      setSelectedRowKeys([]);
    } catch {
      message.error('Failed to verify results');
    }
  };

  const handleReject = async () => {
    if (!rejectingItem || !rejectReason.trim()) return;
    try {
      await rejectResult(rejectingItem.id, rejectReason.trim());
      message.success('Result rejected');
      setRejectModalOpen(false);
      setRejectingItem(null);
      setRejectReason('');
      loadData();
      loadStats();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to reject';
      message.error(msg || 'Failed to reject');
    }
  };

  const openRejectModal = (item: WorklistItem) => {
    setRejectingItem(item);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const openDetailModal = (item: WorklistItem) => {
    setDetailItem(item);
    setDetailModalOpen(true);
  };

  const formatResult = (item: WorklistItem) => {
    if (item.resultValue !== null) {
      return `${item.resultValue}${item.testUnit ? ` ${item.testUnit}` : ''}`;
    }
    if (item.resultText) {
      return item.resultText;
    }
    if (item.resultParameters && Object.keys(item.resultParameters).length > 0) {
      return Object.entries(item.resultParameters)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
    return '—';
  };

  const formatNormalRange = (item: WorklistItem) => {
    if (item.normalText) return item.normalText;
    if (item.normalMin != null && item.normalMax != null) {
      return `${item.normalMin}–${item.normalMax}`;
    }
    return '—';
  };

  const columns: ColumnsType<VerificationOrderGroup> = [
    {
      title: 'Queue',
      key: 'queue',
      render: (_, group) => {
        const critical = group.items.filter(
          (item) => item.flag === ResultFlag.CRITICAL_HIGH || item.flag === ResultFlag.CRITICAL_LOW,
        ).length;
        const highLow = group.items.filter(
          (item) => item.flag === ResultFlag.HIGH || item.flag === ResultFlag.LOW,
        ).length;
        const firstItem = group.items[0];

        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1.8fr) minmax(220px, 1.2fr) minmax(180px, 1fr) minmax(150px, 0.8fr)',
              alignItems: 'center',
              columnGap: 8,
            }}
          >
            <Space size={8} style={{ minWidth: 0 }}>
              <UserOutlined style={{ fontSize: 14, color: '#1677ff' }} />
              <div style={{ minWidth: 0 }}>
                <Text strong ellipsis style={{ display: 'block', fontSize: 13, lineHeight: '16px' }}>
                  {group.patientName}
                </Text>
                <Space size={4} style={{ flexWrap: 'wrap' }}>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto' }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (firstItem) openDetailModal(firstItem);
                    }}
                  >
                    {group.orderNumber}
                  </Button>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {group.patientAge ? `${group.patientAge}y` : '-'} {group.patientSex || '-'}
                  </Text>
                </Space>
              </div>
            </Space>

            <Space size={[4, 4]} wrap>
              <Tag style={{ margin: 0 }}>{group.items.length} tests</Tag>
              {critical > 0 && <Tag color="red" style={{ margin: 0 }}>Critical {critical}</Tag>}
              {highLow > 0 && <Tag color="orange" style={{ margin: 0 }}>High/Low {highLow}</Tag>}
              {critical === 0 && highLow === 0 && <Tag color="green" style={{ margin: 0 }}>Normal</Tag>}
            </Space>

            <div style={{ minWidth: 0 }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                Order: {group.orderNumber}
              </Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 10 }}>
                {dayjs(group.registeredAt).format('YYYY-MM-DD HH:mm')}
              </Text>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Tooltip title="Verify all tests in this order">
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    verifyMultipleResults(group.items.map((item) => item.id))
                      .then((result) => {
                        message.success(
                          `Verified ${result.verified} result(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`,
                        );
                        loadData();
                        loadStats();
                      })
                      .catch(() => message.error('Failed to verify results'));
                  }}
                >
                  Verify all
                </Button>
              </Tooltip>
            </div>
          </div>
        );
      },
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
  };

  const renderExpandedResult = (group: VerificationOrderGroup) => (
    <div className="verification-expanded-panel">
      <Table
        className="verification-subtests-table"
        size="small"
        pagination={false}
        rowKey={(row) => row.id}
        dataSource={group.items}
        columns={[
          {
            title: 'Test',
            key: 'test',
            width: 220,
            render: (_: unknown, row: WorklistItem) => (
              <div style={{ lineHeight: '14px' }}>
                <Text strong style={{ display: 'block', fontSize: 12 }}>{row.testCode}</Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{row.testName}</Text>
              </div>
            ),
          },
          {
            title: 'Result',
            key: 'result',
            render: (_: unknown, row: WorklistItem) => <Text style={{ fontSize: 12 }}>{formatResult(row)}</Text>,
          },
          {
            title: 'Flag',
            key: 'flag',
            width: 110,
            render: (_: unknown, row: WorklistItem) =>
              row.flag ? (
                <Tag color={flagColors[row.flag] || 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>
                  {flagLabels[row.flag] || row.flag}
                </Tag>
              ) : (
                <Tag style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>-</Tag>
              ),
          },
          {
            title: 'Status',
            key: 'status',
            width: 110,
            render: (_: unknown, row: WorklistItem) => (
              <Tag color="processing" style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>
                {row.status}
              </Tag>
            ),
          },
          {
            title: 'Resulted At',
            key: 'resultedAt',
            width: 150,
            render: (_: unknown, row: WorklistItem) => (
              <Text style={{ fontSize: 12 }}>
                {row.resultedAt ? dayjs(row.resultedAt).format('YYYY-MM-DD HH:mm') : '-'}
              </Text>
            ),
          },
          {
            title: 'Actions',
            key: 'actions',
            width: 160,
            align: 'right' as const,
            render: (_: unknown, row: WorklistItem) => (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button
                  type="link"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleVerify(row.id);
                  }}
                >
                  Verify
                </Button>
                <Button
                  type="link"
                  danger
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    openRejectModal(row);
                  }}
                >
                  Reject
                </Button>
              </div>
            ),
          },
        ]}
        tableLayout="fixed"
        scroll={{ x: 900 }}
      />
    </div>
  );

  return (
    <div>
      <style>{`
        .verification-orders-table .ant-table-thead > tr > th {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .verification-orders-table .ant-table-tbody > tr > td {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .verification-orders-table .verification-order-row-expanded > td {
          background: #f7fbff !important;
          border-top: 1px solid #91caff !important;
          border-bottom: 0 !important;
        }
        .verification-orders-table .verification-order-row-expanded > td:first-child {
          border-left: 2px solid #1677ff !important;
          border-top-left-radius: 8px !important;
        }
        .verification-orders-table .verification-order-row-expanded > td:last-child {
          border-right: 1px solid #91caff !important;
          border-top-right-radius: 8px !important;
        }
        .verification-orders-table .ant-table-expanded-row > td {
          padding: 4px 10px 8px !important;
          background: transparent !important;
          border-left: 2px solid #1677ff !important;
          border-right: 1px solid #91caff !important;
          border-bottom: 1px solid #91caff !important;
          border-bottom-left-radius: 8px !important;
          border-bottom-right-radius: 8px !important;
        }
        .verification-expanded-panel {
          border: 0;
          border-radius: 0;
          overflow: hidden;
          background: transparent;
        }
        .verification-expanded-panel .ant-table-container {
          border-radius: 0;
        }
        html[data-theme='dark'] .verification-orders-table .verification-order-row-expanded > td {
          background: rgba(255, 255, 255, 0.04) !important;
          border-top-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .verification-orders-table .verification-order-row-expanded > td:first-child {
          border-left-color: #3c89e8 !important;
        }
        html[data-theme='dark'] .verification-orders-table .verification-order-row-expanded > td:last-child {
          border-right-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .verification-orders-table .ant-table-expanded-row > td {
          border-left-color: #3c89e8 !important;
          border-right-color: rgba(100, 168, 255, 0.55) !important;
          border-bottom-color: rgba(100, 168, 255, 0.55) !important;
        }
        .verification-subtests-table .ant-table-thead > tr > th {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
          font-size: 11px;
        }
        .verification-subtests-table .ant-table-tbody > tr > td {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
        }
      `}</style>
      <Title level={2}>Verification Queue</Title>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Pending Verification"
              value={stats?.completed || 0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Verified Today"
              value={stats?.verified || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Rejected"
              value={stats?.rejected || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Pending Results"
              value={stats?.pending || 0}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        {/* Filters */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Search
            placeholder="Search patient or order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={() => loadData()}
            style={{ width: 250 }}
            allowClear
          />
          <DatePicker
            value={dateFilter}
            onChange={setDateFilter}
            allowClear
            placeholder="Filter by date"
          />
          <Select
            placeholder="Department"
            value={departmentId || undefined}
            onChange={(v) => setDepartmentId(v || '')}
            allowClear
            style={{ width: 150 }}
            options={[
              { value: '', label: 'All departments' },
              ...departments.map((d) => ({ value: d.id, label: d.name || d.code })),
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Refresh
          </Button>
          {selectedRowKeys.length > 0 && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleBatchVerify}
            >
              Verify Selected ({selectedRowKeys.length})
            </Button>
          )}
        </Space>

        <Table
          className="verification-orders-table"
          columns={columns}
          dataSource={groupedData}
          rowKey="orderId"
          loading={loading}
          showHeader={false}
          rowClassName={(record) => (expandedRowIds.includes(record.orderId) ? 'verification-order-row-expanded' : '')}
          rowSelection={rowSelection}
          expandable={{
            expandedRowRender: (record) => renderExpandedResult(record),
            expandRowByClick: true,
            showExpandColumn: false,
            expandedRowKeys: expandedRowIds,
            onExpand: (expanded, record) => {
              setExpandedRowIds(expanded ? [record.orderId] : []);
            },
          }}
          pagination={{
            current: page,
            pageSize: size,
            total,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            showTotal: (t) => `${t} result(s) awaiting verification`,
          }}
          scroll={{ x: 980 }}
          size="small"
        />
      </Card>

      {/* Reject Modal */}
      <Modal
        title="Reject Result"
        open={rejectModalOpen}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectingItem(null);
          setRejectReason('');
        }}
        onOk={handleReject}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !rejectReason.trim() }}
      >
        {rejectingItem && (
          <div>
            <p>
              <strong>Test:</strong> {rejectingItem.testCode} - {rejectingItem.testName}
            </p>
            <p>
              <strong>Patient:</strong> {rejectingItem.patientName}
            </p>
            <p>
              <strong>Result:</strong> {formatResult(rejectingItem)}
            </p>
            <Input.TextArea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              style={{ marginTop: 16 }}
            />
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        title="Result Details"
        open={detailModalOpen}
        onCancel={() => {
          setDetailModalOpen(false);
          setDetailItem(null);
        }}
        footer={
          detailItem ? (
            <Space>
              <Button onClick={() => setDetailModalOpen(false)}>Close</Button>
              <Button danger onClick={() => {
                setDetailModalOpen(false);
                openRejectModal(detailItem);
              }}>
                Reject
              </Button>
              <Button type="primary" onClick={() => {
                handleVerify(detailItem.id);
                setDetailModalOpen(false);
              }}>
                Verify
              </Button>
            </Space>
          ) : null
        }
        width={600}
      >
        {detailItem && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Order #">{detailItem.orderNumber}</Descriptions.Item>
            <Descriptions.Item label="Sample ID">{detailItem.sampleId || '—'}</Descriptions.Item>
            <Descriptions.Item label="Patient">{detailItem.patientName}</Descriptions.Item>
            <Descriptions.Item label="Age/Sex">
              {detailItem.patientAge ? `${detailItem.patientAge}y` : '—'} / {detailItem.patientSex || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Test Code">{detailItem.testCode}</Descriptions.Item>
            <Descriptions.Item label="Test Name">{detailItem.testName}</Descriptions.Item>
            <Descriptions.Item label="Result" span={2}>
              <Badge
                status={
                  detailItem.flag === ResultFlag.CRITICAL_HIGH || detailItem.flag === ResultFlag.CRITICAL_LOW
                    ? 'error'
                    : detailItem.flag === ResultFlag.HIGH || detailItem.flag === ResultFlag.LOW
                    ? 'warning'
                    : 'success'
                }
                text={
                  <Text strong style={{ fontSize: 16 }}>
                    {formatResult(detailItem)}
                    {detailItem.flag && (
                      <Tag color={flagColors[detailItem.flag]} style={{ marginLeft: 8 }}>
                        {flagLabels[detailItem.flag]}
                      </Tag>
                    )}
                  </Text>
                }
              />
            </Descriptions.Item>
            <Descriptions.Item label="Normal Range">{formatNormalRange(detailItem)}</Descriptions.Item>
            <Descriptions.Item label="Unit">{detailItem.testUnit || '—'}</Descriptions.Item>
            <Descriptions.Item label="Department">
              {detailItem.departmentName || detailItem.departmentCode || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Tube Type">{detailItem.tubeType || '—'}</Descriptions.Item>
            <Descriptions.Item label="Registered">
              {dayjs(detailItem.registeredAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="Resulted">
              {detailItem.resultedAt ? dayjs(detailItem.resultedAt).format('YYYY-MM-DD HH:mm') : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}

