import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  DeploymentUnitOutlined,
  FileProtectOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { loginLab, loginLabViaBridgeToken, loginPlatform } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentAuthScope } from '../utils/tenant-scope';
import './LoginPage.css';

type LoginFormValues = {
  username?: string;
  email?: string;
  password: string;
  remember?: boolean;
};

const { Title, Text } = Typography;

function resolveLabBadge(hostname: string): string {
  const normalized = hostname.toLowerCase();
  if (!normalized || normalized === 'localhost' || normalized === '127.0.0.1') {
    return 'LOCAL LAB';
  }
  const first = normalized.split('.')[0] || '';
  if (!first || first === 'www') return 'LAB PORTAL';
  return first.toUpperCase();
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const raw =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
      : null;
  if (Array.isArray(raw)) {
    const joined = raw.join(', ').trim();
    return joined || fallback;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return fallback;
}

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [form] = Form.useForm<LoginFormValues>();

  const navigate = useNavigate();
  const currentScope = getCurrentAuthScope();
  const isAdminScope = currentScope === 'PLATFORM';
  const rememberKey = isAdminScope
    ? 'lis_login_hint_platform_email'
    : 'lis_login_hint_lab_username';
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
  const labBadge = useMemo(
    () => (isAdminScope ? 'PLATFORM ADMIN' : resolveLabBadge(hostname)),
    [hostname, isAdminScope],
  );

  const [bridgeToken] = useState<string | null>(() => {
    if (isAdminScope) return null;
    const token =
      new URL(window.location.href).searchParams.get('bridgeToken')?.trim() || null;
    return token && token.length > 0 ? token : null;
  });
  const bridgeLoginStartedRef = useRef(false);
  const { user, scope, login: setAuth, logout } = useAuth();

  useEffect(() => {
    const rememberedValue = localStorage.getItem(rememberKey)?.trim() || '';
    form.setFieldsValue({
      remember: rememberedValue.length > 0,
      ...(isAdminScope ? { email: rememberedValue } : { username: rememberedValue }),
    });
  }, [form, isAdminScope, rememberKey]);

  useEffect(() => {
    if (bridgeToken) {
      sessionStorage.removeItem('sessionExpired');
    } else if (sessionStorage.getItem('sessionExpired') === '1') {
      sessionStorage.removeItem('sessionExpired');
      message.info('Session expired. Please sign in again.');
    }
    if (!bridgeToken && user && scope && scope !== currentScope) {
      logout();
    }
  }, [bridgeToken, currentScope, logout, scope, user]);

  useEffect(() => {
    if (isAdminScope || !bridgeToken) return;
    if (bridgeLoginStartedRef.current) return;
    bridgeLoginStartedRef.current = true;

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('bridgeToken')) {
      currentUrl.searchParams.delete('bridgeToken');
      const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.history.replaceState(null, '', nextUrl);
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('lab');
    localStorage.removeItem('authScope');
    logout();

    const openLabPortal = async () => {
      setLoading(true);
      setAuthError(null);
      try {
        const res = await loginLabViaBridgeToken({ token: bridgeToken });
        setAuth({
          user: res.user,
          lab: res.lab,
          token: res.accessToken,
          scope: res.scope,
        });
        message.success('Opened lab panel');
        navigate('/', { replace: true });
      } catch (error: unknown) {
        const msg = extractErrorMessage(error, 'Failed to open lab panel');
        message.error(msg);
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    void openLabPortal();
  }, [bridgeToken, isAdminScope, logout, navigate, setAuth]);

  if (!bridgeToken && user && scope === currentScope) {
    return <Navigate to="/" replace />;
  }

  const handlePasswordKeyState = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(event.getModifierState('CapsLock'));
  };

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = isAdminScope
        ? await loginPlatform({
            email: (values.email || '').trim(),
            password: values.password,
          })
        : await loginLab({
            username: (values.username || '').trim(),
            password: values.password,
          });

      const identity = isAdminScope
        ? (values.email || '').trim()
        : (values.username || '').trim();
      if (values.remember && identity) {
        localStorage.setItem(rememberKey, identity);
      } else {
        localStorage.removeItem(rememberKey);
      }

      setAuth({
        user: res.user,
        lab: res.lab,
        token: res.accessToken,
        scope: res.scope,
      });
      message.success('Signed in successfully');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Unable to sign in. Check your credentials and try again.');
      setAuthError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const trustItems = [
    { icon: <SafetyCertificateOutlined />, text: 'Role-based access and session protection' },
    { icon: <FileProtectOutlined />, text: 'Audit logging for critical LIS actions' },
    { icon: <DeploymentUnitOutlined />, text: 'Designed for multi-lab operations' },
    { icon: <CheckCircleOutlined />, text: 'Reliable workflow for results and reporting' },
  ];

  return (
    <div className="login-shell">
      <div className="login-grid">
        <section className="login-brand-panel">
          <Tag color={isAdminScope ? 'gold' : 'cyan'} className="login-scope-tag">
            {isAdminScope ? 'PLATFORM PORTAL' : 'LAB PORTAL'}
          </Tag>
          <Title level={2} className="login-brand-title">
            Medical LIS Access
          </Title>
          <Text className="login-brand-subtitle">
            Secure, auditable sign-in for clinical laboratory workflows.
          </Text>
          <div className="login-badge-row">
            <Tag className="login-badge">{labBadge}</Tag>
            <Tag className="login-badge">AUDIT READY</Tag>
            <Tag className="login-badge">RLS ENABLED</Tag>
          </div>
          <div className="login-trust-list">
            {trustItems.map((item) => (
              <div className="login-trust-item" key={item.text}>
                <span className="login-trust-icon">{item.icon}</span>
                <Text>{item.text}</Text>
              </div>
            ))}
          </div>
        </section>

        <section className="login-form-panel">
          <Card className="login-card" bordered={false}>
            <Space direction="vertical" size={4} className="login-card-header">
              <Text type="secondary">Welcome back</Text>
              <Title level={3} style={{ margin: 0 }}>
                {isAdminScope ? 'Platform Admin Sign in' : 'Lab Staff Sign in'}
              </Title>
              <Text type="secondary">
                {isAdminScope
                  ? 'Use your platform administrator credentials.'
                  : `Connected to ${labBadge}.`}
              </Text>
            </Space>

            <Divider style={{ margin: '16px 0 18px' }} />

            {bridgeToken && !isAdminScope ? (
              <div className="login-bridge-state">
                <Spin size="large" />
                <Text style={{ marginTop: 12 }}>
                  Opening lab portal securely. Please wait.
                </Text>
              </div>
            ) : (
              <>
                {authError ? (
                  <Alert
                    type="error"
                    showIcon
                    message={authError}
                    style={{ marginBottom: 14 }}
                  />
                ) : null}

                <Form<LoginFormValues>
                  form={form}
                  name="login"
                  onFinish={onFinish}
                  autoComplete="off"
                  layout="vertical"
                  size="large"
                >
                  {isAdminScope ? (
                    <Form.Item
                      label="Email"
                      name="email"
                      rules={[
                        { required: true, message: 'Enter email' },
                        { type: 'email', message: 'Enter a valid email' },
                      ]}
                    >
                      <Input prefix={<UserOutlined />} placeholder="admin@company.com" />
                    </Form.Item>
                  ) : (
                    <Form.Item
                      label="Username"
                      name="username"
                      rules={[{ required: true, message: 'Enter username' }]}
                    >
                      <Input prefix={<UserOutlined />} placeholder="lab username" />
                    </Form.Item>
                  )}

                  <Form.Item
                    label="Password"
                    name="password"
                    rules={[{ required: true, message: 'Enter password' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="Password"
                      onKeyUp={handlePasswordKeyState}
                      onKeyDown={handlePasswordKeyState}
                    />
                  </Form.Item>

                  {capsLockOn ? (
                    <Text type="warning" style={{ display: 'block', marginBottom: 10 }}>
                      Caps Lock is on.
                    </Text>
                  ) : null}

                  <Form.Item
                    name="remember"
                    valuePropName="checked"
                    style={{ marginBottom: 14 }}
                  >
                    <Checkbox>
                      {isAdminScope
                        ? 'Remember email on this device'
                        : 'Remember username on this device'}
                    </Checkbox>
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 10 }}>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                      Sign in
                    </Button>
                  </Form.Item>
                </Form>

                <Text type="secondary" className="login-help-text">
                  Need help? Contact your lab administrator.
                </Text>
              </>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

