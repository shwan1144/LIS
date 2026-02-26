import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  ArrowLeftOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  QrcodeOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  getAdminLab,
  getAdminLabSettings,
  getAdminLabUsers,
  getAdminOrderResultsPdf,
  getAdminOrders,
  getAdminSummary,
  type AdminLabDto,
  type AdminOrderListItem,
  type AdminSummaryDto,
  type LabSettingsDto,
  type SettingsUserDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_DATE_RANGE_KEY, ADMIN_LAB_SCOPE_EVENT, ADMIN_SELECTED_LAB_KEY } from '../../utils/admin-ui';

const { Title, Text } = Typography;
const DEFAULT_PAGE_SIZE = 10;

type LabDetailTab = 'overview' | 'users' | 'orders' | 'results' | 'settings';
type OrderStatusFilter = '' | 'REGISTERED' | 'COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export function AdminLabDetailsPage() {
  const { labId } = useParams<{ labId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN';
  const canExportResults = user?.role === 'SUPER_ADMIN';

  const [lab, setLab] = useState<AdminLabDto | null>(null);
  const [loadingLab, setLoadingLab] = useState(false);

  const [activeTab, setActiveTab] = useState<LabDetailTab>('overview');

  const [summary, setSummary] = useState<AdminSummaryDto | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [users, setUsers] = useState<SettingsUserDto[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);

  const [settings, setSettings] = useState<LabSettingsDto | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersSize, setOrdersSize] = useState(DEFAULT_PAGE_SIZE);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersStatus, setOrdersStatus] = useState<OrderStatusFilter>('');
  const [ordersSearchText, setOrdersSearchText] = useState('');
  const [ordersSearchApplied, setOrdersSearchApplied] = useState('');

  const [resultsRows, setResultsRows] = useState<AdminOrderListItem[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsSize, setResultsSize] = useState(DEFAULT_PAGE_SIZE);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [resultsSearchText, setResultsSearchText] = useState('');
  const [resultsSearchApplied, setResultsSearchApplied] = useState('');

  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!labId) return;
    localStorage.setItem(ADMIN_SELECTED_LAB_KEY, labId);
    window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId } }));
  }, [labId]);

  useEffect(() => {
    if (!labId) return;
    const loadLab = async () => {
      setLoadingLab(true);
      try {
        const data = await getAdminLab(labId);
        setLab(data);
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load lab details');
        navigate('/labs', { replace: true });
      } finally {
        setLoadingLab(false);
      }
    };
    void loadLab();
  }, [labId, navigate]);

  useEffect(() => {
    if (!labId || activeTab !== 'overview') return;
    const [from, to] = getSavedDateRange();
    const loadSummary = async () => {
      setLoadingSummary(true);
      try {
        const data = await getAdminSummary({
          labId,
          dateFrom: from.toISOString(),
          dateTo: to.toISOString(),
        });
        setSummary(data);
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load lab overview');
      } finally {
        setLoadingSummary(false);
      }
    };
    void loadSummary();
  }, [activeTab, labId]);

  useEffect(() => {
    if (!labId || activeTab !== 'users' || usersLoaded) return;
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const data = await getAdminLabUsers(labId);
        setUsers(data);
        setUsersLoaded(true);
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load lab users');
      } finally {
        setLoadingUsers(false);
      }
    };
    void loadUsers();
  }, [activeTab, labId, usersLoaded]);

  useEffect(() => {
    if (!labId || activeTab !== 'settings' || settingsLoaded) return;
    const loadSettings = async () => {
      setLoadingSettings(true);
      try {
        const data = await getAdminLabSettings(labId);
        setSettings(data);
        setSettingsLoaded(true);
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load lab settings');
      } finally {
        setLoadingSettings(false);
      }
    };
    void loadSettings();
  }, [activeTab, labId, settingsLoaded]);

  useEffect(() => {
    if (!labId || activeTab !== 'orders') return;
    const [from, to] = getSavedDateRange();
    const loadOrders = async () => {
      setOrdersLoading(true);
      try {
        const data = await getAdminOrders({
          labId,
          status: ordersStatus || undefined,
          q: ordersSearchApplied || undefined,
          dateFrom: from.toISOString(),
          dateTo: to.toISOString(),
          page: ordersPage,
          size: ordersSize,
        });
        setOrders(data.items);
        setOrdersTotal(data.total);
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load lab orders');
      } finally {
        setOrdersLoading(false);
      }
    };
    void loadOrders();
  }, [activeTab, labId, ordersPage, ordersSearchApplied, ordersSize, ordersStatus]);

  useEffect(() => {
    if (!labId || activeTab !== 'results') return;
    const [from, to] = getSavedDateRange();
    const loadResults = async () => {
      setResultsLoading(true);
      try {
        const data = await getAdminOrders({
          labId,
          status: 'COMPLETED',
          q: resultsSearchApplied || undefined,
          dateFrom: from.toISOString(),
          dateTo: to.toISOString(),
          page: resultsPage,
          size: resultsSize,
        });
        setResultsRows(data.items);
        setResultsTotal(data.total);
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load lab results');
      } finally {
        setResultsLoading(false);
      }
    };
    void loadResults();
  }, [activeTab, labId, resultsPage, resultsSearchApplied, resultsSize]);

  const overviewActivity = useMemo(() => {
    if (!summary?.ordersByLab?.length) return null;
    return summary.ordersByLab[0] ?? null;
  }, [summary]);

  const userColumns: ColumnsType<SettingsUserDto> = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: 'Name', dataIndex: 'fullName', key: 'fullName', render: (value) => value || '-' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 180,
      render: (value: string) => <Tag color="blue">{value.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>),
    },
  ];

  const orderColumns: ColumnsType<AdminOrderListItem> = [
    { title: 'Date', dataIndex: 'registeredAt', key: 'registeredAt', width: 180, render: formatDate },
    { title: 'Order #', dataIndex: 'orderNumber', key: 'orderNumber', width: 140, render: (value) => value || '-' },
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
  ];

  const resultsColumns: ColumnsType<AdminOrderListItem> = [
    { title: 'Date', dataIndex: 'registeredAt', key: 'registeredAt', width: 180, render: formatDate },
    { title: 'Order #', dataIndex: 'orderNumber', key: 'orderNumber', width: 140, render: (value) => value || '-' },
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
      title: 'Verified',
      key: 'verified',
      width: 150,
      render: (_, row) => <Tag color="green">{row.verifiedTestsCount}/{row.testsCount}</Tag>,
    },
    {
      title: 'Flag',
      key: 'flag',
      width: 110,
      render: (_, row) => (row.hasCriticalFlag ? <Tag color="red">Critical</Tag> : '-'),
    },
    {
      title: 'Action',
      key: 'action',
      width: 180,
      render: (_, row) => (
        <Button
          size="small"
          onClick={() => void handleOpenPdf(row.id)}
          loading={downloadingOrderId === row.id}
          disabled={!canExportResults}
          icon={<FileTextOutlined />}
        >
          Open PDF
        </Button>
      ),
    },
  ];

  const handleOpenPdf = async (orderId: string) => {
    if (!canExportResults) {
      message.warning('Export is disabled for AUDITOR');
      return;
    }
    setDownloadingOrderId(orderId);
    try {
      const blob = await getAdminOrderResultsPdf(orderId);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      const blobMessage = await getBlobErrorMessage(error);
      message.error(blobMessage || getErrorMessage(error) || 'Failed to open results PDF');
    } finally {
      setDownloadingOrderId(null);
    }
  };

  if (!labId) {
    return <Empty description="Invalid lab id" />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/labs')}>
          Back to Labs
        </Button>
      </Space>

      <Card loading={loadingLab}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            {lab?.name || 'Lab'}
          </Title>
          <Space wrap>
            <Tag color="geekblue">{lab?.code || '-'}</Tag>
            <Tag>{lab?.subdomain || '-'}</Tag>
            <Tag color={lab?.isActive ? 'green' : 'red'}>{lab?.isActive ? 'Active' : 'Disabled'}</Tag>
            <Text type="secondary">Timezone: {lab?.timezone || '-'}</Text>
          </Space>
        </Space>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as LabDetailTab)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Space size={12} wrap style={{ width: '100%' }}>
                    <Card loading={loadingSummary} style={{ flex: '1 1 180px', minWidth: 180 }}>
                      <Statistic title="Orders in range" value={summary?.ordersCount ?? 0} />
                    </Card>
                    <Card loading={loadingSummary} style={{ flex: '1 1 180px', minWidth: 180 }}>
                      <Statistic title="Pending results" value={summary?.pendingResultsCount ?? 0} />
                    </Card>
                    <Card loading={loadingSummary} style={{ flex: '1 1 180px', minWidth: 180 }}>
                      <Statistic title="Completed today" value={summary?.completedTodayCount ?? 0} />
                    </Card>
                    <Card loading={loadingSummary} style={{ flex: '1 1 180px', minWidth: 180 }}>
                      <Statistic title="Patients (global)" value={summary?.totalPatientsCount ?? 0} />
                    </Card>
                  </Space>

                  <Card title="Lab Activity Snapshot" loading={loadingSummary}>
                    {!overviewActivity ? (
                      <Empty description="No activity in selected range" />
                    ) : (
                      <Descriptions size="small" bordered column={2}>
                        <Descriptions.Item label="Orders">{overviewActivity.ordersCount}</Descriptions.Item>
                        <Descriptions.Item label="Total tests">{overviewActivity.totalTestsCount}</Descriptions.Item>
                        <Descriptions.Item label="Verified">{overviewActivity.verifiedTestsCount}</Descriptions.Item>
                        <Descriptions.Item label="Pending">{overviewActivity.pendingResultsCount}</Descriptions.Item>
                        <Descriptions.Item label="Completion rate">
                          {overviewActivity.completionRate.toFixed(1)}%
                        </Descriptions.Item>
                        <Descriptions.Item label="Date range">
                          {summary?.dateRange
                            ? `${formatDate(summary.dateRange.from)} - ${formatDate(summary.dateRange.to)}`
                            : '-'}
                        </Descriptions.Item>
                      </Descriptions>
                    )}
                  </Card>
                </Space>
              ),
            },
            {
              key: 'users',
              label: 'Users',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                    <Text type="secondary">Users in this lab.</Text>
                    <Button
                      type="primary"
                      icon={<TeamOutlined />}
                      onClick={() => navigate('/labs/users')}
                      disabled={!canMutate}
                    >
                      Manage Users
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    loading={loadingUsers}
                    columns={userColumns}
                    dataSource={users}
                    pagination={{ pageSize: DEFAULT_PAGE_SIZE }}
                  />
                </Space>
              ),
            },
            {
              key: 'orders',
              label: 'Orders',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap>
                    <Select<OrderStatusFilter>
                      value={ordersStatus}
                      style={{ width: 180 }}
                      options={[
                        { label: 'All statuses', value: '' },
                        { label: 'Registered', value: 'REGISTERED' },
                        { label: 'Collected', value: 'COLLECTED' },
                        { label: 'In Progress', value: 'IN_PROGRESS' },
                        { label: 'Completed', value: 'COMPLETED' },
                        { label: 'Cancelled', value: 'CANCELLED' },
                      ]}
                      onChange={(value) => {
                        setOrdersStatus(value);
                        setOrdersPage(1);
                      }}
                    />
                    <Input.Search
                      allowClear
                      style={{ width: 340 }}
                      placeholder="Order #, patient, phone, national ID, barcode"
                      value={ordersSearchText}
                      onChange={(event) => setOrdersSearchText(event.target.value)}
                      onSearch={(value) => {
                        setOrdersSearchApplied(value.trim());
                        setOrdersPage(1);
                      }}
                    />
                    <Button onClick={() => navigate('/orders')}>Open full orders page</Button>
                  </Space>
                  <Table
                    rowKey="id"
                    loading={ordersLoading}
                    columns={orderColumns}
                    dataSource={orders}
                    pagination={{
                      current: ordersPage,
                      pageSize: ordersSize,
                      total: ordersTotal,
                      showSizeChanger: true,
                      onChange: (nextPage, nextSize) => {
                        setOrdersPage(nextPage);
                        if (nextSize && nextSize !== ordersSize) setOrdersSize(nextSize);
                      },
                    }}
                  />
                </Space>
              ),
            },
            {
              key: 'results',
              label: 'Results',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap>
                    <Input.Search
                      allowClear
                      style={{ width: 340 }}
                      placeholder="Order #, patient, phone, barcode"
                      value={resultsSearchText}
                      onChange={(event) => setResultsSearchText(event.target.value)}
                      onSearch={(value) => {
                        setResultsSearchApplied(value.trim());
                        setResultsPage(1);
                      }}
                    />
                    <Button icon={<FileSearchOutlined />} onClick={() => navigate('/orders')}>
                      Open full orders page
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    loading={resultsLoading}
                    columns={resultsColumns}
                    dataSource={resultsRows}
                    pagination={{
                      current: resultsPage,
                      pageSize: resultsSize,
                      total: resultsTotal,
                      showSizeChanger: true,
                      onChange: (nextPage, nextSize) => {
                        setResultsPage(nextPage);
                        if (nextSize && nextSize !== resultsSize) setResultsSize(nextSize);
                      },
                    }}
                  />
                </Space>
              ),
            },
            {
              key: 'settings',
              label: 'Settings',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Descriptions bordered size="small" column={2} loading={loadingSettings}>
                    <Descriptions.Item label="Online Results QR">
                      {settings?.enableOnlineResults ? (
                        <Tag color="green">Enabled</Tag>
                      ) : (
                        <Tag color="red">Disabled</Tag>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="Watermark Text">
                      {settings?.onlineResultWatermarkText || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Label Sequence">
                      {settings?.labelSequenceBy || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Sequence Reset">
                      {settings?.sequenceResetBy || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Report Banner">
                      {settings?.reportBranding?.bannerDataUrl ? 'Uploaded' : 'Default'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Report Footer">
                      {settings?.reportBranding?.footerDataUrl ? 'Uploaded' : 'Default'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Report Logo">
                      {settings?.reportBranding?.logoDataUrl ? 'Uploaded' : 'Default'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Report Watermark">
                      {settings?.reportBranding?.watermarkDataUrl ? 'Uploaded' : 'Default'}
                    </Descriptions.Item>
                  </Descriptions>

                  <Space wrap>
                    <Button
                      icon={<QrcodeOutlined />}
                      onClick={() => navigate('/labs/online-results')}
                      disabled={!canMutate}
                    >
                      Configure Online Results
                    </Button>
                    <Button
                      icon={<FileTextOutlined />}
                      onClick={() => navigate('/labs/report-design')}
                      disabled={!canMutate}
                    >
                      Configure Report Design
                    </Button>
                  </Space>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function getSavedDateRange(): [Dayjs, Dayjs] {
  const raw = localStorage.getItem(ADMIN_DATE_RANGE_KEY);
  if (!raw) {
    return [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')];
  }
  try {
    const parsed = JSON.parse(raw) as { start?: string; end?: string };
    const start = dayjs(parsed.start);
    const end = dayjs(parsed.end);
    if (!start.isValid() || !end.isValid()) {
      return [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')];
    }
    return [start, end];
  } catch {
    return [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')];
  }
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
