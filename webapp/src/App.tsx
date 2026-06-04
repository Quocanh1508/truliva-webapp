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
    if (!user) {
      return;
    }

    if (Capacitor.isNativePlatform()) {
      // ── Luồng Native App (Capacitor FCM) ──
      const registerNativePush = async () => {
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

      registerNativePush();

      return () => {
        PushNotifications.removeAllListeners();
      };
    } else {
      // ── Luồng PWA Web Push (Safari, Chrome, Firefox...) ──
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
          .replace(/\-/g, '+')
          .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      const registerWebPush = async () => {
        try {
          if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Trình duyệt không hỗ trợ Web Push / Service Workers.');
            return;
          }

          const registration = await navigator.serviceWorker.ready;

          // Xin quyền thông báo
          let permission = Notification.permission;
          if (permission === 'default') {
            permission = await Notification.requestPermission();
          }

          if (permission !== 'granted') {
            console.warn('Quyền Web Push bị từ chối.');
            return;
          }

          // Lấy VAPID Public Key từ Backend
          const keyRes = await fetchApi('/notifications/vapid-public-key');
          const applicationServerKey = urlBase64ToUint8Array(keyRes.publicKey);

          // Đăng ký/Lấy Subscription
          let subscription = await registration.pushManager.getSubscription();
          
          if (!subscription) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
          }

          // Lưu subscription lên database
          await fetchApi('/notifications/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
          });
          
          console.log('Đăng ký Web Push PWA thành công.');
        } catch (err) {
          console.error('Lỗi khi đăng ký Web Push PWA:', err);
        }
      };

      registerWebPush();

      // Nhận chỉ thị chuyển hướng từ Service Worker
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'REDIRECT') {
          navigate(event.data.url);
        }
      };

      navigator.serviceWorker.addEventListener('message', handleMessage);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
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
