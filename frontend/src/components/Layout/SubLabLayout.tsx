import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Dropdown,
  Grid,
  Layout as AntLayout,
  Menu,
  Modal,
  Segmented,
  Space,
  Switch,
  Typography,
} from 'antd';
import {
  BarChartOutlined,
  DownOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { canAccessPath, getDefaultRouteForRole } from '../../auth/lab-role-policy';
import '../../pages/sub-lab/SubLabPortal.css';

const { Header, Content, Sider } = AntLayout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const MENU_ITEMS = [
  { key: '/sub-lab/orders', icon: <FileTextOutlined />, label: 'Orders' },
  { key: '/sub-lab/statistics', icon: <BarChartOutlined />, label: 'Statistics' },
];

export function SubLabLayout() {
  const { user, lab, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const role = user?.role;
  const defaultRoute = getDefaultRouteForRole(role);

  if (!canAccessPath(role, location.pathname)) {
    if (location.pathname !== defaultRoute) {
      return <Navigate to={defaultRoute} replace />;
    }
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    Modal.confirm({
      title: 'Log out?',
      content: 'Are you sure you want to log out?',
      okText: 'Log out',
      cancelText: 'Cancel',
      onOk: async () => {
        await logout();
        navigate('/login');
      },
    });
  };

  return (
    <AntLayout className="lab-app-shell sub-lab-layout-shell" style={{ minHeight: '100vh' }}>
      <Header
        className="sub-lab-layout-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#001529',
          padding: isMobile ? '10px 14px' : '0 24px',
        }}
      >
        <div className="sub-lab-layout-header-left">
          <Space size={isMobile ? 'small' : 'middle'} wrap>
            <Text style={{ color: '#fff', fontWeight: 600 }}>LIS</Text>
          </Space>
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            Current lab: {lab?.name ?? '-'}
          </Text>
          <Text type="secondary" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Sub lab: {user?.subLabName ?? user?.username ?? '-'}
          </Text>
        </div>
        <Space size="middle">
          <Switch
            checked={isDark}
            onChange={toggleTheme}
            size="small"
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
            style={{ marginRight: 8 }}
          />
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Log out',
                  onClick: handleLogout,
                },
              ],
            }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Space
              style={{
                color: 'rgba(255,255,255,0.85)',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              <UserOutlined />
              <Text style={{ color: 'inherit' }}>{user?.subLabName || user?.username}</Text>
              <DownOutlined style={{ fontSize: 12 }} />
            </Space>
          </Dropdown>
        </Space>
      </Header>
      <AntLayout>
        {!isMobile ? (
          <Sider
            className="lab-app-sider"
            width={228}
            style={{ background: isDark ? '#141414' : '#e5edf7' }}
            theme={isDark ? 'dark' : 'light'}
          >
            <Menu
              className="lab-app-menu"
              mode="inline"
              selectedKeys={[location.pathname]}
              items={MENU_ITEMS}
              onClick={({ key }) => {
                if (key.startsWith('/')) navigate(key);
              }}
              style={{ height: '100%', borderRight: 0 }}
            />
          </Sider>
        ) : null}
        <Content
          className="sub-lab-layout-content"
          style={{ padding: isMobile ? '12px' : '12px 24px 24px', background: isDark ? '#141414' : '#dce5f0' }}
        >
          <Alert
            type="info"
            showIcon
            message="Sub-lab portal"
            description="This portal is limited to your own referred orders, results, and billing statistics."
            style={{ marginBottom: 16 }}
          />
          {isMobile ? (
            <div className="sub-lab-mobile-nav">
              <Segmented
                block
                value={location.pathname}
                options={MENU_ITEMS.map((item) => ({
                  label: item.label,
                  value: item.key,
                }))}
                onChange={(value) => navigate(String(value))}
              />
            </div>
          ) : null}
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
