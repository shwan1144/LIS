import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Space,
  Tag,
  Input,
  Select,
  DatePicker,
  message,
  Typography,
  Tooltip,
  Modal,
  Descriptions,
  Button,
} from 'antd';
import {
  ReloadOutlined,
  EyeOutlined,
  UserOutlined,
  LoginOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getAuditLogs,
  getAuditActions,
  type AuditLogItem,
} from '../api/client';

const { Title, Text } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

// Action category colors and icons
const actionConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  LOGIN: { color: 'blue', icon: <LoginOutlined />, label: 'Login' },
  LOGOUT: { color: 'default', icon: <LoginOutlined />, label: 'Logout' },
  LOGIN_FAILED: { color: 'red', icon: <LoginOutlined />, label: 'Login Failed' },
  PATIENT_CREATE: { color: 'green', icon: <PlusOutlined />, label: 'Patient Created' },
  PATIENT_UPDATE: { color: 'orange', icon: <EditOutlined />, label: 'Patient Updated' },
  ORDER_CREATE: { color: 'green', icon: <PlusOutlined />, label: 'Order Created' },
  ORDER_UPDATE: { color: 'orange', icon: <EditOutlined />, label: 'Order Updated' },
  ORDER_CANCEL: { color: 'red', icon: <CloseCircleOutlined />, label: 'Order Cancelled' },
  RESULT_ENTER: { color: 'cyan', icon: <EditOutlined />, label: 'Result Entered' },
  RESULT_UPDATE: { color: 'orange', icon: <EditOutlined />, label: 'Result Updated' },
  RESULT_VERIFY: { color: 'green', icon: <CheckCircleOutlined />, label: 'Result Verified' },
  RESULT_REJECT: { color: 'red', icon: <CloseCircleOutlined />, label: 'Result Rejected' },
  TEST_CREATE: { color: 'green', icon: <PlusOutlined />, label: 'Test Created' },
  TEST_UPDATE: { color: 'orange', icon: <EditOutlined />, label: 'Test Updated' },
  TEST_DELETE: { color: 'red', icon: <DeleteOutlined />, label: 'Test Deleted' },
  USER_CREATE: { color: 'green', icon: <UserOutlined />, label: 'User Created' },
  USER_UPDATE: { color: 'orange', icon: <UserOutlined />, label: 'User Updated' },
  USER_DELETE: { color: 'red', icon: <UserOutlined />, label: 'User Deleted' },
  SHIFT_CREATE: { color: 'green', icon: <PlusOutlined />, label: 'Shift Created' },
  SHIFT_UPDATE: { color: 'orange', icon: <EditOutlined />, label: 'Shift Updated' },
  SHIFT_DELETE: { color: 'red', icon: <DeleteOutlined />, label: 'Shift Deleted' },
  DEPARTMENT_CREATE: { color: 'green', icon: <PlusOutlined />, label: 'Dept Created' },
  DEPARTMENT_UPDATE: { color: 'orange', icon: <EditOutlined />, label: 'Dept Updated' },
  DEPARTMENT_DELETE: { color: 'red', icon: <DeleteOutlined />, label: 'Dept Deleted' },
  REPORT_GENERATE: { color: 'purple', icon: <FileTextOutlined />, label: 'Report Generated' },
  REPORT_PRINT: { color: 'purple', icon: <FileTextOutlined />, label: 'Report Printed' },
};

export function AuditLogPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const [size] = useState(50);

  // Detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<AuditLogItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuditLogs({
        search: search.trim() || undefined,
        action: actionFilter,
        startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
        endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        page,
        size,
      });
      setData(result.items);
      setTotal(result.total);
    } catch {
      message.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, dateRange, page, size]);

  const loadActions = useCallback(async () => {
    try {
      const result = await getAuditActions();
      setActions(result);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const openDetailModal = (item: AuditLogItem) => {
    setDetailItem(item);
    setDetailModalOpen(true);
  };

  const formatJson = (obj: Record<string, unknown> | null) => {
    if (!obj) return '—';
    return JSON.stringify(obj, null, 2);
  };

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'User',
      key: 'user',
      width: 150,
      render: (_, record) => (
        <span>
          {record.user?.fullName || record.user?.username || '—'}
        </span>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 160,
      render: (action: string) => {
        const config = actionConfig[action] || { color: 'default', icon: null, label: action };
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: 'Entity',
      key: 'entity',
      width: 120,
      render: (_, record) => (
        <span>
          {record.entityType && (
            <Tag>{record.entityType}</Tag>
          )}
        </span>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string | null) => text || '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Tooltip title="View Details">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openDetailModal(record)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>Audit Log</Title>

      <Card>
        {/* Filters */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Search
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={() => loadData()}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="Action"
            value={actionFilter}
            onChange={setActionFilter}
            allowClear
            style={{ width: 180 }}
            options={actions.map((a) => ({
              value: a,
              label: actionConfig[a]?.label || a,
            }))}
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates)}
            allowClear
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
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            showTotal: (t) => `${t} log entries`,
          }}
          scroll={{ x: 900 }}
          size="small"
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title="Audit Log Details"
        open={detailModalOpen}
        onCancel={() => {
          setDetailModalOpen(false);
          setDetailItem(null);
        }}
        footer={null}
        width={700}
      >
        {detailItem && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Time" span={2}>
              {dayjs(detailItem.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="User">
              {detailItem.user?.fullName || detailItem.user?.username || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Username">
              {detailItem.user?.username || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Action" span={2}>
              {(() => {
                const config = actionConfig[detailItem.action] || { color: 'default', icon: null, label: detailItem.action };
                return (
                  <Tag color={config.color} icon={config.icon}>
                    {config.label}
                  </Tag>
                );
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="Entity Type">
              {detailItem.entityType || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Entity ID">
              <Text code style={{ fontSize: 11 }}>{detailItem.entityId || '—'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>
              {detailItem.description || '—'}
            </Descriptions.Item>
            {detailItem.oldValues && (
              <Descriptions.Item label="Old Values" span={2}>
                <pre style={{ margin: 0, fontSize: 11, maxHeight: 150, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                  {formatJson(detailItem.oldValues)}
                </pre>
              </Descriptions.Item>
            )}
            {detailItem.newValues && (
              <Descriptions.Item label="New Values" span={2}>
                <pre style={{ margin: 0, fontSize: 11, maxHeight: 150, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                  {formatJson(detailItem.newValues)}
                </pre>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="IP Address">
              {detailItem.ipAddress || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="User Agent">
              <Text ellipsis style={{ maxWidth: 200 }}>
                {detailItem.userAgent || '—'}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
