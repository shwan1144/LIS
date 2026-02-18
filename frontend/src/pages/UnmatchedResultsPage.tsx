import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Space,
  Tag,
  Input,
  Select,
  Button,
  message,
  Typography,
  Tooltip,
  Modal,
  Descriptions,
  Badge,
  Statistic,
  Row,
  Col,
  Popconfirm,
} from 'antd';
import {
  ReloadOutlined,
  EyeOutlined,
  LinkOutlined,
  DeleteOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getUnmatchedResults,
  getUnmatchedStats,
  resolveUnmatchedResult,
  type UnmatchedResultDto,
  type ResolveUnmatchedDto,
} from '../api/client';

const { Title, Text } = Typography;
const { Search } = Input;

const reasonColors: Record<string, string> = {
  UNORDERED_TEST: 'orange',
  UNMATCHED_SAMPLE: 'red',
  NO_MAPPING: 'purple',
  INVALID_SAMPLE_STATUS: 'blue',
  DUPLICATE_RESULT: 'yellow',
};

const reasonLabels: Record<string, string> = {
  UNORDERED_TEST: 'Test Not Ordered',
  UNMATCHED_SAMPLE: 'Sample Not Found',
  NO_MAPPING: 'No Mapping',
  INVALID_SAMPLE_STATUS: 'Invalid Status',
  DUPLICATE_RESULT: 'Duplicate',
};

