import { useState, useEffect } from 'react';
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
import OfflineScreen from './components/OfflineScreen';

// Shared Pages
import ChangePasswordPage from './pages/ChangePasswordPage';
import ProfilePage from './pages/ProfilePage';

// KTV Pages
import ReportForm from './pages/ktv/ReportForm';
import MyReports from './pages/ktv/MyReports';
import MyOrders from './pages/ktv/MyOrders';
import Notifications from './pages/ktv/Notifications';
import KtvInventory from './pages/ktv/KtvInventory';

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
  const [bannerType, setBannerType] = useState<'NONE' | 'INSTALL_GUIDE' | 'PERMISSION_PROMPT'>('NONE');

  // Helper chuyển đổi VAPID key sang định dạng Uint8Array
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

  // Hàm đăng ký Web Push lên Backend
  const doRegisterWebPush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // Lấy VAPID Public Key từ Backend
      const keyRes = await fetchApi('/notifications/vapid-public-key');
      if (!keyRes || !keyRes.publicKey) {
        console.warn('Backend không trả về VAPID Public Key hợp lệ.');
        return;
      }
      
      const applicationServerKey = urlBase64ToUint8Array(keyRes.publicKey);

      // Đăng ký/Lấy Subscription từ trình duyệt
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      // Lưu subscription lên database qua API
      await fetchApi('/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
      });
      
      console.log('Đăng ký Web Push PWA lên database thành công.');
    } catch (err) {
      console.error('Lỗi chi tiết khi đăng ký Web Push PWA:', err);
      throw err; // Ném lỗi để bên gọi biết và xử lý/hiển thị
    }
  };

  useEffect(() => {
    if (!user) {
      setBannerType('NONE');
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
            console.warn('Quyền thông báo native app bị từ chối.');
            return;
          }

          await PushNotifications.register();

          // 1. Đăng ký thành công Token
          await PushNotifications.addListener('registration', async (token) => {
            console.log('Push token native success:', token.value);
            try {
              await fetchApi('/notifications/register-token', {
                method: 'POST',
                body: JSON.stringify({ token: token.value }),
              });
              console.log('Native push token saved to backend.');
            } catch (apiErr) {
              console.error('Failed to save native push token:', apiErr);
            }
          });

          // 2. Lỗi đăng ký
          await PushNotifications.addListener('registrationError', (err) => {
            console.error('Native push registration error:', err.error);
          });

          // 3. Nhận thông báo khi đang mở app (Foreground)
          await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push notification in foreground:', notification);
            alert(`${notification.title}\n${notification.body}`);
          });

          // 4. Nhấn chọn thông báo (Background/Màn hình khóa)
          await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('Push notification action clicked:', action);
            const data = action.notification.data;
            if (data && data.pancakeOrderId) {
              navigate(`/ktv/my-orders?search=${data.pancakeOrderId}`);
            }
          });

        } catch (err) {
          console.error('Error setting up native Push Notifications:', err);
        }
      };

      registerNativePush();

      return () => {
        PushNotifications.removeAllListeners();
      };
    } else {
      // ── Luồng PWA Web Push (Safari, Chrome, Firefox...) ──
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone;
      const supportsNotifications = 'Notification' in window;
      const permission = supportsNotifications ? Notification.permission : 'denied';

      // Chỉ kích hoạt banner và đăng ký với tài khoản KTV
      console.log('PushNotificationManager Web Check:', {
        role: user.role,
        isIOS,
        isStandalone,
        supportsNotifications,
        permission,
      });

      if (user.role === 'KTV') {
        if (isIOS && !isStandalone) {
          // iPhone/iPad nhưng đang mở bằng tab Safari thường (chưa Add to Home Screen)
          setBannerType('INSTALL_GUIDE');
        } else if (permission === 'default') {
          // Chưa quyết định cho phép/chặn thông báo
          setBannerType('PERMISSION_PROMPT');
        } else if (permission === 'granted') {
          // Quyền đã cấp sẵn, tự động đăng ký/cập nhật ngầm mà không cần click
          setBannerType('NONE');
          doRegisterWebPush();
        } else {
          console.warn('Web Push permission is denied or unsupported.');
        }
      }

      // Lắng nghe lệnh điều hướng từ Service Worker
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

  // Click handler xin quyền trực tiếp (User Gesture hợp lệ trên iOS)
  const handleEnableNotifications = async () => {
    try {
      if (!('Notification' in window)) {
        alert('Trình duyệt hoặc thiết bị của bạn không hỗ trợ nhận thông báo đẩy.');
        setBannerType('NONE');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setBannerType('NONE');
        await doRegisterWebPush();
        alert('Bật nhận thông báo đẩy thành công!');
      } else {
        alert('Bạn đã từ chối quyền. Vui lòng cho phép quyền thông báo trong cài đặt Safari/Trình duyệt của bạn để nhận tin đơn hàng mới.');
        setBannerType('NONE');
      }
    } catch (err: any) {
      console.error('Lỗi khi kích hoạt quyền thông báo:', err);
      alert(`Không thể bật thông báo: ${err.message || err}`);
    }
  };

  return (
    <>
      {bannerType === 'INSTALL_GUIDE' && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 text-amber-900 px-4 py-3 relative flex items-center justify-between text-xs sm:text-sm font-medium shadow-sm transition-all duration-300">
          <div className="flex items-center space-x-2 pr-6">
            <span className="text-base animate-bounce">📱</span>
            <span>
              Để nhận thông báo đơn hàng mới tức thì, vui lòng thêm ứng dụng vào Màn hình chính: 
              chọn biểu tượng <strong>Chia sẻ (Share)</strong> <span className="inline-block px-1.5 py-0.5 bg-white border border-gray-300 rounded shadow-xs mx-0.5">📤</span> rồi chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.
            </span>
          </div>
          <button 
            onClick={() => setBannerType('NONE')} 
            className="text-amber-500 hover:text-amber-800 font-bold px-2 py-1 text-sm absolute right-2 top-1/2 -translate-y-1/2 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {bannerType === 'PERMISSION_PROMPT' && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 text-blue-900 px-4 py-3 relative flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm font-medium shadow-sm gap-2 transition-all duration-300">
          <div className="flex items-center space-x-2 pr-6">
            <span className="text-base animate-pulse">🔔</span>
            <span>
              Bạn chưa bật thông báo đẩy. Vui lòng cho phép nhận thông báo để không bỏ lỡ các đơn hàng mới được phân công.
            </span>
          </div>
          <div className="flex items-center space-x-4 self-end sm:self-auto pr-6 sm:pr-0">
            <button 
              onClick={handleEnableNotifications}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded shadow-sm text-xs transition-all transform active:scale-95"
            >
              Bật ngay
            </button>
            <button 
              onClick={() => setBannerType('NONE')}
              className="text-blue-500 hover:text-blue-800 text-xs transition-colors"
            >
              Để sau
            </button>
          </div>
        </div>
      )}

      {children}
    </>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PushNotificationManager>
          <ConfirmProvider>
            <OfflineScreen />
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
                <Route path="/ktv/inventory" element={<KtvInventory />} />
              </Route>

              {/* Dashboard Route */}
              <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR', 'STAFF']} requireDashboard={true} />}>
                <Route path="/admin" element={<Dashboard />} />
              </Route>

              {/* Admin & Coordinator Settings Routes */}
              <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']} />}>
                <Route path="/admin/inventory" element={<InventoryManage />} />
                <Route path="/admin/stations" element={<StationManage />} />
                <Route path="/admin/users" element={<UserManage />} />
                <Route path="/admin/sample-images" element={<SampleImageManage />} />
              </Route>

              {/* All Office/Administrative Routes */}
              <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR', 'SALE_SUPERVISOR', 'SALER', 'HOTLINE', 'STAFF']} />}>
                <Route path="/admin/orders" element={<OrderList />} />
                <Route path="/admin/reports" element={<ReportList />} />
              </Route>

              {/* Dev Routes */}
              <Route element={<ProtectedRoute allowedRoles={['DEV']} />}>
                <Route path="/dev/feedbacks" element={<FeedbackList />} />
              </Route>

              {/* Shared Routes */}
              <Route element={<ProtectedRoute allowedRoles={['KTV', 'ADMIN', 'DEV', 'COORDINATOR', 'SALE_SUPERVISOR', 'SALER', 'HOTLINE', 'STAFF']} />}>
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />
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
