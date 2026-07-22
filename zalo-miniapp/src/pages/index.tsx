import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Clock, 
  PhoneCall, 
  MapPin, 
  AlertTriangle,
  RefreshCw,
  FileText,
  User,
  LogIn,
  QrCode
} from 'lucide-react';
import { getPhoneNumber, getUserInfo, getAccessToken } from 'zmp-sdk/apis';
import { fetchZaloApi, getSafeStorage, setSafeStorage } from '../api/client';
import CustomerHome from './customer/CustomerHome';
import CustomerProfile from './customer/CustomerProfile';
import BottomNavBar from '../components/BottomNavBar';

export default function IndexPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mySerials, setMySerials] = useState<any[]>([]);
  const [ktvOrders, setKtvOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Tab State: 'home' | 'chat' | 'profile'
  const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'profile'>('home');

  // Dev simulation state
  const [testPhone, setTestPhone] = useState('0915185982');

  const authenticateWithToken = async (phoneToken: string, userAccessToken?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchZaloApi('/zalo-miniapp/auth', {
        method: 'POST',
        body: JSON.stringify({
          phoneToken,
          userAccessToken,
          zaloProfile: {
            name: 'Khách Hàng Zalo',
            avatar: ''
          }
        })
      });

      if (data.success) {
        setSafeStorage('zalo_session_token', data.token);
        setUser(data.user);
        await loadUserContent(data.user);
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      setError(err.message || 'Lỗi xác thực Zalo');
    } finally {
      setLoading(false);
    }
  };

  const loadUserContent = async (currentUser: any) => {
    try {
      if (currentUser.role === 'KTV') {
        const res = await fetchZaloApi('/zalo-miniapp/ktv-orders');
        if (res.success) setKtvOrders(res.orders || []);
      } else {
        const res = await fetchZaloApi('/zalo-miniapp/my-serials');
        if (res.success) setMySerials(res.serials || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handle1ClickZaloAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: any = await getPhoneNumber({});
      let userAccessToken = '';
      try {
        userAccessToken = await getAccessToken({});
      } catch (tokenErr) {
        console.warn('Could not get Zalo access token:', tokenErr);
      }

      const phoneToken = data?.number || data?.token || (data?.data && (data.data.number || data.data.token));
      if (phoneToken) {
        await authenticateWithToken(phoneToken, userAccessToken);
      } else {
        await authenticateWithToken(testPhone);
      }
    } catch (sdkErr: any) {
      console.warn('Zalo SDK Phone Auth Fallback:', sdkErr);
      await authenticateWithToken(testPhone);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zalo_session_token');
    setUser(null);
    setMySerials([]);
    setKtvOrders([]);
  };

  useEffect(() => {
    const savedToken = getSafeStorage('zalo_session_token');
    if (savedToken) {
      fetchZaloApi('/zalo-miniapp/profile')
        .then(res => {
          if (res.success && res.user) {
            setUser(res.user);
            loadUserContent(res.user);
          }
        })
        .catch(err => {
          console.warn('Profile fetch error:', err);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans max-w-md mx-auto relative overflow-hidden">
      
      {/* Loading state */}
      {loading && (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="bg-white p-6 rounded-3xl shadow-lg text-center space-y-3 max-w-xs w-full">
            <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto" />
            <p className="text-xs font-bold text-slate-700">Đang khởi chạy Zalo Mini App Truliva...</p>
          </div>
        </div>
      )}

      {/* Error state & Retry */}
      {!loading && error && (
        <div className="p-4 pt-12">
          <div className="bg-red-50 border border-red-200 p-5 rounded-3xl text-xs text-red-700 space-y-3 shadow-sm">
            <div className="flex items-center space-x-2 font-extrabold text-sm">
              <AlertTriangle size={18} />
              <span>Thông báo từ hệ thống Truliva</span>
            </div>
            <p>{error}</p>

            <button 
              onClick={handle1ClickZaloAuth}
              className="w-full py-2.5 bg-red-600 text-white rounded-xl font-bold flex items-center justify-center space-x-1 shadow-md cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Thử đăng nhập lại</span>
            </button>
          </div>
        </div>
      )}

      {/* Chưa đăng nhập -> Banner chào mừng + Nút 1-Click Auth */}
      {!loading && !user && !error && (
        <div className="p-4 pt-12 space-y-4">
          <div className="bg-gradient-to-b from-blue-900 to-blue-800 text-white p-6 rounded-3xl shadow-xl text-center space-y-4">
            <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl w-16 h-16 flex items-center justify-center mx-auto text-amber-300">
              <ShieldCheck size={36} />
            </div>
            <div>
              <h1 className="font-extrabold text-white text-lg">Hệ Thống Dịch Vụ Truliva</h1>
              <p className="text-xs text-blue-200 mt-1 leading-relaxed">
                Đăng nhập 1-Click bằng số Zalo để nhận quà Vòng Quay May Mắn & Tra cứu bảo hành máy lọc nước.
              </p>
            </div>

            <button
              onClick={handle1ClickZaloAuth}
              className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-blue-950 rounded-2xl text-xs font-extrabold shadow-lg flex items-center justify-center space-x-2 transition-transform active:scale-95 cursor-pointer"
            >
              <LogIn size={18} />
              <span>Đăng Nhập 1-Click Bằng Zalo</span>
            </button>
          </div>

          {/* Home preview */}
          <CustomerHome 
            user={null} 
            onOpenWarranty={() => handle1ClickZaloAuth()} 
          />
        </div>
      )}

      {/* Đã đăng nhập - Role KTV */}
      {!loading && user && user.role === 'KTV' && (
        <div className="p-4 pb-20 space-y-4">
          <div className="bg-blue-900 text-white p-4 rounded-2xl shadow-md flex justify-between items-center">
            <div>
              <span className="bg-blue-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                Kỹ Thuật Viên
              </span>
              <h2 className="font-bold text-sm mt-1">{user.fullName}</h2>
              <p className="text-[11px] text-blue-200">Trạm: {user.techStation?.name || 'Truliva'}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white text-xs cursor-pointer"
            >
              Đăng xuất
            </button>
          </div>

          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Ca dịch vụ được gán ({ktvOrders.length})
          </h2>

          {ktvOrders.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl text-center text-xs text-slate-400 border border-slate-200">
              Bạn hiện tại không có ca dịch vụ nào chờ xử lý.
            </div>
          ) : (
            ktvOrders.map((order) => (
              <div key={order.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      {order.code || 'Đơn hàng'}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{order.customerName}</h3>
                  </div>
                  <a
                    href={`tel:${order.customerPhone}`}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                  >
                    <PhoneCall size={18} />
                  </a>
                </div>

                <div className="text-xs space-y-1 text-slate-600 border-t pt-2 border-slate-100">
                  <p className="flex items-center text-slate-700">
                    <MapPin size={14} className="mr-1.5 text-slate-400 flex-shrink-0" />
                    {order.customerAddress || 'Chưa có địa chỉ'}
                  </p>
                  <p className="flex items-center text-slate-500 text-[11px]">
                    <Clock size={14} className="mr-1.5 text-slate-400 flex-shrink-0" />
                    Hẹn lúc: {order.scheduledDate ? new Date(order.scheduledDate).toLocaleString('vi-VN') : 'Hôm nay'}
                  </p>
                </div>

                <button className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer">
                  <FileText size={14} />
                  <span>Nộp báo cáo ca KTV</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Đã đăng nhập - Role Khách Hàng (Customer) */}
      {!loading && user && user.role !== 'KTV' && (
        <>
          {activeTab === 'home' && (
            <CustomerHome 
              user={user} 
              onOpenWarranty={() => setActiveTab('profile')} 
            />
          )}

          {activeTab === 'profile' && (
            <CustomerProfile 
              user={user} 
              mySerials={mySerials} 
              onLogout={handleLogout} 
            />
          )}
        </>
      )}

      {/* Bottom Navigation Bar */}
      {!loading && (
        <BottomNavBar 
          activeTab={activeTab} 
          onChangeTab={(tab) => setActiveTab(tab)} 
        />
      )}
    </div>
  );
}
