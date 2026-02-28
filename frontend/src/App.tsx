import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/Layout/AppLayout';
import { AdminLayout } from './components/Layout/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { PatientsPage } from './pages/PatientsPage';
import { OrdersPage } from './pages/OrdersPage';
import { TestsPage } from './pages/TestsPage';
import { WorklistPage } from './pages/WorklistPage';
import { VerificationPage } from './pages/VerificationPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { UnmatchedResultsPage } from './pages/UnmatchedResultsPage';
import { SettingsShiftsPage } from './pages/settings/SettingsShiftsPage';
import { SettingsDepartmentsPage } from './pages/settings/SettingsDepartmentsPage';
import { SettingsInstrumentsPage } from './pages/settings/SettingsInstrumentsPage';
import { SettingsLabelPage } from './pages/settings/SettingsLabelPage';
import { SettingsPrintingPage } from './pages/settings/SettingsPrintingPage';
import { SettingsTestGroupsPage } from './pages/settings/SettingsTestGroupsPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminLabsPage } from './pages/admin/AdminLabsPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';
import { AdminLabUsersPage } from './pages/admin/AdminLabUsersPage';
import { AdminLabOnlineResultsPage } from './pages/admin/AdminLabOnlineResultsPage';
import { AdminLabReportDesignPage } from './pages/admin/AdminLabReportDesignPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminLabDetailsPage } from './pages/admin/AdminLabDetailsPage';
import { Outlet } from 'react-router-dom';
import { getCurrentAuthScope } from './utils/tenant-scope';
import './App.css';

function SettingsLayout() {
  return <Outlet />;
}

function AppTitleUpdater() {
  const { lab } = useAuth();

  useEffect(() => {
    if (lab) {
      document.title = lab.name;
    } else {
      document.title = 'LIS';
    }
  }, [lab]);

  return null;
}

function AppContent() {
  const { isDark } = useTheme();
  const authScope = getCurrentAuthScope();
  const isAdminHost = authScope === 'PLATFORM';
  const darkThemeToken = {
    colorPrimary: '#1677ff',
    borderRadius: 6,
  };
  const lightThemeToken = {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    colorBgBase: '#dfe7f2',
    colorBgLayout: '#d7e0ec',
    colorBgContainer: '#edf2f8',
    colorBgElevated: '#f2f6fb',
    colorFillAlter: '#e3ebf4',
    colorBorder: '#bfcddd',
    colorBorderSecondary: '#ced8e5',
    colorSplit: '#c8d4e2',
    colorText: '#111827',
    colorTextSecondary: '#334155',
    colorTextTertiary: '#475569',
    colorTextQuaternary: '#64748b',
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: isDark ? darkThemeToken : lightThemeToken,
      }}
    >
      <AuthProvider>
        <AppTitleUpdater />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {isAdminHost ? (
              <Route
                path="/"
                element={
                  <ProtectedRoute requiredScope="PLATFORM">
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<AdminDashboardPage />} />
                <Route path="labs" element={<AdminLabsPage />} />
                <Route path="labs/:labId" element={<AdminLabDetailsPage />} />
                <Route path="orders" element={<AdminOrdersPage />} />
                <Route path="audit" element={<AdminAuditLogsPage />} />
                <Route path="labs/users" element={<AdminLabUsersPage />} />
                <Route path="labs/online-results" element={<AdminLabOnlineResultsPage />} />
                <Route path="labs/report-design" element={<AdminLabReportDesignPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
              </Route>
            ) : (
              <Route
                path="/"
                element={
                  <ProtectedRoute requiredScope="LAB">
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="statistics" element={<StatisticsPage />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="worklist" element={<WorklistPage />} />
                <Route path="tests" element={<Navigate to="/settings/tests" replace />} />
                <Route path="verification" element={<VerificationPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit" element={<Navigate to="/settings/audit" replace />} />
                <Route path="unmatched" element={<UnmatchedResultsPage />} />
                <Route path="settings" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="/settings/shifts" replace />} />
                  <Route path="shifts" element={<SettingsShiftsPage />} />
                  <Route path="departments" element={<SettingsDepartmentsPage />} />
                  <Route path="label" element={<SettingsLabelPage />} />
                  <Route path="printing" element={<SettingsPrintingPage />} />
                  <Route path="instruments" element={<SettingsInstrumentsPage />} />
                  <Route path="test-groups" element={<SettingsTestGroupsPage />} />
                  <Route path="tests" element={<TestsPage />} />
                  <Route path="audit" element={<AuditLogPage />} />
                </Route>
              </Route>
            )}

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