export function UnmatchedResultsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UnmatchedResultDto[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [size] = useState(20);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'RESOLVED' | 'DISCARDED' | undefined>(undefined);
  const [reasonFilter, setReasonFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<UnmatchedResultDto | null>(null);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [selectedOrderTestId, setSelectedOrderTestId] = useState<string | undefined>(undefined);
  const [resolveNotes, setResolveNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getUnmatchedResults({
        status: statusFilter,
        reason: reasonFilter,
        page,
        size,
      });
      setData(result.items);
      setTotal(result.total);
    } catch {
      message.error('Failed to load unmatched results');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, reasonFilter, page, size]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getUnmatchedStats();
      setStats(result);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    loadData();
    loadStats();
  }, [loadData, loadStats]);

  const handleOpenDetail = (item: UnmatchedResultDto) => {
    setSelectedItem(item);
    setDetailModalOpen(true);
  };

  const handleOpenResolve = async (item: UnmatchedResultDto) => {
    setSelectedItem(item);
    setResolveModalOpen(true);
    setSelectedOrderTestId(undefined);
    setResolveNotes('');
  };

  const handleResolve = async (action: 'ATTACH' | 'DISCARD', item?: UnmatchedResultDto) => {
    const target = item ?? selectedItem;
    if (!target) return;

    if (action === 'ATTACH' && !selectedOrderTestId) {
      message.warning('Please select an OrderTest to attach');
      return;
    }

    setResolving(true);
    try {
      const dto: ResolveUnmatchedDto = {
        action,
        orderTestId: action === 'ATTACH' ? selectedOrderTestId : undefined,
        notes: resolveNotes || undefined,
      };
      await resolveUnmatchedResult(target.id, dto);
      message.success(`Result ${action === 'ATTACH' ? 'attached' : 'discarded'} successfully`);
      setResolveModalOpen(false);
      loadData();
      loadStats();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to resolve';
      message.error(msg || 'Failed to resolve');
    } finally {
      setResolving(false);
    }
  };

  const formatValue = (item: UnmatchedResultDto) => {
    if (item.resultValue !== null) {
      return `${item.resultValue}${item.unit ? ` ${item.unit}` : ''}`;
    }
    if (item.resultText) {
      return item.resultText;
    }
    return '—';
  };

  const columns: ColumnsType<UnmatchedResultDto> = [
    {
      title: 'Received',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      width: 140,
      render: (date: string) => dayjs(date).format('MM-DD HH:mm:ss'),
    },
    {
      title: 'Sample ID',
      dataIndex: 'sampleIdentifier',
      key: 'sampleIdentifier',
      width: 120,
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Instrument Code',
      dataIndex: 'instrumentCode',
      key: 'instrumentCode',
      width: 120,
      render: (code: string) => <Text strong>{code}</Text>,
    },
    {
      title: 'Test Name',
      dataIndex: 'instrumentTestName',
      key: 'instrumentTestName',
      width: 200,
      render: (name: string | null) => name || '—',
    },
    {
      title: 'Result',
      key: 'result',
      width: 120,
      render: (_, record) => (
        <Space>
          <Text>{formatValue(record)}</Text>
          {record.flag && (
            <Tag color={record.flag === 'N' ? 'green' : record.flag.includes('H') ? 'red' : 'blue'}>
              {record.flag}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 140,
      render: (reason: string) => (
        <Tag color={reasonColors[reason] || 'default'} icon={<WarningOutlined />}>
          {reasonLabels[reason] || reason}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Badge
          status={status === 'PENDING' ? 'processing' : status === 'RESOLVED' ? 'success' : 'default'}
          text={status}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View Details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleOpenDetail(record)} />
          </Tooltip>
          {record.status === 'PENDING' && (
            <>
              <Tooltip title="Attach to OrderTest">
                <Button size="small" type="primary" icon={<LinkOutlined />} onClick={() => handleOpenResolve(record)} />
              </Tooltip>
              <Popconfirm
                title="Discard this unmatched result?"
                onConfirm={() => handleResolve('DISCARD', record)}
              >
                <Tooltip title="Discard">
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>Unmatched Instrument Results</Title>

      {/* Statistics */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic title="Pending" value={stats.pending} valueStyle={{ color: '#1890ff' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="Resolved" value={stats.resolved} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="Discarded" value={stats.discarded} valueStyle={{ color: '#999' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="Total" value={stats.pending + stats.resolved + stats.discarded} />
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Search
            placeholder="Search sample ID or instrument code"
            allowClear
            style={{ width: 250 }}
            onSearch={setSearch}
          />
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: 150 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'PENDING', label: 'Pending' },
              { value: 'RESOLVED', label: 'Resolved' },
              { value: 'DISCARDED', label: 'Discarded' },
            ]}
          />
          <Select
            placeholder="Filter by reason"
            allowClear
            style={{ width: 200 }}
            value={reasonFilter}
            onChange={setReasonFilter}
            options={Object.entries(reasonLabels).map(([value, label]) => ({ value, label }))}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Refresh
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: size,
            total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `Total ${total} unmatched results`,
          }}
          scroll={{ x: 1200 }}
          size="small"
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title="Unmatched Result Details"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={700}
      >
        {selectedItem && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Sample Identifier">
              <Text code>{selectedItem.sampleIdentifier}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Instrument Code">
              <Text strong>{selectedItem.instrumentCode}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Test Name">{selectedItem.instrumentTestName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Result">
              <Space>
                <Text>{formatValue(selectedItem)}</Text>
                {selectedItem.flag && (
                  <Tag color={selectedItem.flag === 'N' ? 'green' : selectedItem.flag.includes('H') ? 'red' : 'blue'}>
                    {selectedItem.flag}
                  </Tag>
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Reference Range">{selectedItem.referenceRange || '—'}</Descriptions.Item>
            <Descriptions.Item label="Reason">
              <Tag color={reasonColors[selectedItem.reason] || 'default'} icon={<WarningOutlined />}>
                {reasonLabels[selectedItem.reason] || selectedItem.reason}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Details">{selectedItem.details || '—'}</Descriptions.Item>
            <Descriptions.Item label="Received At">{dayjs(selectedItem.receivedAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Badge
                status={selectedItem.status === 'PENDING' ? 'processing' : selectedItem.status === 'RESOLVED' ? 'success' : 'default'}
                text={selectedItem.status}
              />
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Resolve Modal */}
      <Modal
        title="Resolve Unmatched Result"
        open={resolveModalOpen}
        onCancel={() => setResolveModalOpen(false)}
        footer={null}
        width={600}
      >
        {selectedItem && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Text strong>Sample:</Text> <Text code>{selectedItem.sampleIdentifier}</Text>
              <br />
              <Text strong>Instrument Code:</Text> <Text>{selectedItem.instrumentCode}</Text>
              <br />
              <Text strong>Result:</Text> <Text>{formatValue(selectedItem)}</Text>
            </div>

            <div>
              <Text strong>Action:</Text>
              <br />
              <Space>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  onClick={() => handleResolve('ATTACH')}
                  loading={resolving}
                  disabled={!selectedOrderTestId}
                >
                  Attach to OrderTest
                </Button>
                <Popconfirm
                  title="Discard this unmatched result?"
                  onConfirm={() => handleResolve('DISCARD')}
                >
                  <Button danger icon={<DeleteOutlined />} loading={resolving}>
                    Discard
                  </Button>
                </Popconfirm>
              </Space>
            </div>

            <div>
              <Text strong>OrderTest ID (UUID):</Text>
              <Input
                placeholder="Enter OrderTest UUID to attach"
                value={selectedOrderTestId}
                onChange={(e) => setSelectedOrderTestId(e.target.value)}
                style={{ marginTop: 8 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Find the OrderTest ID from the worklist or order details
              </Text>
            </div>

            <div>
              <Text strong>Notes:</Text>
              <Input.TextArea
                rows={3}
                placeholder="Optional notes about this resolution"
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                style={{ marginTop: 8 }}
              />
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
}
