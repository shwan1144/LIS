import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  message,
  Input,
  Typography,
  Tag,
  DatePicker,
  Select,
  Modal,
  Form,
  InputNumber,
  Statistic,
  Row,
  Col,
  Divider,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  CheckOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getWorklist,
  getWorklistStats,
  enterResult,
  verifyResult,
  verifyMultipleResults,
  rejectResult,
  getDepartments,
  type WorklistItem,
  type WorklistStats,
  type OrderTestStatus,
  type ResultFlag,
  type DepartmentDto,
} from '../api/client';
import { useTheme } from '../contexts/ThemeContext';

const { Title, Text } = Typography;

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const getFlagColor = (flag: ResultFlag | null): string => {
  switch (flag) {
    case 'HH':
      return '#ff4d4f';
    case 'H':
      return '#fa8c16';
    case 'LL':
      return '#ff4d4f';
    case 'L':
      return '#1890ff';
    case 'N':
      return '#52c41a';
    default:
      return '#d9d9d9';
  }
};

const getFlagLabel = (flag: ResultFlag | null): string => {
  switch (flag) {
    case 'HH':
      return 'Critical High';
    case 'H':
      return 'High';
    case 'LL':
      return 'Critical Low';
    case 'L':
      return 'Low';
    case 'N':
      return 'Normal';
    default:
      return '';
  }
};

/** One row per order; items are the worklist tests for that order */
interface WorklistOrderGroup {
  orderId: string;
  orderNumber: string;
  patientName: string;
  patientAge: number | null;
  patientSex: string | null;
  registeredAt: string;
  items: WorklistItem[];
}

