import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { fetchApi } from './api/client';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// Shared Pages
import ChangePasswordPage from './pages/ChangePasswordPage';
import ProfilePage from './pages/ProfilePage';

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
import InventoryManage from './pages/admin/InventoryManage';

// Feedback / DEV Pages
import FeedbackPage from './pages/FeedbackPage';
import FeedbackList from './pages/dev/FeedbackList';

function PushNotificationManager({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) {
      return;
    }

    const registerPush = async () => {
      try {
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.warn('User denied push notification permissions.');
          return;
        }

        await PushNotifications.register();

        // 1. Đăng ký thành công Token
        await PushNotifications.addListener('registration', async (token) => {
          console.log('Push token registration success:', token.value);
          try {
            await fetchApi('/notifications/register-token', {
              method: 'POST',
              body: JSON.stringify({ token: token.value }),
            });
            console.log('Push token saved to backend.');
          } catch (apiErr) {
            console.error('Failed to save push token to backend:', apiErr);
          }
        });

        // 2. Lỗi đăng ký
        await PushNotifications.addListener('registrationError', (err) => {
          console.error('Push token registration error:', err.error);
        });

        // 3. Nhận thông báo khi đang mở app (Foreground)
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push notification received in foreground:', notification);
          alert(`${notification.title}\n${notification.body}`);
        });

        // 4. Nhấn chọn thông báo (Background/Màn hình khóa)
        await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('Push notification action performed:', action);
          const data = action.notification.data;
          if (data && data.pancakeOrderId) {
            navigate(`/ktv/my-orders?search=${data.pancakeOrderId}`);
          }
        });

      } catch (err) {
        console.error('Error setting up Push Notifications:', err);
      }
    };

    registerPush();

    return () => {
      if (Capacitor.isNativePlatform()) {
        PushNotifications.removeAllListeners();
      }
    };
  }, [user, navigate]);

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PushNotificationManager>
          <ConfirmProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              
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
                <Route path="/admin/inventory" element={<InventoryManage />} />
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
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['KTV', 'ADMIN']} />}>
                <Route path="/feedback" element={<FeedbackPage />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          </ConfirmProvider>
        </PushNotificationManager>
      </BrowserRouter>
    </AuthProvider>
  );
}
