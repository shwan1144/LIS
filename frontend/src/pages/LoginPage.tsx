import { useEffect, useRef, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { loginLab, loginLabViaBridgeToken, loginPlatform } from '../api/client';
import { getCurrentAuthScope } from '../utils/tenant-scope';

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const currentScope = getCurrentAuthScope();
  const isAdminScope = currentScope === 'PLATFORM';
  const [bridgeToken] = useState<string | null>(() => {
    if (isAdminScope) return null;
    const token = new URL(window.location.href).searchParams.get('bridgeToken')?.trim() || null;
    return token && token.length > 0 ? token : null;
  });
  const bridgeLoginStartedRef = useRef(false);
  const { user, scope, login: setAuth, logout } = useAuth();

  useEffect(() => {
    if (bridgeToken) {
      sessionStorage.removeItem('sessionExpired');
    } else if (sessionStorage.getItem('sessionExpired') === '1') {
      sessionStorage.removeItem('sessionExpired');
      message.info('Session expired. Please log in again.');
    }
    if (!bridgeToken && user && scope && scope !== currentScope) {
      logout();
    }
  }, [bridgeToken, currentScope, logout, scope, user]);

  useEffect(() => {
    if (isAdminScope || !bridgeToken) return;
    if (bridgeLoginStartedRef.current) return;
    bridgeLoginStartedRef.current = true;

    // Consume query token exactly once (prevents duplicate consume in React StrictMode dev remount).
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('bridgeToken')) {
      currentUrl.searchParams.delete('bridgeToken');
      const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.history.replaceState(null, '', nextUrl);
    }

    // Ensure stale local lab token never wins over bridge-token login flow.
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('lab');
    localStorage.removeItem('authScope');
    logout();

    const openLabPortal = async () => {
      setLoading(true);
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
        const errorMessage =
          error && typeof error === 'object' && 'response' in error
            ? (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
            : null;
        const normalized = Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage;
        message.error(normalized || 'Failed to open lab panel');
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

  const onFinish = async (values: { username?: string; email?: string; password: string }) => {
    setLoading(true);
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

      setAuth({
        user: res.user,
        lab: res.lab,
        token: res.accessToken,
        scope: res.scope,
      });
      message.success('Logged in successfully');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Login failed';
      message.error(msg || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
        padding: 32,
        boxSizing: 'border-box',
      }}
    >
      <Card
        title={isAdminScope ? 'Platform Admin Login' : 'LIS Login'}
        style={{
          width: 'min(90vw, 520px)',
          maxWidth: 520,
        }}
        bodyStyle={{ padding: '36px 48px' }}
      >
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          {isAdminScope ? (
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Enter email' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="Email" />
            </Form.Item>
          ) : (
            <Form.Item
              name="username"
              rules={[{ required: true, message: 'Enter username' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="Username" />
            </Form.Item>
          )}
          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Enter password' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Log in
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
