import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../context/AuthContext';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  requireDashboard?: boolean;
}

export default function ProtectedRoute({ allowedRoles, requireDashboard }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <span className="spinner" style={{ borderColor: 'rgba(27, 58, 107, 0.3)', borderTopColor: '#1B3A6B' }}></span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'KTV') return <Navigate to="/ktv/my-orders" replace />;
    if (user.role === 'DEV') return <Navigate to="/dev/feedbacks" replace />;
    return <Navigate to="/admin/orders" replace />;
  }

  if (requireDashboard) {
    const hasDashboardAccess = 
      user.role === 'ADMIN' || 
      user.role === 'DEV' || 
      (user.role === 'STAFF' && user.group === 'Service');
    
    if (!hasDashboardAccess) {
      return <Navigate to="/admin/orders" replace />;
    }
  }

  return <Outlet />;
}
