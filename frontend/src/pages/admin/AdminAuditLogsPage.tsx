import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Modal,
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
  getAdminAuditActions,
  getAdminAuditEntityTypes,
  getAdminAuditLogs,
  getAdminLabs,
  exportAdminAuditLogsCsv,
  type AdminAuditLogItem,
  type AdminLabDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_DATE_RANGE_KEY, type StoredAdminDateRange } from '../../utils/admin-ui';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const DEFAULT_PAGE_SIZE = 25;

type ActorTypeFilter = '' | 'LAB_USER' | 'PLATFORM_USER';

export function AdminAuditLogsPage() {
  const { user } = useAuth();
  const [labs, setLabs] = useState<AdminLabDto[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [labId, setLabId] = useState<string | undefined>(undefined);
  const [actorType, setActorType] = useState<ActorTypeFilter>('');
  const [action, setAction] = useState<string | undefined>(undefined);
  const [entityType, setEntityType] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => getInitialDateRange());

  const [data, setData] = useState<AdminAuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AdminAuditLogItem | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportReason, setExportReason] = useState('');
  const [exporting, setExporting] = useState(false);

  const isAuditor = user?.role === 'AUDITOR';

  const loadOptions = async () => {
    setLoadingOptions(true);
    setFiltersError(null);
    try {
      const [labsData, actionsData, entityData] = await Promise.all([
        getAdminLabs(),
        getAdminAuditActions(),
        getAdminAuditEntityTypes(),
      ]);
      setLabs(labsData);
      setActions(actionsData);
      setEntityTypes(entityData);
    } catch (error) {
      setFiltersError(getErrorMessage(error) || 'Failed to load audit filters');
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    void loadOptions();
  }, []);

  useEffect(() => {
    const loadEntityTypes = async () => {
      try {
        const result = await getAdminAuditEntityTypes(labId);
        setEntityTypes(result);
      } catch {
        // keep previous options
      }
    };
    void loadEntityTypes();
  }, [labId]);

  const loadData = async () => {
    setLoading(true);
    setLogsError(null);
    try {
      const result = await getAdminAuditLogs({
        labId,
        actorType: actorType || undefined,
        action,
        entityType,
        search: searchApplied || undefined,
        dateFrom: dateRange[0].startOf('day').toISOString(),
        dateTo: dateRange[1].endOf('day').toISOString(),
        page,
        size,
      });
      setData(result.items);
      setTotal(result.total);
    } catch (error) {
      setLogsError(getErrorMessage(error) || 'Failed to load audit logs');
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [action, actorType, dateRange, entityType, labId, page, searchApplied, size]);

  const activeFilters = useMemo(() => {
    const filters: string[] = [];
    const selectedLab = labs.find((item) => item.id === labId);
    if (selectedLab) filters.push(`Lab: ${selectedLab.name}`);
    if (actorType) filters.push(`Actor: ${actorType === 'LAB_USER' ? 'Lab User' : 'Platform User'}`);
    if (action) filters.push(`Action: ${action}`);
    if (entityType) filters.push(`Entity: ${entityType}`);
    if (searchApplied) filters.push(`Search: ${searchApplied}`);
    filters.push(`Date: ${dateRange[0].format('YYYY-MM-DD')} to ${dateRange[1].format('YYYY-MM-DD')}`);
    return filters;
  }, [action, actorType, dateRange, entityType, labId, labs, searchApplied]);

  const columns: ColumnsType<AdminAuditLogItem> = [
    {
      title: 'Timestamp',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => formatDate(value),
    },
    {
      title: 'Actor',
      key: 'actor',
      width: 200,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.user?.fullName || row.user?.username || row.actorId || '-'}</Text>
          <Text type="secondary">{row.actorType ? row.actorType.replace('_', ' ') : '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Lab',
      key: 'lab',
      width: 180,
      render: (_, row) => row.lab?.name || '-',
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 220,
      render: (value: string) => <Tag color={value.startsWith('PLATFORM_') ? 'geekblue' : 'blue'}>{value}</Tag>,
    },
    {
      title: 'Entity',
      key: 'entity',
      width: 200,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text>{row.entityType || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.entityId || '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string | null) => value || '-',
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 140,
      render: (value: string | null) => value || '-',
    },
  ];

  const handleExport = async () => {
    const reason = exportReason.trim();
    if (reason.length < 3) {
      message.error('Please provide a reason (minimum 3 characters)');
      return;
    }

    setExporting(true);
    try {
      const { blob, fileName } = await exportAdminAuditLogsCsv({
        labId,
        actorType: actorType || undefined,
        action,
        entityType,
        search: searchApplied || undefined,
        dateFrom: dateRange[0].startOf('day').toISOString(),
        dateTo: dateRange[1].endOf('day').toISOString(),
        maxRows: 5000,
        reason,
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);

      message.success('Audit log export downloaded');
      setExportOpen(false);
      setExportReason('');
    } catch (error) {
      const blobMessage = await getBlobErrorMessage(error);
      message.error(blobMessage || getErrorMessage(error) || 'Failed to export audit logs');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        Audit Logs
      </Title>
      <Text type="secondary">Review platform and lab activity with advanced filters.</Text>

      <Card
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button onClick={() => void loadData()} disabled={loading}>
              Retry
            </Button>
            {!isAuditor ? (
              <Button onClick={() => setExportOpen(true)}>Export CSV</Button>
            ) : (
              <Tag color="orange">Export disabled for AUDITOR</Tag>
            )}
          </Space>
        }
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {filtersError ? (
            <Alert
              type="warning"
              showIcon
              message={filtersError}
              action={
                <Button size="small" onClick={() => void loadOptions()}>
                  Retry filters
                </Button>
              }
            />
          ) : null}

          <Space wrap>
            <Select
              allowClear
              loading={loadingOptions}
              placeholder="All labs"
              value={labId}
              style={{ width: 220 }}
              options={labs.map((lab) => ({
                value: lab.id,
                label: `${lab.name} (${lab.code})`,
              }))}
              onChange={(value) => {
                setLabId(value);
                setPage(1);
              }}
            />
            <Select<ActorTypeFilter>
              placeholder="All actor types"
              style={{ width: 180 }}
              value={actorType}
              options={[
                { value: '', label: 'All actor types' },
                { value: 'LAB_USER', label: 'Lab User' },
                { value: 'PLATFORM_USER', label: 'Platform User' },
              ]}
              onChange={(value) => {
                setActorType(value);
                setPage(1);
              }}
            />
            <Select
              allowClear
              loading={loadingOptions}
              placeholder="All actions"
              style={{ width: 240 }}
              value={action}
              options={actions.map((item) => ({ value: item, label: item }))}
              onChange={(value) => {
                setAction(value);
                setPage(1);
              }}
            />
            <Select
              allowClear
              loading={loadingOptions}
              placeholder="All entities"
              style={{ width: 190 }}
              value={entityType}
              options={entityTypes.map((item) => ({ value: item, label: item }))}
              onChange={(value) => {
                setEntityType(value);
                setPage(1);
              }}
            />
            <RangePicker
              value={dateRange}
              onChange={(value) => {
                if (!value) return;
                setDateRange(value as [Dayjs, Dayjs]);
                setPage(1);
              }}
            />
            <Input.Search
              allowClear
              placeholder="Search description, entity, user, action..."
              style={{ width: 320 }}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onSearch={(value) => {
                setSearchApplied(value.trim());
                setPage(1);
              }}
            />
            <Button
              onClick={() => {
                setLabId(undefined);
                setActorType('');
                setAction(undefined);
                setEntityType(undefined);
                setSearchText('');
                setSearchApplied('');
                setDateRange(getInitialDateRange());
                setPage(1);
                setSize(DEFAULT_PAGE_SIZE);
              }}
            >
              Reset filters
            </Button>
          </Space>

          <Space wrap>
            {activeFilters.map((item) => (
              <Tag key={item}>{item}</Tag>
            ))}
          </Space>

          {logsError ? (
            <Alert
              type="error"
              showIcon
              message={logsError}
              action={
                <Button size="small" onClick={() => void loadData()}>
                  Retry logs
                </Button>
              }
            />
          ) : null}

          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            locale={{ emptyText: 'No audit logs found for current filters.' }}
            onRow={(record) => ({
              onClick: () => {
                setSelectedItem(record);
                setDrawerOpen(true);
              },
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: page,
              pageSize: size,
              total,
              showSizeChanger: true,
              showTotal: (value) => `${value} log entries`,
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

      <Modal
        title="Export Audit Logs"
        open={exportOpen}
        onCancel={() => {
          if (exporting) return;
          setExportOpen(false);
          setExportReason('');
        }}
        onOk={() => void handleExport()}
        okText="Export CSV"
        okButtonProps={{ loading: exporting }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text>
            This export contains sensitive activity data and should be handled carefully.
          </Text>
          <Text type="secondary">Reason for export (required):</Text>
          <Input.TextArea
            rows={3}
            maxLength={300}
            value={exportReason}
            onChange={(event) => setExportReason(event.target.value)}
            placeholder="Example: Weekly compliance review"
          />
        </Space>
      </Modal>

      <Drawer
        title={selectedItem ? `${selectedItem.action} - ${formatDate(selectedItem.createdAt)}` : 'Audit detail'}
        width={760}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {!selectedItem ? (
          <Text type="secondary">Select a log row to view details.</Text>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Actor type">{selectedItem.actorType || '-'}</Descriptions.Item>
              <Descriptions.Item label="Actor">{selectedItem.user?.username || selectedItem.actorId || '-'}</Descriptions.Item>
              <Descriptions.Item label="Lab">{selectedItem.lab?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Action">{selectedItem.action}</Descriptions.Item>
              <Descriptions.Item label="Entity type">{selectedItem.entityType || '-'}</Descriptions.Item>
              <Descriptions.Item label="Entity ID">{selectedItem.entityId || '-'}</Descriptions.Item>
              <Descriptions.Item label="IP">{selectedItem.ipAddress || '-'}</Descriptions.Item>
              <Descriptions.Item label="User agent">{selectedItem.userAgent || '-'}</Descriptions.Item>
              <Descriptions.Item label="Description" span={2}>
                {selectedItem.description || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Card title="Metadata (JSON)" size="small">
              <Text strong>Old values</Text>
              <pre style={jsonStyle}>{prettyJson(selectedItem.oldValues)}</pre>
              <Text strong>New values</Text>
              <pre style={jsonStyle}>{prettyJson(selectedItem.newValues)}</pre>
            </Card>
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
      if (start.isValid() && end.isValid()) {
        return [start, end];
      }
    } catch {
      // ignore parse error
    }
  }
  return [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function prettyJson(value: Record<string, unknown> | null): string {
  if (!value) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

const jsonStyle: CSSProperties = {
  marginTop: 8,
  marginBottom: 16,
  maxHeight: 220,
  overflow: 'auto',
  padding: 10,
  background: '#0f172a',
  color: '#e2e8f0',
  borderRadius: 6,
  fontSize: 12,
};
