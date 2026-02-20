import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { OrdersWorklistProvider } from './contexts/OrdersWorklistContext';
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

function AppContent() {
  const { isDark } = useTheme();
  const authScope = getCurrentAuthScope();
  const isAdminHost = authScope === 'PLATFORM';

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <AuthProvider>
        <OrdersWorklistProvider>
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
                    <Route path="instruments" element={<SettingsInstrumentsPage />} />
                    <Route path="tests" element={<TestsPage />} />
                    <Route path="audit" element={<AuditLogPage />} />
                  </Route>
                </Route>
              )}

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </OrdersWorklistProvider>
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
