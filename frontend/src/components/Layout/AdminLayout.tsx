import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  DatePicker,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LinkOutlined,
  LogoutOutlined,
  UnorderedListOutlined,
  QrcodeOutlined,
  TeamOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAdminImpersonationStatus,
  getAdminLabs,
  startAdminImpersonation,
  stopAdminImpersonation,
  createAdminImpersonationLabPortalToken,
  type AdminImpersonationStatusDto,
  type AdminLabDto,
} from '../../api/client';
import {
  ADMIN_DATE_RANGE_EVENT,
  ADMIN_DATE_RANGE_KEY,
  ADMIN_LAB_SCOPE_EVENT,
  ADMIN_SELECTED_LAB_KEY,
  type AdminDatePreset,
  type StoredAdminDateRange,
} from '../../utils/admin-ui';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

function getPresetRange(preset: Exclude<AdminDatePreset, 'custom'>): [Dayjs, Dayjs] {
  const end = dayjs().endOf('day');
  if (preset === 'today') {
    return [dayjs().startOf('day'), end];
  }
  if (preset === '7d') {
    return [dayjs().subtract(6, 'day').startOf('day'), end];
  }
  return [dayjs().subtract(29, 'day').startOf('day'), end];
}

function resolveEnvironmentTag(): { label: string; color: string } {
  const value = (import.meta.env.VITE_APP_ENV as string | undefined) || import.meta.env.MODE || 'development';
  const normalized = value.toLowerCase();
  if (normalized === 'production' || normalized === 'prod') return { label: 'PROD', color: 'red' };
  if (normalized === 'staging' || normalized === 'stage') return { label: 'STAGE', color: 'gold' };
  if (normalized === 'pilot') return { label: 'PILOT', color: 'blue' };
  return { label: 'DEV', color: 'default' };
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, setAccessToken } = useAuth();
  const [labs, setLabs] = useState<AdminLabDto[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<AdminDatePreset>('7d');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(getPresetRange('7d'));
  const [impersonation, setImpersonation] = useState<AdminImpersonationStatusDto>({
    active: false,
    labId: null,
    lab: null,
  });
  const [impersonationModalOpen, setImpersonationModalOpen] = useState(false);
  const [impersonationSubmitting, setImpersonationSubmitting] = useState(false);
  const [stopImpersonationSubmitting, setStopImpersonationSubmitting] = useState(false);
  const [openLabSubmitting, setOpenLabSubmitting] = useState(false);
  const [impersonationForm] = Form.useForm<{ labId: string; reason: string }>();

  const isAuditor = user?.role === 'AUDITOR';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const hostLabel = typeof window !== 'undefined' ? window.location.host : 'admin.localhost';
  const envTag = resolveEnvironmentTag();

  const selectedLab = useMemo(
    () => labs.find((lab) => lab.id === selectedLabId) ?? null,
    [labs, selectedLabId],
  );

  const scopeLabel = useMemo(() => {
    if (!selectedLabId) return 'Scope: All Labs';
    if (!selectedLab) return 'Scope: Selected Lab';
    return `Scope: ${selectedLab.name} (${selectedLab.subdomain || selectedLab.code})`;
  }, [selectedLab, selectedLabId]);

  const selectedMenuKey = useMemo(() => {
    if (location.pathname === '/') return '/';
    if (location.pathname === '/labs') return '/labs';
    if (location.pathname.startsWith('/orders')) return '/orders';
    if (location.pathname.startsWith('/audit')) return '/audit';
    if (location.pathname.startsWith('/labs/users')) return '/labs/users';
    if (location.pathname.startsWith('/labs/online-results')) return '/labs/online-results';
    if (location.pathname.startsWith('/labs/report-design')) return '/labs/report-design';
    if (location.pathname.startsWith('/settings')) return '/settings';
    if (location.pathname.startsWith('/labs/')) return '/labs';
    return '/';
  }, [location.pathname]);

  const persistDateRange = (preset: AdminDatePreset, range: [Dayjs, Dayjs]) => {
    const payload: StoredAdminDateRange = {
      preset,
      start: range[0].toISOString(),
      end: range[1].toISOString(),
    };
    localStorage.setItem(ADMIN_DATE_RANGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(ADMIN_DATE_RANGE_EVENT, { detail: payload }));
  };

  const applyLabScope = useCallback((labId: string | null) => {
    if (labId) {
      localStorage.setItem(ADMIN_SELECTED_LAB_KEY, labId);
      setSelectedLabId(labId);
      window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId } }));
      return;
    }
    localStorage.removeItem(ADMIN_SELECTED_LAB_KEY);
    setSelectedLabId(null);
    window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId: null } }));
  }, []);

  const loadLabs = useCallback(async () => {
    try {
      const items = await getAdminLabs();
      setLabs(items);
    } catch {
      setLabs([]);
      message.warning('Could not load labs for scope display');
    }
  }, []);

  const loadImpersonation = useCallback(async () => {
    if (!isSuperAdmin) {
      setImpersonation({ active: false, labId: null, lab: null });
      return;
    }
    try {
      const status = await getAdminImpersonationStatus();
      setImpersonation(status);
      if (status.active && status.labId) {
        applyLabScope(status.labId);
      }
    } catch {
      setImpersonation({ active: false, labId: null, lab: null });
      message.warning('Could not load impersonation status');
    }
  }, [applyLabScope, isSuperAdmin]);

  useEffect(() => {
    void loadLabs();
    void loadImpersonation();
  }, [loadImpersonation, loadLabs]);

  useEffect(() => {
    const storedLabId = localStorage.getItem(ADMIN_SELECTED_LAB_KEY);
    setSelectedLabId(storedLabId);

    const storedDateRange = localStorage.getItem(ADMIN_DATE_RANGE_KEY);
    if (!storedDateRange) {
      const fallback = getPresetRange('7d');
      setDatePreset('7d');
      setCustomRange(fallback);
      persistDateRange('7d', fallback);
      return;
    }

    try {
      const parsed = JSON.parse(storedDateRange) as StoredAdminDateRange;
      const start = dayjs(parsed.start);
      const end = dayjs(parsed.end);
      if (!start.isValid() || !end.isValid()) throw new Error('Invalid range');
      setDatePreset(parsed.preset || '7d');
      setCustomRange([start, end]);
    } catch {
      const fallback = getPresetRange('7d');
      setDatePreset('7d');
      setCustomRange(fallback);
      persistDateRange('7d', fallback);
    }
  }, []);

  useEffect(() => {
    const syncLabScope = () => {
      setSelectedLabId(localStorage.getItem(ADMIN_SELECTED_LAB_KEY));
    };

    window.addEventListener(ADMIN_LAB_SCOPE_EVENT, syncLabScope as EventListener);
    window.addEventListener('storage', syncLabScope);
    return () => {
      window.removeEventListener(ADMIN_LAB_SCOPE_EVENT, syncLabScope as EventListener);
      window.removeEventListener('storage', syncLabScope);
    };
  }, []);

  const handlePresetChange = (value: string | number) => {
    const preset = value as AdminDatePreset;
    setDatePreset(preset);
    if (preset === 'custom') {
      const fallback = customRange ?? getPresetRange('7d');
      setCustomRange(fallback);
      persistDateRange('custom', fallback);
      return;
    }
    const range = getPresetRange(preset);
    setCustomRange(range);
    persistDateRange(preset, range);
  };

  const handleCustomRangeChange = (value: [Dayjs, Dayjs] | null) => {
    if (!value) return;
    setCustomRange(value);
    persistDateRange('custom', value);
  };

  const openStartImpersonation = () => {
    if (!isSuperAdmin) return;
    impersonationForm.resetFields();
    impersonationForm.setFieldsValue({
      labId: selectedLabId ?? undefined,
      reason: '',
    });
    setImpersonationModalOpen(true);
  };

  const handleStartImpersonation = async () => {
    if (!isSuperAdmin) return;
    const values = await impersonationForm.validateFields().catch(() => null);
    if (!values) return;

    setImpersonationSubmitting(true);
    try {
      const response = await startAdminImpersonation({
        labId: values.labId,
        reason: values.reason.trim(),
      });
      setAccessToken(response.accessToken);
      setImpersonation(response.impersonation);
      applyLabScope(response.impersonation.labId ?? null);
      setImpersonationModalOpen(false);
      message.success('Impersonation started');
    } catch {
      message.error('Failed to start impersonation');
    } finally {
      setImpersonationSubmitting(false);
    }
  };

  const handleStopImpersonation = async () => {
    if (!isSuperAdmin || !impersonation.active) return;
    setStopImpersonationSubmitting(true);
    try {
      const response = await stopAdminImpersonation();
      setAccessToken(response.accessToken);
      setImpersonation(response.impersonation);
      applyLabScope(null);
      message.success('Impersonation stopped');
    } catch {
      message.error('Failed to stop impersonation');
    } finally {
      setStopImpersonationSubmitting(false);
    }
  };

  const handleOpenLabPanel = async () => {
    if (!isSuperAdmin || !impersonation.active) return;
    setOpenLabSubmitting(true);
    try {
      const response = await createAdminImpersonationLabPortalToken();
      const targetUrl = buildLabPortalUrl(response.lab.subdomain, response.bridgeToken);
      if (!targetUrl) {
        message.error('Unable to resolve lab portal URL');
        return;
      }
      const openedTab = window.open(targetUrl, '_blank', 'noopener,noreferrer');
      if (!openedTab) {
        message.warning('Popup blocked. Please allow popups and try again.');
        return;
      }
      message.success('Lab panel opened in a new tab');
    } catch (error: unknown) {
      const errorMessage =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
          : null;
      const normalized = Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage;
      message.error(normalized || 'Failed to open lab panel');
    } finally {
      setOpenLabSubmitting(false);
    }
  };

  const buildLabPortalUrl = (labSubdomain: string | null, bridgeToken: string): string | null => {
    const normalizedSubdomain = labSubdomain?.trim().toLowerCase() ?? '';
    if (!normalizedSubdomain || !/^[a-z0-9-]+$/.test(normalizedSubdomain)) {
      return null;
    }

    let targetHost: string | null = null;
    const currentHost = window.location.hostname.toLowerCase();
    if (currentHost === 'admin.localhost') {
      targetHost = `${normalizedSubdomain}.localhost`;
    } else if (currentHost.startsWith('admin.')) {
      const baseHost = currentHost.slice('admin.'.length);
      if (!baseHost) return null;
      targetHost = `${normalizedSubdomain}.${baseHost}`;
    }

    if (!targetHost) return null;

    const targetUrl = new URL(window.location.href);
    targetUrl.hostname = targetHost;
    targetUrl.pathname = '/login';
    targetUrl.search = '';
    targetUrl.hash = '';
    targetUrl.searchParams.set('bridgeToken', bridgeToken);
    return targetUrl.toString();
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#111827',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            columnGap: 12,
            width: '100%',
            height: '100%',
          }}
        >
          <Space size={8} style={{ minWidth: 0 }}>
            <Text style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>LIS Platform Admin</Text>
            <Tag color={envTag.color}>{envTag.label}</Tag>
            <Tag icon={<GlobalOutlined />} color="geekblue" style={{ marginInlineEnd: 0 }}>
              {hostLabel}
            </Tag>
            {isAuditor ? <Tag color="orange">READ-ONLY</Tag> : null}
          </Space>

          <Space size={8}>
            <Text style={{ color: 'rgba(255,255,255,0.85)' }}>Range</Text>
            <Segmented
              size="small"
              value={datePreset}
              options={[
                { label: 'Today', value: 'today' },
                { label: '7d', value: '7d' },
                { label: '30d', value: '30d' },
                { label: 'Custom', value: 'custom' },
              ]}
              onChange={handlePresetChange}
            />
            {datePreset === 'custom' ? (
              <RangePicker
                size="small"
                value={customRange}
                allowClear={false}
                onChange={(value) => handleCustomRangeChange(value as [Dayjs, Dayjs] | null)}
              />
            ) : null}
          </Space>

          <Space size="middle" style={{ justifySelf: 'end' }}>
            {isSuperAdmin ? (
              impersonation.active ? (
                <Space size={8}>
                  <Button
                    icon={<LinkOutlined />}
                    loading={openLabSubmitting}
                    onClick={() => void handleOpenLabPanel()}
                  >
                    Open Lab Panel
                  </Button>
                  <Button
                    danger
                    loading={stopImpersonationSubmitting}
                    onClick={() => void handleStopImpersonation()}
                  >
                    Stop impersonation
                  </Button>
                </Space>
              ) : (
                <Button onClick={openStartImpersonation}>Start impersonation</Button>
              )
            ) : null}
            <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{user?.username}</Text>
            <Button icon={<LogoutOutlined />} onClick={handleLogout}>
              Log out
            </Button>
          </Space>
        </div>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: '#e5edf7' }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedMenuKey]}
            items={[
              { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
              { key: '/labs', icon: <ApartmentOutlined />, label: 'Labs' },
              { key: '/orders', icon: <UnorderedListOutlined />, label: 'Orders' },
              { key: '/audit', icon: <FileSearchOutlined />, label: 'Audit Logs' },
              { key: '/labs/users', icon: <TeamOutlined />, label: 'Lab Users' },
              { key: '/labs/online-results', icon: <QrcodeOutlined />, label: 'Online Results QR' },
              { key: '/labs/report-design', icon: <FileTextOutlined />, label: 'Report Design' },
              { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
            ]}
            onClick={({ key }) => navigate(key)}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: '#dce5f0' }}>
          <div style={{ marginBottom: 12 }}>
            <Space size={12} wrap>
              <Badge status={selectedLabId ? 'processing' : 'default'} text={<Text strong>{scopeLabel}</Text>} />
              {impersonation.active ? (
                <Tag color="volcano" style={{ marginInlineEnd: 0 }}>
                  Impersonating: {impersonation.lab?.name ?? impersonation.labId}
                </Tag>
              ) : null}
              {isAuditor ? (
                <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                  Read-only mode
                </Tag>
              ) : null}
            </Space>
          </div>
          <Outlet />
        </Content>
      </Layout>
      <Modal
        title="Start lab impersonation"
        open={impersonationModalOpen}
        onCancel={() => setImpersonationModalOpen(false)}
        onOk={() => void handleStartImpersonation()}
        confirmLoading={impersonationSubmitting}
        okText="Start"
      >
        <Form form={impersonationForm} layout="vertical">
          <Form.Item
            name="labId"
            label="Lab"
            rules={[{ required: true, message: 'Please choose a lab' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={labs
                .filter((lab) => lab.isActive)
                .map((lab) => ({
                  value: lab.id,
                  label: `${lab.name} (${lab.code})`,
                }))}
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Reason (required for audit)"
            rules={[
              { required: true, message: 'Please enter reason' },
              { min: 3, message: 'Reason must be at least 3 characters' },
            ]}
          >
            <Input.TextArea rows={3} placeholder="Example: Investigating lab workflow issue." />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