function groupWorklistByOrder(items: WorklistItem[]): WorklistOrderGroup[] {
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

export function WorklistPage() {
  const { isDark } = useTheme();
  const [data, setData] = useState<WorklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<WorklistStats | null>(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderTestStatus[]>(['PENDING', 'COMPLETED']);
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(dayjs());
  const [departmentId, setDepartmentId] = useState<string | ''>('');
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [page, setPage] = useState(1);
  const [size] = useState(50);

  // Selection for batch verify
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);

  // Result entry modal
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorklistItem | null>(null);
  const [resultForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Reject modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingItem, setRejectingItem] = useState<WorklistItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWorklist({
        status: statusFilter,
        search: search.trim() || undefined,
        date: dateFilter?.format('YYYY-MM-DD'),
        departmentId: departmentId || undefined,
        page,
        size,
      });
      setData(result.items);
      setTotal(result.total);
    } catch {
      message.error('Failed to load worklist');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, dateFilter, departmentId, page, size]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getWorklistStats();
      setStats(result);
    } catch {
      // Silently fail for stats
    }
  }, []);

  const groupedData = useMemo(() => groupWorklistByOrder(data), [data]);

  useEffect(() => {
    getDepartments().then(setDepartments).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
    loadStats();
  }, [loadData, loadStats]);

  useEffect(() => {
    if (expandedOrderIds.length === 0) return;
    const expandedId = expandedOrderIds[0];
    if (!groupedData.some((group) => group.orderId === expandedId)) {
      setExpandedOrderIds([]);
    }
  }, [expandedOrderIds, groupedData]);

  const handleSearch = () => {
    setPage(1);
    loadData();
  };

  const handleOpenResultModal = (item: WorklistItem) => {
    setEditingItem(item);
    const existingParams = item.resultParameters ?? {};
    const defaults: Record<string, string> = {};
    (item.parameterDefinitions ?? []).forEach((def) => {
      if (def.defaultValue != null && def.defaultValue.trim() !== '' && (existingParams[def.code] == null || String(existingParams[def.code]).trim() === '')) {
        defaults[def.code] = def.defaultValue.trim();
      }
    });
    resultForm.setFieldsValue({
      resultValue: item.resultValue,
      resultText: item.resultText,
      resultParameters: { ...defaults, ...existingParams },
    });
    setResultModalOpen(true);
  };

  const handleCloseResultModal = () => {
    setResultModalOpen(false);
    setEditingItem(null);
    resultForm.resetFields();
  };

  const handleSubmitResult = async (values: {
    resultValue?: number;
    resultText?: string;
    resultParameters?: Record<string, string>;
  }) => {
    if (!editingItem) return;

    const raw = values.resultParameters ?? {};
    const resultParams = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => {
        const s = v != null ? String(v).trim() : '';
        return s !== '' && s !== '__other__';
      })
    );

    setSubmitting(true);
    try {
      await enterResult(editingItem.id, {
        resultValue: values.resultValue ?? null,
        resultText: values.resultText || null,
        resultParameters: Object.keys(resultParams).length > 0 ? resultParams : null,
      });
      message.success('Result saved');
      handleCloseResultModal();
      loadData();
      loadStats();
    } catch {
      message.error('Failed to save result');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (id: string) => {
    try {
      await verifyResult(id);
      message.success('Result verified');
      loadData();
      loadStats();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to verify';
      message.error(msg || 'Failed to verify');
    }
  };

  const handleBatchVerify = async () => {
    if (selectedRowKeys.length === 0) return;
    const idsToVerify = groupedData
      .filter((g) => selectedRowKeys.includes(g.orderId))
      .flatMap((g) => g.items.filter((i) => i.status === 'COMPLETED').map((i) => i.id));
    if (idsToVerify.length === 0) {
      message.warning('No completed results to verify in selected orders');
      return;
    }
    try {
      const result = await verifyMultipleResults(idsToVerify);
      message.success(`Verified ${result.verified} result(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      setSelectedRowKeys([]);
      loadData();
      loadStats();
    } catch {
      message.error('Failed to verify results');
    }
  };

  const handleOpenRejectModal = (item: WorklistItem) => {
    setRejectingItem(item);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejectingItem || !rejectReason.trim()) return;
    
    try {
      await rejectResult(rejectingItem.id, rejectReason);
      message.success('Result rejected');
      setRejectModalOpen(false);
      setRejectingItem(null);
      loadData();
      loadStats();
    } catch {
      message.error('Failed to reject result');
    }
  };

  const orderColumns: ColumnsType<WorklistOrderGroup> = [
    {
      title: 'Queue',
      key: 'queue',
      render: (_, g) => {
        const pending = g.items.filter((i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS').length;
        const completed = g.items.filter((i) => i.status === 'COMPLETED').length;
        const verified = g.items.filter((i) => i.status === 'VERIFIED').length;
        const rejected = g.items.filter((i) => i.status === 'REJECTED').length;

        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1.8fr) minmax(180px, 1.4fr) 120px 140px',
              alignItems: 'center',
              columnGap: 8,
            }}
          >
            <Space size={8} style={{ minWidth: 0 }}>
              <UserOutlined style={{ fontSize: 14, color: '#1677ff' }} />
              <div style={{ minWidth: 0 }}>
                <Text strong ellipsis style={{ display: 'block', fontSize: 13, lineHeight: '16px' }}>
                  {g.patientName}
                </Text>
                <Text type="secondary" style={{ fontSize: 11, lineHeight: '14px' }}>
                  {g.patientAge !== null ? `${g.patientAge}y` : '-'} {g.patientSex || '-'}
                </Text>
              </div>
            </Space>

            <Space size={[4, 4]} wrap>
              <Tag style={{ margin: 0 }}>{g.items.length} test{g.items.length !== 1 ? 's' : ''}</Tag>
              {pending > 0 && <Tag color="default" style={{ margin: 0 }}>Pending {pending}</Tag>}
              {completed > 0 && <Tag color="processing" style={{ margin: 0 }}>Completed {completed}</Tag>}
              {verified > 0 && <Tag color="success" style={{ margin: 0 }}>Verified {verified}</Tag>}
              {rejected > 0 && <Tag color="error" style={{ margin: 0 }}>Rejected {rejected}</Tag>}
            </Space>

            <Text type="secondary" style={{ fontSize: 12 }}>
              {g.orderNumber}
            </Text>

            <Text type="secondary" style={{ fontSize: 12 }}>
              {dayjs(g.registeredAt).format('YYYY-MM-DD HH:mm')}
            </Text>
          </div>
        );
      },
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
    getCheckboxProps: (record: WorklistOrderGroup) => ({
      disabled: !record.items.some((i) => i.status === 'COMPLETED'),
    }),
  };

  const renderExpandedTests = (group: WorklistOrderGroup) => (
    <div className="worklist-expanded-panel">
      <Table
        className="worklist-subtests-table"
        size="small"
        rowKey="id"
        dataSource={group.items}
        pagination={false}
        columns={[
        {
          title: 'Test',
          key: 'test',
          width: 200,
          render: (_: unknown, r: WorklistItem) => (
            <div>
              <Tag color="blue">{r.testCode}</Tag>
              <Text>{r.testName}</Text>
            </div>
          ),
        },
        {
          title: 'Result',
          key: 'result',
          width: 150,
          render: (_: unknown, r: WorklistItem) => {
            if (r.resultValue !== null) {
              return (
                <Space>
                  <Text strong style={{ color: getFlagColor(r.flag) }}>{r.resultValue}</Text>
                  {r.testUnit && <Text type="secondary">{r.testUnit}</Text>}
                  {r.flag && r.flag !== 'N' && <Tag color={getFlagColor(r.flag)}>{r.flag}</Tag>}
                </Space>
              );
            }
            if (r.resultText) return <Text>{r.resultText}</Text>;
            return <Text type="secondary">—</Text>;
          },
        },
        {
          title: 'Normal Range',
          key: 'normalRange',
          width: 130,
          render: (_: unknown, r: WorklistItem) => {
            if (r.normalText) return <Text type="secondary">{r.normalText}</Text>;
            if (r.normalMin !== null || r.normalMax !== null) {
              return (
                <Text type="secondary">
                  {r.normalMin ?? '-'} - {r.normalMax ?? '-'} {r.testUnit || ''}
                </Text>
              );
            }
            return <Text type="secondary">—</Text>;
          },
        },
        {
          title: 'Status',
          dataIndex: 'status',
          key: 'status',
          width: 100,
          render: (status: OrderTestStatus) => {
            const colors: Record<OrderTestStatus, string> = {
              PENDING: 'default',
              IN_PROGRESS: 'processing',
              COMPLETED: 'warning',
              VERIFIED: 'success',
              REJECTED: 'error',
            };
            return <Tag color={colors[status]}>{status}</Tag>;
          },
        },
        {
          title: 'Tube',
          dataIndex: 'tubeType',
          key: 'tubeType',
          width: 90,
          render: (v: string | null) => (v ? <Tag color="purple">{v.replace('_', ' ')}</Tag> : '—'),
        },
        {
          title: 'Actions',
          key: 'actions',
          width: 200,
          render: (_: unknown, r: WorklistItem) => (
            <Space size="small">
              {r.status !== 'VERIFIED' && r.status !== 'REJECTED' && (
                <Button type="primary" size="small" onClick={() => handleOpenResultModal(r)}>
                  {r.resultValue !== null || r.resultText ? 'Edit' : 'Enter'}
                </Button>
              )}
              {r.status === 'COMPLETED' && (
                <>
                  <Tooltip title="Verify">
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={() => handleVerify(r.id)}
                      style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                    />
                  </Tooltip>
                  <Tooltip title="Reject">
                    <Button
                      danger
                      size="small"
                      icon={<CloseCircleOutlined />}
                      onClick={() => handleOpenRejectModal(r)}
                    />
                  </Tooltip>
                </>
              )}
              {r.status === 'VERIFIED' && (
                <Tag icon={<CheckCircleOutlined />} color="success">Verified</Tag>
              )}
              {r.status === 'REJECTED' && (
                <Tag icon={<CloseCircleOutlined />} color="error">Rejected</Tag>
              )}
            </Space>
          ),
        },
        ]}
      />
    </div>
  );

  return (
    <div>
      <style>{`
        .worklist-orders-table .ant-table-thead > tr > th {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .worklist-orders-table .ant-table-tbody > tr > td {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td {
          background: #f7fbff !important;
          border-top: 1px solid #91caff !important;
          border-bottom: 0 !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td:first-child {
          border-left: 2px solid #1677ff !important;
          border-top-left-radius: 8px !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td:last-child {
          border-right: 1px solid #91caff !important;
          border-top-right-radius: 8px !important;
        }
        .worklist-orders-table .ant-table-expanded-row > td {
          padding: 4px 10px 8px !important;
          background: transparent !important;
          border-left: 2px solid #1677ff !important;
          border-right: 1px solid #91caff !important;
          border-bottom: 1px solid #91caff !important;
          border-bottom-left-radius: 8px !important;
          border-bottom-right-radius: 8px !important;
        }
        .worklist-expanded-panel {
          border: 0;
          border-radius: 0;
          overflow: hidden;
          background: transparent;
        }
        .worklist-expanded-panel .ant-table-container {
          border-radius: 0;
        }
        html[data-theme='dark'] .worklist-orders-table .worklist-order-row-expanded > td {
          background: rgba(255, 255, 255, 0.04) !important;
          border-top-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .worklist-orders-table .worklist-order-row-expanded > td:first-child {
          border-left-color: #3c89e8 !important;
        }
        html[data-theme='dark'] .worklist-orders-table .worklist-order-row-expanded > td:last-child {
          border-right-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .worklist-orders-table .ant-table-expanded-row > td {
          border-left-color: #3c89e8 !important;
          border-right-color: rgba(100, 168, 255, 0.55) !important;
          border-bottom-color: rgba(100, 168, 255, 0.55) !important;
        }
        .worklist-subtests-table .ant-table-thead > tr > th {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
          font-size: 11px;
        }
        .worklist-subtests-table .ant-table-tbody > tr > td {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
        }
      `}</style>
      <Title level={4} style={{ marginBottom: 16 }}>Worklist</Title>

      {/* Stats */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Pending"
                value={stats.pending}
                valueStyle={{ color: '#1890ff' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Completed"
                value={stats.completed}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Verified"
                value={stats.verified}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Rejected"
                value={stats.rejected}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        {/* Filters */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="Search order #, patient, test..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 250 }}
            allowClear
          />
          <Select
            mode="multiple"
            placeholder="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 250 }}
            options={STATUS_OPTIONS}
            allowClear
          />
          <Select
            placeholder="Department"
            value={departmentId || undefined}
            onChange={(v) => setDepartmentId(v ?? '')}
            style={{ width: 180 }}
            allowClear
            options={departments.map((d) => ({ label: `${d.code} – ${d.name}`, value: d.id }))}
          />
          <DatePicker
            value={dateFilter}
            onChange={setDateFilter}
            allowClear
            placeholder="Filter by date"
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            Search
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => { loadData(); loadStats(); }}>
            Refresh
          </Button>
          {selectedRowKeys.length > 0 && (
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleBatchVerify}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              Verify Selected ({selectedRowKeys.length})
            </Button>
          )}
        </Space>

        <Table<WorklistOrderGroup>
          className="worklist-orders-table"
          rowKey="orderId"
          columns={orderColumns}
          dataSource={groupedData}
          loading={loading}
          showHeader={false}
          rowClassName={(record) => (expandedOrderIds.includes(record.orderId) ? 'worklist-order-row-expanded' : '')}
          rowSelection={rowSelection}
          expandable={{
            expandedRowRender: (record) => renderExpandedTests(record),
            expandRowByClick: true,
            showExpandColumn: false,
            expandedRowKeys: expandedOrderIds,
            onExpand: (expanded, record) => {
              setExpandedOrderIds(expanded ? [record.orderId] : []);
            },
          }}
          pagination={{
            current: page,
            pageSize: size,
            total,
            showSizeChanger: false,
            showTotal: (t) => `Total ${t} tests`,
            onChange: (p) => setPage(p),
          }}
          scroll={{ x: 820 }}
          size="small"
        />
      </Card>

      {/* Result Entry Modal */}
      <Modal
        title={
          <Space size="middle">
            <span style={{ fontWeight: 600, fontSize: 16 }}>Enter Result</span>
            {editingItem && (
              <Tag color="blue" style={{ margin: 0 }}>{editingItem.testCode} – {editingItem.testName}</Tag>
            )}
          </Space>
        }
        open={resultModalOpen}
        onCancel={handleCloseResultModal}
        footer={null}
        width={720}
        styles={{
          body: { paddingTop: 8 },
          header: { borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' },
        }}
      >
        {editingItem && (
          <div style={{ padding: '4px 0' }}>
            <div
              style={{
                marginBottom: 24,
                padding: 16,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0',
                borderRadius: 10,
              }}
            >
              <Row gutter={[24, 8]}>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Patient</Text>
                  <div style={{ marginTop: 2 }}><Text strong>{editingItem.patientName}</Text></div>
                </Col>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Order</Text>
                  <div style={{ marginTop: 2 }}><Text strong>{editingItem.orderNumber}</Text></div>
                </Col>
              </Row>
              {(editingItem.normalMin !== null || editingItem.normalMax !== null || editingItem.normalText) && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Normal range</Text>
                  <div style={{ marginTop: 2 }}>
                    <Text>
                      {editingItem.normalText ||
                        `${editingItem.normalMin ?? '–'} – ${editingItem.normalMax ?? '–'} ${editingItem.testUnit || ''}`}
                    </Text>
                  </div>
                </div>
              )}
            </div>

            <Form
              form={resultForm}
              layout="vertical"
              onFinish={handleSubmitResult}
            >
              {(editingItem.parameterDefinitions?.length ?? 0) === 0 && (
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="resultValue"
                      label={`Result value${editingItem.testUnit ? ` (${editingItem.testUnit})` : ''}`}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        placeholder="Enter numeric result"
                        precision={4}
                        size="large"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="resultText"
                      label="Result text (qualitative)"
                    >
                      <Input placeholder='e.g. Positive, Negative, Reactive' size="large" />
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {(editingItem.parameterDefinitions?.length ?? 0) > 0 && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ fontSize: 14 }}>Parameters</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>Enter result parameters for this test</Text>
                  </div>
                  <Row gutter={[20, 0]}>
                    {editingItem.parameterDefinitions!.map((def) => (
                      <Form.Item noStyle key={def.code} shouldUpdate={(prev, curr) => prev?.resultParameters?.[def.code] !== curr?.resultParameters?.[def.code]}>
                        {() => {
                          const params = resultForm.getFieldValue('resultParameters') ?? {};
                          const val = params[def.code];
                          const isAbnormal = (def.normalOptions?.length ?? 0) > 0 && val != null && String(val).trim() !== '' && val !== '__other__' && !def.normalOptions!.includes(String(val).trim());
                          const labelNode = isAbnormal ? (
                            <Space size={6}>
                              <span>{def.label}</span>
                              <Tag color="orange">Abnormal</Tag>
                            </Space>
                          ) : def.label;
                          return (
                            <Col xs={24} md={12}>
                              <Form.Item
                                name={['resultParameters', def.code]}
                                label={labelNode}
                                style={{ marginBottom: 16 }}
                              >
                                {def.type === 'select' ? (
                                  <Select
                                    allowClear
                                    placeholder={`Select ${def.label} or Other to type`}
                                    size="large"
                                    options={[
                                      ...(def.options ?? []).map((o) => ({ label: o, value: o })),
                                      { label: 'Other (enter manually)', value: '__other__' },
                                    ]}
                                    showSearch
                                    optionFilterProp="label"
                                    onChange={(v) => {
                                      if (v === '__other__') resultForm.setFieldValue(['resultParameters', def.code], '');
                                    }}
                                  />
                                ) : (
                                  <Input placeholder={`Enter ${def.label}`} size="large" />
                                )}
                              </Form.Item>
                            </Col>
                          );
                        }}
                      </Form.Item>
                    ))}
                  </Row>
                  {editingItem.parameterDefinitions!.some((def) => def.type === 'select') && (
                    <Form.Item noStyle shouldUpdate={(prev, curr) => {
                      const prevKeys = prev?.resultParameters ? Object.keys(prev.resultParameters) : [];
                      const currKeys = curr?.resultParameters ? Object.keys(curr.resultParameters) : [];
                      return prevKeys.some((k) => prev.resultParameters?.[k] === '__other__') !==
                        currKeys.some((k) => curr.resultParameters?.[k] === '__other__');
                    }}>
                      {() => {
                        const params = resultForm.getFieldValue('resultParameters') ?? {};
                        return (
                          <Row gutter={[20, 0]}>
                            {editingItem.parameterDefinitions!.filter((def) => def.type === 'select').map((def) =>
                              params[def.code] === '__other__' ? (
                                <Col xs={24} md={12} key={`${def.code}-other`}>
                                  <Form.Item name={['resultParameters', def.code]} label={`${def.label} (specify)`} style={{ marginBottom: 16 }}>
                                    <Input placeholder={`Type ${def.label}…`} size="large" />
                                  </Form.Item>
                                </Col>
                              ) : null
                            )}
                          </Row>
                        );
                      }}
                    </Form.Item>
                  )}
                </>
              )}

              <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                <Space style={{ width: '100%', justifyContent: 'flex-end' }} size="middle">
                  <Button onClick={handleCloseResultModal} size="large">Cancel</Button>
                  <Button type="primary" htmlType="submit" loading={submitting} size="large">
                    Save Result
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Reject Result"
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleReject}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !rejectReason.trim() }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>
            Are you sure you want to reject the result for{' '}
            <Text strong>{rejectingItem?.testCode} - {rejectingItem?.testName}</Text>?
          </Text>
        </div>
        <Input.TextArea
          placeholder="Enter rejection reason..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
        />
      </Modal>
    </div>
  );
}
