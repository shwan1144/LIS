import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { OrdersWorklistProvider } from './contexts/OrdersWorklistContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/Layout/AppLayout';
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
import { SettingsUsersPage } from './pages/settings/SettingsUsersPage';
import { SettingsDepartmentsPage } from './pages/settings/SettingsDepartmentsPage';
import { SettingsInstrumentsPage } from './pages/settings/SettingsInstrumentsPage';
import { SettingsLabelPage } from './pages/settings/SettingsLabelPage';
import { SettingsOnlineResultsPage } from './pages/settings/SettingsOnlineResultsPage';
import { SettingsReportDesignPage } from './pages/settings/SettingsReportDesignPage';
import { Outlet } from 'react-router-dom';
import './App.css';

function SettingsLayout() {
  return <Outlet />;
}

function AppContent() {
  const { isDark } = useTheme();
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
            <Route
              path="/"
              element={
                <ProtectedRoute>
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
                <Route path="users" element={<SettingsUsersPage />} />
                <Route path="label" element={<SettingsLabelPage />} />
                <Route path="report-design" element={<SettingsReportDesignPage />} />
                <Route path="online-results" element={<SettingsOnlineResultsPage />} />
                <Route path="instruments" element={<SettingsInstrumentsPage />} />
                <Route path="tests" element={<TestsPage />} />
                <Route path="audit" element={<AuditLogPage />} />
              </Route>
            </Route>
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
