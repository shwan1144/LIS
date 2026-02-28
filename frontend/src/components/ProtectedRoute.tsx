import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spin } from 'antd';
import type { AuthScope } from '../utils/tenant-scope';

export function ProtectedRoute({
  children,
  requiredScope,
}: {
  children: React.ReactNode;
  requiredScope?: AuthScope;
}) {
  const { user, isReady, scope } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (requiredScope && scope !== requiredScope) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
