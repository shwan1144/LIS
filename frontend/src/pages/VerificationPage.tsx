import { useState, useEffect, useCallback } from 'react';
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

  const handleVerify = async (id: string) => {
    try {
      await verifyResult(id);
      message.success('Result verified');
      loadData();
      loadStats();
      setSelectedRowKeys((keys) => keys.filter((k) => k !== id));
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
    try {
      const result = await verifyMultipleResults(selectedRowKeys);
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

  const columns: ColumnsType<WorklistItem> = [
    {
      title: 'Order #',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      width: 140,
      render: (text: string, record) => (
        <Button type="link" size="small" onClick={() => openDetailModal(record)}>
          {text}
        </Button>
      ),
    },
    {
      title: 'Patient',
      dataIndex: 'patientName',
      key: 'patientName',
      width: 150,
      render: (name: string, record) => (
        <span>
          {name}
          {record.patientAge && <Text type="secondary"> ({record.patientAge}y)</Text>}
        </span>
      ),
    },
    {
      title: 'Test',
      key: 'test',
      width: 180,
      render: (_, record) => (
        <span>
          <Text strong>{record.testCode}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{record.testName}</Text>
        </span>
      ),
    },
    {
      title: 'Result',
      key: 'result',
      width: 120,
      render: (_, record) => {
        const result = formatResult(record);
        const isCritical = record.flag === ResultFlag.CRITICAL_HIGH || record.flag === ResultFlag.CRITICAL_LOW;
        return (
          <Text strong style={{ color: isCritical ? '#ff4d4f' : undefined }}>
            {result}
          </Text>
        );
      },
    },
    {
      title: 'Normal Range',
      key: 'normalRange',
      width: 100,
      render: (_, record) => <Text type="secondary">{formatNormalRange(record)}</Text>,
    },
    {
      title: 'Flag',
      key: 'flag',
      width: 100,
      render: (_, record) => {
        if (!record.flag) return '—';
        return (
          <Tag color={flagColors[record.flag] || 'default'}>
            {flagLabels[record.flag] || record.flag}
          </Tag>
        );
      },
    },
    {
      title: 'Resulted',
      dataIndex: 'resultedAt',
      key: 'resultedAt',
      width: 130,
      render: (date: string | null) => date ? dayjs(date).format('MM-DD HH:mm') : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="Verify">
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleVerify(record.id)}
            >
              Verify
            </Button>
          </Tooltip>
          <Tooltip title="Reject">
            <Button
              danger
              size="small"
              icon={<CloseCircleOutlined />}
              onClick={() => openRejectModal(record)}
            >
              Reject
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
  };

  return (
    <div>
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
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize: size,
            total,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            showTotal: (t) => `${t} result(s) awaiting verification`,
          }}
          scroll={{ x: 1100 }}
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
