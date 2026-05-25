import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// Shared Pages
import ChangePasswordPage from './pages/ChangePasswordPage';

// KTV Pages
import ReportForm from './pages/ktv/ReportForm';
import MyReports from './pages/ktv/MyReports';
import MyOrders from './pages/ktv/MyOrders';
import Notifications from './pages/ktv/Notifications';

// Admin Pages
import Dashboard from './pages/admin/Dashboard';
import ReportList from './pages/admin/ReportList';
import UserManage from './pages/admin/UserManage';
import OrderList from './pages/admin/OrderList';
import StationManage from './pages/admin/StationManage';
import SampleImageManage from './pages/admin/SampleImageManage';

// Feedback / DEV Pages
import FeedbackPage from './pages/FeedbackPage';
import FeedbackList from './pages/dev/FeedbackList';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route element={<Layout />}>
            {/* KTV Routes */}
            <Route element={<ProtectedRoute allowedRoles={['KTV']} />}>
              <Route path="/ktv/report" element={<ReportForm />} />
              <Route path="/ktv/my-reports" element={<MyReports />} />
              <Route path="/ktv/my-orders" element={<MyOrders />} />
              <Route path="/ktv/notifications" element={<Notifications />} />
            </Route>

            {/* Admin Routes */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/reports" element={<ReportList />} />
              <Route path="/admin/users" element={<UserManage />} />
              <Route path="/admin/stations" element={<StationManage />} />
              <Route path="/admin/orders" element={<OrderList />} />
              <Route path="/admin/sample-images" element={<SampleImageManage />} />
            </Route>

            {/* Dev Routes */}
            <Route element={<ProtectedRoute allowedRoles={['DEV']} />}>
              <Route path="/dev/feedbacks" element={<FeedbackList />} />
            </Route>

            {/* Shared Routes */}
            <Route element={<ProtectedRoute allowedRoles={['KTV', 'ADMIN', 'DEV']} />}>
              <Route path="/change-password" element={<ChangePasswordPage />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['KTV', 'ADMIN']} />}>
              <Route path="/feedback" element={<FeedbackPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
