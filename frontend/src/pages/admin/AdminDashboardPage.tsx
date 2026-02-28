import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  createAdminLab,
  getAdminLabs,
  getAdminSummary,
  getAdminSystemHealth,
  type AdminLabDto,
  type AdminSummaryDto,
  type AdminSystemHealthDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  ADMIN_DATE_RANGE_EVENT,
  ADMIN_DATE_RANGE_KEY,
  ADMIN_LAB_SCOPE_EVENT,
  ADMIN_SELECTED_LAB_KEY,
  type StoredAdminDateRange,
} from '../../utils/admin-ui';

const { Title, Text } = Typography;

interface CreateLabFormValues {
  code: string;
  name: string;
  subdomain?: string;
  timezone?: string;
  isActive: boolean;
}

export function AdminDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<CreateLabFormValues>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [summary, setSummary] = useState<AdminSummaryDto | null>(null);
  const [systemHealth, setSystemHealth] = useState<AdminSystemHealthDto | null>(null);
  const [labs, setLabs] = useState<AdminLabDto[]>([]);
  const [scopeLabId, setScopeLabId] = useState<string | undefined>(undefined);
  const [scopeDateRange, setScopeDateRange] = useState<[Date, Date]>(() => getDateRangeFromStorage());

  const canCreateLab = user?.role === 'SUPER_ADMIN';

  const selectedScopeLab = useMemo(
    () => labs.find((lab) => lab.id === scopeLabId) ?? null,
    [labs, scopeLabId],
  );
  const scopeLabel = selectedScopeLab
    ? `${selectedScopeLab.name} (${selectedScopeLab.subdomain || selectedScopeLab.code})`
    : 'All Labs';

  const syncGlobalScope = () => {
    const storedLabId = localStorage.getItem(ADMIN_SELECTED_LAB_KEY) || undefined;
    setScopeLabId(storedLabId);
    setScopeDateRange(getDateRangeFromStorage());
  };

  const loadDashboard = async (withLoading = true): Promise<void> => {
    if (withLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const [summaryData, labsData, healthData] = await Promise.all([
        getAdminSummary({
          labId: scopeLabId,
          dateFrom: scopeDateRange[0].toISOString(),
          dateTo: scopeDateRange[1].toISOString(),
        }),
        getAdminLabs(),
        getAdminSystemHealth(),
      ]);
      setSummary(summaryData);
      setLabs(labsData);
      setSystemHealth(healthData);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setError(msg || 'Failed to load platform dashboard');
    } finally {
      if (withLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    syncGlobalScope();
  }, []);

  useEffect(() => {
    const handleScopeChange = () => {
      syncGlobalScope();
    };
    window.addEventListener(ADMIN_LAB_SCOPE_EVENT, handleScopeChange as EventListener);
    window.addEventListener(ADMIN_DATE_RANGE_EVENT, handleScopeChange as EventListener);
    window.addEventListener('storage', handleScopeChange);
    return () => {
      window.removeEventListener(ADMIN_LAB_SCOPE_EVENT, handleScopeChange as EventListener);
      window.removeEventListener(ADMIN_DATE_RANGE_EVENT, handleScopeChange as EventListener);
      window.removeEventListener('storage', handleScopeChange);
    };
  }, []);

  useEffect(() => {
    void loadDashboard(true);
  }, [scopeLabId, scopeDateRange]);

  const handleCreateLab = async (): Promise<void> => {
    if (!canCreateLab) {
      message.warning('Read-only mode: AUDITOR cannot create labs');
      return;
    }
    try {
      const values = await form.validateFields();
      setCreating(true);
      await createAdminLab({
        code: values.code.trim(),
        name: values.name.trim(),
        subdomain: values.subdomain?.trim() || undefined,
        timezone: values.timezone?.trim() || undefined,
        isActive: values.isActive,
      });
      message.success('Lab created');
      setCreateOpen(false);
      form.resetFields();
      await loadDashboard(false);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return;
      }
      const msg = getErrorMessage(err);
      message.error(msg || 'Failed to create lab');
    } finally {
      setCreating(false);
    }
  };

  const trendMax = Math.max(...(summary?.ordersTrend.map((item) => item.ordersCount) ?? [0]), 1);
  const topTestMax = Math.max(...(summary?.topTests.map((item) => item.ordersCount) ?? [0]), 1);

  const leaderboardColumns: ColumnsType<NonNullable<AdminSummaryDto['ordersByLab']>[number]> = [
    {
      title: 'Lab',
      key: 'lab',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.labName}</Text>
          <Text type="secondary">{row.labCode}</Text>
        </Space>
      ),
    },
    {
      title: 'Orders',
      dataIndex: 'ordersCount',
      key: 'ordersCount',
      width: 110,
      align: 'right',
    },
    {
      title: 'Pending',
      dataIndex: 'pendingResultsCount',
      key: 'pendingResultsCount',
      width: 110,
      align: 'right',
    },
    {
      title: 'Completion',
      key: 'completionRate',
      width: 200,
      render: (_, row) => (
        <Progress
          percent={Math.round(row.completionRate * 100)}
          size="small"
          strokeColor={row.completionRate >= 0.75 ? '#52c41a' : row.completionRate >= 0.5 ? '#1677ff' : '#faad14'}
        />
      ),
    },
  ];

  if (loading && !summary) {
    return (
      <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
            Platform Dashboard
          </Title>
          <Space size={8} wrap>
            <Text type="secondary">Global overview across labs with security-focused alerts.</Text>
            <Tag color="blue">Scope: {scopeLabel}</Tag>
          </Space>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadDashboard(false)}>
            Refresh
          </Button>
          <Button onClick={() => navigate('/audit')}>View Audit Logs</Button>
          {canCreateLab ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Create Lab
            </Button>
          ) : null}
        </Space>
      </Space>

      {error ? <Alert style={{ marginTop: 16 }} type="error" message={error} showIcon /> : null}

      {summary ? (
        <>
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="Active Labs"
                  value={summary.activeLabsCount}
                  suffix={`/ ${summary.labsCount}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="Total Patients" value={summary.totalPatientsCount} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="Orders Today" value={summary.ordersTodayCount} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="Pending Results" value={summary.pendingResultsCount} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic title="Completed Today" value={summary.completedTodayCount} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Space direction="vertical" size={4}>
                  <Text type="secondary">
                    <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                    System Health
                  </Text>
                  <Tag color={systemHealth?.status === 'ok' ? 'green' : 'red'}>
                    {(systemHealth?.status || 'degraded').toUpperCase()}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Last check: {systemHealth ? formatDateTime(systemHealth.checkedAt) : '-'}
                  </Text>
                </Space>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col xs={24} xl={14}>
              <Card
                title="Orders Trend (Daily)"
                extra={
                  <Text type="secondary">
                    {dayjs(summary.dateRange.from).format('YYYY-MM-DD')} to{' '}
                    {dayjs(summary.dateRange.to).format('YYYY-MM-DD')}
                  </Text>
                }
              >
                {summary.ordersTrend.length === 0 ? (
                  <Text type="secondary">No trend data in selected range.</Text>
                ) : (
                  <div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${summary.ordersTrend.length}, minmax(6px, 1fr))`,
                        gap: 4,
                        alignItems: 'end',
                        height: 180,
                      }}
                    >
                      {summary.ordersTrend.map((point) => {
                        const height = Math.max(6, Math.round((point.ordersCount / trendMax) * 100));
                        return (
                          <div
                            key={point.date}
                            title={`${point.date}: ${point.ordersCount} orders`}
                            style={{
                              height: `${height}%`,
                              background: '#91caff',
                              border: '1px solid #69b1ff',
                              borderRadius: 3,
                            }}
                          />
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary">{summary.ordersTrend[0]?.date}</Text>
                      <Text type="secondary">{summary.ordersTrend[summary.ordersTrend.length - 1]?.date}</Text>
                    </div>
                  </div>
                )}
              </Card>
            </Col>

            <Col xs={24} xl={10}>
              <Card title="Top Tests">
                <List
                  dataSource={summary.topTests}
                  locale={{ emptyText: 'No test volume in selected range.' }}
                  renderItem={(item) => {
                    const percent = Math.round((item.ordersCount / topTestMax) * 100);
                    const verifyRate = item.ordersCount > 0 ? Math.round((item.verifiedCount / item.ordersCount) * 100) : 0;
                    return (
                      <List.Item>
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Text strong>{item.testName}</Text>
                            <Space size={8}>
                              <Tag color="blue">{item.testCode}</Tag>
                              <Text>{item.ordersCount}</Text>
                            </Space>
                          </Space>
                          <Progress percent={percent} size="small" showInfo={false} strokeColor="#1677ff" />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Verified: {item.verifiedCount}/{item.ordersCount} ({verifyRate}%)
                          </Text>
                        </Space>
                      </List.Item>
                    );
                  }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col xs={24} xl={14}>
              <Card title="Labs Activity Leaderboard">
                <Table
                  rowKey="labId"
                  columns={leaderboardColumns}
                  dataSource={summary.ordersByLab}
                  pagination={false}
                  locale={{ emptyText: 'No lab activity in selected range.' }}
                />
              </Card>
            </Col>

            <Col xs={24} xl={10}>
              <Card title={<><ExclamationCircleOutlined style={{ marginRight: 8 }} />Alerts</>}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert
                    type={summary.alerts.inactiveLabs.length > 0 ? 'warning' : 'success'}
                    showIcon
                    message={`Inactive labs (7d): ${summary.alerts.inactiveLabs.length}`}
                    description={
                      summary.alerts.inactiveLabs.length > 0
                        ? summary.alerts.inactiveLabs
                          .slice(0, 3)
                          .map((item) => `${item.labName} (${item.daysSinceLastOrder ?? '-'}d)`)
                          .join(', ')
                        : 'No inactive lab detected.'
                    }
                  />
                  <Alert
                    type={summary.alerts.highPendingLabs.length > 0 ? 'warning' : 'success'}
                    showIcon
                    message={`High pending labs: ${summary.alerts.highPendingLabs.length}`}
                    description={
                      summary.alerts.highPendingLabs.length > 0
                        ? summary.alerts.highPendingLabs
                          .slice(0, 3)
                          .map((item) => `${item.labName} (${Math.round(item.pendingRate * 100)}%)`)
                          .join(', ')
                        : 'Pending workload is within normal range.'
                    }
                  />
                  <Alert
                    type={summary.alerts.failedLoginsLast24h.totalCount > 0 ? 'error' : 'success'}
                    showIcon
                    message={`Failed logins (24h): ${summary.alerts.failedLoginsLast24h.totalCount}`}
                    description={`Platform: ${summary.alerts.failedLoginsLast24h.platformCount} | Lab: ${summary.alerts.failedLoginsLast24h.labCount}`}
                  />
                </Space>
              </Card>
            </Col>
          </Row>
        </>
      ) : null}

      <Modal
        title="Create New Lab"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        onOk={() => void handleCreateLab()}
        confirmLoading={creating}
        okText="Create"
        destroyOnClose
      >
        <Form<CreateLabFormValues>
          form={form}
          layout="vertical"
          initialValues={{ timezone: 'UTC', isActive: true }}
        >
          <Form.Item
            name="name"
            label="Lab Name"
            rules={[
              { required: true, message: 'Enter lab name' },
              { min: 2, message: 'Lab name is too short' },
            ]}
          >
            <Input placeholder="Main Lab" maxLength={255} />
          </Form.Item>
          <Form.Item
            name="code"
            label="Lab Code"
            rules={[
              { required: true, message: 'Enter lab code' },
              { min: 2, message: 'Code is too short' },
              { pattern: /^[A-Za-z0-9_-]+$/, message: 'Only letters, numbers, _ and - allowed' },
            ]}
          >
            <Input placeholder="LAB02" maxLength={32} />
          </Form.Item>
          <Form.Item
            name="subdomain"
            label="Subdomain (optional)"
            rules={[
              {
                pattern: /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
                message: 'Use lowercase letters, numbers, and - only',
              },
            ]}
          >
            <Input placeholder="lab02" maxLength={63} />
          </Form.Item>
          <Form.Item name="timezone" label="Timezone">
            <Input placeholder="UTC" maxLength={64} />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function getDateRangeFromStorage(): [Date, Date] {
  const fallback: [Date, Date] = [
    dayjs().subtract(6, 'day').startOf('day').toDate(),
    dayjs().endOf('day').toDate(),
  ];
  const raw = localStorage.getItem(ADMIN_DATE_RANGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as StoredAdminDateRange;
    const start = dayjs(parsed.start);
    const end = dayjs(parsed.end);
    if (!start.isValid() || !end.isValid()) return fallback;
    return [start.toDate(), end.toDate()];
  } catch {
    return fallback;
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
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
