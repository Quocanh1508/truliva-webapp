import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Clock, 
  PhoneCall, 
  Phone,
  MapPin, 
  AlertTriangle,
  RefreshCw,
  FileText,
  User,
  LogIn,
  QrCode
} from 'lucide-react';
import { getPhoneNumber, getUserInfo, getAccessToken, scanQRCode } from 'zmp-sdk/apis';
import { fetchZaloApi, getSafeStorage, setSafeStorage } from '../api/client';
import CustomerHome from './customer/CustomerHome';
import CustomerProfile from './customer/CustomerProfile';
import ProductCatalog from './customer/ProductCatalog';
import ProductDetail from './customer/ProductDetail';
import CartPage from './customer/CartPage';
import CheckoutPage from './customer/CheckoutPage';
import OrderSuccessPage from './customer/OrderSuccessPage';
import MyOrdersPage from './customer/MyOrdersPage';
import BottomNavBar, { MainTabType } from '../components/BottomNavBar';
import { useCart } from '../context/CartContext';

type ShopSubView = 'catalog' | 'detail' | 'cart' | 'checkout' | 'success' | 'my_orders';

export default function IndexPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mySerials, setMySerials] = useState<any[]>([]);
  const [ktvOrders, setKtvOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Tab State: 'home' | 'shop' | 'chat' | 'profile'
  const [activeTab, setActiveTab] = useState<MainTabType>('home');

  // E-Commerce Sub-View State
  const [shopSubView, setShopSubView] = useState<ShopSubView>('catalog');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [checkoutVoucher, setCheckoutVoucher] = useState<string | undefined>(undefined);
  const [orderSuccessData, setOrderSuccessData] = useState<any>(null);
  const [vietQrInfo, setVietQrInfo] = useState<any>(null);

  // Dev simulation state
  const [testPhone, setTestPhone] = useState('0915185982');

  const { addToCart } = useCart();

  const authenticateWithToken = async (phoneToken: string, userAccessToken?: string, zaloProfile?: any) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchZaloApi('/zalo-miniapp/auth', {
        method: 'POST',
        body: JSON.stringify({
          phoneToken,
          userAccessToken,
          zaloProfile
        })
      });

      if (data.success) {
        setSafeStorage('zalo_session_token', data.token);
        setSafeStorage('zalo_user_cache', JSON.stringify(data.user));
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
      // 1. Lấy Phone Token
      const data: any = await getPhoneNumber({});
      
      // 2. Lấy Access Token
      let userAccessToken = '';
      try {
        userAccessToken = await getAccessToken({});
      } catch (tokenErr) {
        console.warn('Could not get Zalo access token:', tokenErr);
      }

      // 3. Lấy Tên & Avatar thật từ Zalo
      let zaloProfile: { id?: string; name?: string; avatar?: string } = {};
      try {
        const info: any = await getUserInfo({ avatarType: 'normal' });
        if (info && (info.userInfo || info.data)) {
          const userObj = info.userInfo || info.data;
          zaloProfile = {
            id: userObj.id,
            name: userObj.name,
            avatar: userObj.avatar
          };
        }
      } catch (profileErr) {
        console.warn('Could not get Zalo user profile:', profileErr);
      }

      if (data && data.token) {
        await authenticateWithToken(data.token, userAccessToken, zaloProfile);
      } else if (data && data.number) {
        await authenticateWithToken(data.number, userAccessToken, zaloProfile);
      } else {
        throw new Error('Không lấy được mã xác thực Số điện thoại từ Zalo');
      }
    } catch (err: any) {
      console.error('Zalo Auth SDK Error:', err);
      // Fallback dev test
      if (testPhone) {
        await authenticateWithToken(testPhone);
      } else {
        setError(err.message || 'Lỗi cấp quyền Zalo');
        setLoading(false);
      }
    }
  };

  const handleOpenScanner = async () => {
    try {
      const scanResult: any = await scanQRCode({});
      if (scanResult && scanResult.content) {
        const content = scanResult.content;
        const serialMatch = content.match(/serial=([A-Za-z0-9_-]+)/) || [null, content];
        const extractedSerial = serialMatch[1];
        window.location.href = `https://trulivaofficial.com/warranty-activate?serial=${encodeURIComponent(extractedSerial)}`;
      }
    } catch (err: any) {
      console.warn('QR scan cancelled or not supported', err);
      window.location.href = 'https://trulivaofficial.com/warranty-activate';
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zalo_session_token');
    localStorage.removeItem('zalo_user_cache');
    setUser(null);
    setMySerials([]);
    setKtvOrders([]);
    setActiveTab('home');
    setShopSubView('catalog');
  };

  useEffect(() => {
    // 1. Kiểm tra cache người dùng
    const cachedUserStr = getSafeStorage('zalo_user_cache');
    if (cachedUserStr) {
      try {
        const cachedUser = JSON.parse(cachedUserStr);
        setUser(cachedUser);
        loadUserContent(cachedUser);
      } catch (e) {}
    }

    // 2. Đồng bộ phiên mới nhất từ Server
    const savedToken = getSafeStorage('zalo_session_token');
    if (savedToken) {
      fetchZaloApi('/zalo-miniapp/profile')
        .then(res => {
          if (res.success && res.user) {
            setUser(res.user);
            setSafeStorage('zalo_user_cache', JSON.stringify(res.user));
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

  // Handler khi chọn sản phẩm từ catalog
  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    setShopSubView('detail');
  };

  // Handler khi nhấn "Mua ngay" trên trang chi tiết
  const handleBuyNow = (product: any, quantity: number) => {
    addToCart(product, quantity);
    setShopSubView('checkout');
  };

  // Handler khi đặt hàng thành công
  const handleOrderSuccess = (order: any, qrInfo?: any) => {
    setOrderSuccessData(order);
    setVietQrInfo(qrInfo);
    setShopSubView('success');
  };

  // Handler chuyển tab chính
  const handleTabChange = (tab: MainTabType) => {
    setActiveTab(tab);
    if (tab === 'shop') {
      setShopSubView('catalog');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans max-w-md mx-auto relative overflow-hidden">
      
      {/* Loading state */}
      {loading && (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="bg-white p-6 rounded-3xl shadow-lg text-center space-y-3 max-w-xs w-full">
            <RefreshCw size={28} className="animate-spin text-[#0284C7] mx-auto" />
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
              className="w-full py-2.5 bg-[#1B3A6B] hover:bg-[#2563EB] text-white rounded-xl font-bold flex items-center justify-center space-x-1 shadow-md transition-colors cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Thử đăng nhập lại</span>
            </button>
          </div>
        </div>
      )}

      {/* Chưa đăng nhập -> Banner chào mừng + Nút Đăng nhập bằng SĐT */}
      {!loading && !user && !error && (
        <div className="p-4 pt-12 space-y-4">
          <div className="bg-gradient-to-br from-[#061226] via-[#0B2545] to-[#0F3866] text-white p-6 rounded-3xl shadow-xl text-center space-y-4 relative overflow-hidden">
            <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl w-16 h-16 flex items-center justify-center mx-auto text-[#00D2FF] border border-[#00D2FF]/30 shadow-[0_0_15px_rgba(0,210,255,0.3)]">
              <ShieldCheck size={36} />
            </div>
            <div>
              <h1 className="font-black text-white text-lg tracking-tight">Hệ Thống Dịch Vụ Truliva</h1>
              <p className="text-xs text-sky-200 mt-1 leading-relaxed">
                Đăng nhập bằng số điện thoại Zalo để mua sắm máy lọc nước chính hãng & Tra cứu bảo hành điện tử.
              </p>
            </div>

            {/* Nút Đăng nhập bằng Số điện thoại Zalo */}
            <button
              onClick={handle1ClickZaloAuth}
              className="w-full py-3.5 bg-gradient-to-r from-[#00D2FF] to-[#0284C7] hover:from-[#00A3FF] hover:to-[#1B3A6B] text-[#061226] hover:text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-cyan-500/25 flex items-center justify-center space-x-2 transition-all active:scale-95 cursor-pointer"
            >
              <Phone size={16} />
              <span>Đăng Nhập Bằng Số Điện Thoại</span>
            </button>

            {/* Nhập số điện thoại thủ công */}
            <div className="pt-2 border-t border-white/10 space-y-2 text-left">
              <p className="text-[11px] text-sky-200 font-semibold">Hoặc nhập số điện thoại trực tiếp:</p>
              <div className="flex gap-2">
                <input 
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="Nhập SĐT (VD: 0915185982)"
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00D2FF]"
                />
                <button
                  onClick={() => authenticateWithToken(testPhone)}
                  className="px-4 py-2 bg-[#0284C7] hover:bg-[#00D2FF] hover:text-[#061226] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Vào
                </button>
              </div>
            </div>
          </div>

          {/* Home preview */}
          <CustomerHome 
            user={null} 
            onOpenScanner={handleOpenScanner}
            onOpenWarranty={() => handle1ClickZaloAuth()} 
            onGoToShop={() => handle1ClickZaloAuth()}
          />
        </div>
      )}

      {/* Đã đăng nhập - Role KTV */}
      {!loading && user && user.role === 'KTV' && (
        <div className="p-4 pb-20 space-y-4">
          <div className="bg-[#1B3A6B] text-white p-4 rounded-2xl shadow-md flex justify-between items-center">
            <div>
              <span className="bg-[#0284C7] text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                Kỹ Thuật Viên
              </span>
              <h2 className="font-bold text-sm mt-1">{user.fullName}</h2>
              <p className="text-[11px] text-sky-200">Trạm: {user.techStation?.name || 'Truliva'}</p>
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
                    <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      {order.code || 'Đơn hàng'}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{order.customerName}</h3>
                  </div>
                  <a
                    href={`tel:${order.customerPhone}`}
                    className="p-2 bg-sky-50 text-[#0284C7] rounded-xl hover:bg-sky-100 transition-colors"
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

                <button className="w-full py-2.5 bg-[#1B3A6B] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm transition-colors cursor-pointer">
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
          {/* TAB 1: Trang Chủ */}
          {activeTab === 'home' && (
            <CustomerHome 
              user={user} 
              onOpenScanner={handleOpenScanner}
              onOpenWarranty={() => setActiveTab('profile')}
              onGoToShop={() => {
                setActiveTab('shop');
                setShopSubView('catalog');
              }}
            />
          )}

          {/* TAB 2: Cửa Hàng & Luồng Mua Sắm (E-Commerce Flow) */}
          {activeTab === 'shop' && (
            <>
              {shopSubView === 'catalog' && (
                <ProductCatalog
                  onSelectProduct={handleSelectProduct}
                  onGoToCart={() => setShopSubView('cart')}
                />
              )}

              {shopSubView === 'detail' && selectedProduct && (
                <ProductDetail
                  product={selectedProduct}
                  onBack={() => setShopSubView('catalog')}
                  onGoToCart={() => setShopSubView('cart')}
                  onBuyNow={handleBuyNow}
                />
              )}

              {shopSubView === 'cart' && (
                <CartPage
                  onBack={() => setShopSubView('catalog')}
                  onGoToCheckout={(vCode) => {
                    setCheckoutVoucher(vCode);
                    setShopSubView('checkout');
                  }}
                  onExploreProducts={() => setShopSubView('catalog')}
                />
              )}

              {shopSubView === 'checkout' && (
                <CheckoutPage
                  user={user}
                  voucherCode={checkoutVoucher}
                  onBack={() => setShopSubView('cart')}
                  onOrderSuccess={handleOrderSuccess}
                />
              )}

              {shopSubView === 'success' && (
                <OrderSuccessPage
                  orderData={orderSuccessData}
                  vietQrInfo={vietQrInfo}
                  onViewMyOrders={() => {
                    setActiveTab('profile');
                    setShopSubView('my_orders');
                  }}
                  onContinueShopping={() => setShopSubView('catalog')}
                />
              )}
            </>
          )}

          {/* TAB 4: Cá Nhân */}
          {activeTab === 'profile' && (
            <>
              {shopSubView === 'my_orders' ? (
                <MyOrdersPage
                  user={user}
                  onBack={() => setShopSubView('catalog')}
                  onExploreProducts={() => {
                    setActiveTab('shop');
                    setShopSubView('catalog');
                  }}
                />
              ) : (
                <CustomerProfile 
                  user={user} 
                  mySerials={mySerials} 
                  onLogout={handleLogout} 
                  onOpenScanner={handleOpenScanner}
                  onViewMyOrders={() => setShopSubView('my_orders')}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Bottom Navigation Bar */}
      {!loading && (
        <BottomNavBar 
          activeTab={activeTab} 
          onChangeTab={handleTabChange} 
        />
      )}
    </div>
  );
}
