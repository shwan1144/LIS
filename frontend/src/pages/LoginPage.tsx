import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { login as apiLogin } from '../api/client';

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, login: setAuth } = useAuth();

  useEffect(() => {
    if (sessionStorage.getItem('sessionExpired') === '1') {
      sessionStorage.removeItem('sessionExpired');
      message.info('Session expired. Please log in again.');
    }
  }, []);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await apiLogin({
        username: values.username,
        password: values.password,
      });
      setAuth(res.user, res.lab, res.accessToken);
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
        title="LIS Login"
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
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Enter username' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Username" />
          </Form.Item>
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
