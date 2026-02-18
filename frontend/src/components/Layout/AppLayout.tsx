import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Layout as AntLayout, Typography, Space, Menu, Modal, Dropdown, Switch } from 'antd';
import { LogoutOutlined, DashboardOutlined, BarChartOutlined, UserOutlined, DownOutlined, FileTextOutlined, UnorderedListOutlined, SettingOutlined, FilePdfOutlined, CheckCircleOutlined, WarningOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getShifts, type ShiftDto } from '../../api/client';

const { Header, Content, Sider } = AntLayout;
const { Text } = Typography;

/** Parse "HH:mm" or "HH:mm:ss" to minutes since midnight (0-1440). */
function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr?.trim()) return null;
  const parts = timeStr.trim().split(':');
  const h = parseInt(parts[0], 10);
  const m = parts.length >= 2 ? parseInt(parts[1], 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Return the shift whose start/end time range contains the current time (local). */
function getCurrentShiftByTime(shifts: ShiftDto[], now: Date): ShiftDto | null {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  for (const shift of shifts) {
    const startM = parseTimeToMinutes(shift.startTime);
    const endM = parseTimeToMinutes(shift.endTime);
    if (startM == null || endM == null) continue;
    const inRange =
      startM <= endM
        ? currentMinutes >= startM && currentMinutes < endM
        : currentMinutes >= startM || currentMinutes < endM;
    if (inRange) return shift;
  }
  return null;
}

const ADMIN_ROLES = ['LAB_ADMIN', 'SUPER_ADMIN'];

function getMenuItems(role: string | undefined) {
  const items: { key: string; icon?: React.ReactNode; label: string; children?: { key: string; label: string }[] }[] = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/patients', icon: <UserOutlined />, label: 'Patients' },
    { key: '/orders', icon: <FileTextOutlined />, label: 'Orders' },
    { key: '/worklist', icon: <UnorderedListOutlined />, label: 'Worklist' },
    { key: '/verification', icon: <CheckCircleOutlined />, label: 'Verification' },
    { key: '/reports', icon: <FilePdfOutlined />, label: 'Reports' },
    { key: '/unmatched', icon: <WarningOutlined />, label: 'Unmatched Results' },
  ];
  if (role && ADMIN_ROLES.includes(role)) {
    items.push({ key: '/statistics', icon: <BarChartOutlined />, label: 'Statistics' });
    items.push({
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      children: [
        { key: '/settings/shifts', label: 'Shifts' },
        { key: '/settings/departments', label: 'Departments' },
        { key: '/settings/users', label: 'User management' },
        { key: '/settings/label', label: 'Label & sequence' },
        { key: '/settings/instruments', label: 'Instruments' },
        { key: '/settings/tests', label: 'Test management' },
        { key: '/settings/audit', label: 'Audit Log' },
      ],
    });
  }
  return items;
}

export function AppLayout() {
  const { user, lab, logout, currentShiftId, currentShiftLabel, setCurrentShift } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const menuItems = getMenuItems(user?.role);
  const isAdmin = user?.role && ADMIN_ROLES.includes(user.role);

  useEffect(() => {
    if (!lab) return;
    getShifts()
      .then(setShifts)
      .catch(() => setShifts([]));
  }, [lab?.id]);

  // Sync header shift to the one active by timer (Settings start/end times)
  useEffect(() => {
    if (!shifts.length || !setCurrentShift) return;
    const sync = () => {
      const active = getCurrentShiftByTime(shifts, new Date());
      if (active) setCurrentShift(active.id, active.name ?? active.code ?? active.id);
      else setCurrentShift(null, null);
    };
    sync();
    const interval = setInterval(sync, 60 * 1000);
    return () => clearInterval(interval);
  }, [shifts, setCurrentShift]);

  if ((location.pathname.startsWith('/settings') || location.pathname === '/statistics') && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleLogout = () => {
    Modal.confirm({
      title: 'Log out?',
      content: 'Are you sure you want to log out?',
      okText: 'Log out',
      cancelText: 'Cancel',
      onOk: () => {
        logout();
        navigate('/login');
      },
    });
  };

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Log out',
      onClick: handleLogout,
    },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#001529',
          padding: '0 24px',
        }}
      >
        <Space size="middle">
          <Text style={{ color: '#fff', fontWeight: 600 }}>LIS</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            Current lab: {lab?.name ?? '—'}
          </Text>
          <Text type="secondary" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Shift: {currentShiftLabel ?? '—'}
          </Text>
        </Space>
        <Space size="middle">
          <Switch
            checked={isDark}
            onChange={toggleTheme}
            size="small"
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
            style={{ marginRight: 8 }}
          />
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
            <Space style={{ color: 'rgba(255,255,255,0.85)', cursor: 'pointer', padding: '4px 8px' }}>
              <UserOutlined />
              <Text style={{ color: 'inherit' }}>{user?.fullName || user?.username}</Text>
              <DownOutlined style={{ fontSize: 12 }} />
            </Space>
          </Dropdown>
        </Space>
      </Header>
      <AntLayout>
        <Sider width={200} style={{ background: isDark ? '#141414' : '#fff' }} theme={isDark ? 'dark' : 'light'}>
          <Menu
            mode="inline"
            selectedKeys={[
              location.pathname.startsWith('/settings') ? location.pathname :
              location.pathname.startsWith('/orders') ? '/orders' :
              location.pathname === '/patients' ? '/patients' :
              location.pathname === '/statistics' ? '/statistics' :
              location.pathname === '/worklist' ? '/worklist' :
              location.pathname === '/verification' ? '/verification' :
              location.pathname === '/reports' ? '/reports' : '/'
            ]}
            defaultOpenKeys={location.pathname.startsWith('/settings') ? ['settings'] : undefined}
            items={menuItems}
            onClick={({ key }) => { if (key.startsWith('/')) navigate(key); }}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: isDark ? '#141414' : '#f0f2f5' }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
