import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SkinOutlined,
} from '@ant-design/icons';
import {
  getAdminPlatformSettingsOverview,
  getAdminSystemHealth,
  type AdminPlatformSettingsOverviewDto,
  type AdminSystemHealthDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Text } = Typography;

export function AdminSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [systemHealth, setSystemHealth] = useState<AdminSystemHealthDto | null>(null);
  const [settings, setSettings] = useState<AdminPlatformSettingsOverviewDto | null>(null);

  const isAuditor = user?.role === 'AUDITOR';

  const load = async () => {
    setLoading(true);
    try {
      const [health, overview] = await Promise.all([
        getAdminSystemHealth(),
        getAdminPlatformSettingsOverview(),
      ]);
      setSystemHealth(health);
      setSettings(overview);
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to load admin settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ marginTop: 0 }}>
            <SettingOutlined style={{ marginRight: 8 }} />
            Settings
          </Title>
          <Text type="secondary">Platform-wide configuration and health overview.</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          Refresh
        </Button>
      </Space>

      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        message="Safe mode"
        description="This page is currently focused on secure read-only platform controls. Mutable settings will be enabled in controlled phases."
      />

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} lg={12}>
          <Card title={<><SkinOutlined style={{ marginRight: 8 }} />Branding</>} loading={loading}>
            {!settings ? null : (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Theme color">{settings.branding.themeColor}</Descriptions.Item>
                <Descriptions.Item label="Logo upload">
                  {settings.branding.logoUploadEnabled ? (
                    <Tag color="green">Enabled</Tag>
                  ) : (
                    <Tag color="default">Planned</Tag>
                  )}
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={<><SafetyCertificateOutlined style={{ marginRight: 8 }} />Security Policy</>} loading={loading}>
            {!settings ? null : (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Session timeout">
                  {settings.securityPolicy.sessionTimeoutMinutes} minutes
                </Descriptions.Item>
                <Descriptions.Item label="Password min length">
                  {settings.securityPolicy.passwordMinLength}
                </Descriptions.Item>
                <Descriptions.Item label="Strong password required">
                  <Tag color={settings.securityPolicy.requireStrongPassword ? 'green' : 'orange'}>
                    {settings.securityPolicy.requireStrongPassword ? 'Yes' : 'No'}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Admin MFA" loading={loading}>
            {!settings ? null : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="MFA policy mode">
                    <Tag color={settings.mfa.mode === 'REQUIRED' ? 'red' : 'blue'}>
                      {settings.mfa.mode}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Enabled accounts">
                    {settings.mfa.enabledAccounts}/{settings.mfa.totalAccounts}
                  </Descriptions.Item>
                </Descriptions>
                <Space>
                  <Switch disabled checked={settings.mfa.mode === 'REQUIRED'} />
                  <Text type="secondary">Global MFA enforcement toggle (coming in next hardening step)</Text>
                </Space>
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="System Health" loading={loading}>
            {!systemHealth ? null : (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Overall status">
                  <Tag color={systemHealth.status === 'ok' ? 'green' : 'orange'}>
                    {systemHealth.status.toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Environment">{systemHealth.environment}</Descriptions.Item>
                <Descriptions.Item label="Uptime">{formatDuration(systemHealth.uptimeSeconds)}</Descriptions.Item>
                <Descriptions.Item label="DB status">
                  <Tag color={systemHealth.db.connected ? 'green' : 'red'}>
                    {systemHealth.db.connected ? 'Connected' : 'Disconnected'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="DB server time">
                  {systemHealth.db.serverTime ? formatDate(systemHealth.db.serverTime) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Last checked">{formatDate(systemHealth.checkedAt)}</Descriptions.Item>
                {systemHealth.db.error ? (
                  <Descriptions.Item label="DB error">
                    <Text type="danger">{systemHealth.db.error}</Text>
                  </Descriptions.Item>
                ) : null}
              </Descriptions>
            )}
          </Card>
        </Col>
      </Row>

      {isAuditor ? (
        <Alert
          style={{ marginTop: 16 }}
          type="warning"
          showIcon
          message="Read-only mode"
          description="You are signed in as AUDITOR. Configuration changes are restricted."
        />
      ) : null}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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

