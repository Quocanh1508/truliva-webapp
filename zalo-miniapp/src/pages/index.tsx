import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Phone,
  AlertTriangle,
  RefreshCw,
  User,
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

  const loadUserContent = async (_currentUser?: any) => {
    try {
      // Zalo Mini App phục vụ 100% Khách Hàng -> Luôn tải danh sách máy lọc nước
      const res = await fetchZaloApi('/zalo-miniapp/my-serials');
      if (res && res.success) {
        setMySerials(res.serials || []);
      }
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes('hết hạn') || err?.message?.includes('không hợp lệ')) {
        localStorage.removeItem('zalo_session_token');
        localStorage.removeItem('zalo_user_cache');
        setUser(null);
        setMySerials([]);
      }
    }
  };

  const handle1ClickZaloAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Lấy Tên & Avatar thật từ Zalo (BẮT BUỘC autoRequestPermission: true theo NĐ 13/2023/NĐ-CP)
      let zaloProfile: { id?: string; name?: string; avatar?: string } = {};
      try {
        const info: any = await getUserInfo({ avatarType: 'normal', autoRequestPermission: true });
        const userObj = info?.userInfo || info?.data || info;
        if (userObj && (userObj.name || userObj.avatar)) {
          zaloProfile = {
            id: userObj.id,
            name: userObj.name,
            avatar: userObj.avatar
          };
        }
      } catch (profileErr) {
        console.warn('Could not get Zalo user profile:', profileErr);
      }

      // 2. Lấy Phone Token từ Zalo SDK
      const data: any = await getPhoneNumber({});
      
      // 3. Lấy Access Token
      let userAccessToken = '';
      try {
        userAccessToken = await getAccessToken({});
      } catch (tokenErr) {
        console.warn('Could not get Zalo access token:', tokenErr);
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

    // 2. Đồng bộ phiên mới nhất từ Server & làm mới Avatar từ Zalo
    const savedToken = getSafeStorage('zalo_session_token');
    if (savedToken) {
      fetchZaloApi('/zalo-miniapp/profile')
        .then(async res => {
          if (res.success && res.user) {
            let activeUser = res.user;

            // Nếu user trên DB chưa có avatar, thử lấy âm thầm từ Zalo SDK nếu đã được cấp quyền trước đó
            try {
              const info: any = await getUserInfo({ avatarType: 'normal', autoRequestPermission: false });
              const u = info?.userInfo || info?.data;
              if (u && (u.avatar || u.name)) {
                if ((u.avatar && u.avatar !== activeUser.avatar) || (u.name && (!activeUser.fullName || activeUser.fullName.startsWith('Khách hàng')))) {
                  const syncRes = await fetchZaloApi('/zalo-miniapp/profile/sync', {
                    method: 'POST',
                    body: JSON.stringify({ name: u.name, avatar: u.avatar })
                  });
                  if (syncRes && syncRes.success && syncRes.user) {
                    activeUser = { ...activeUser, ...syncRes.user };
                  }
                }
              }
            } catch (_) {}

            setUser(activeUser);
            setSafeStorage('zalo_user_cache', JSON.stringify(activeUser));
            loadUserContent(activeUser);
          }
        })
        .catch(err => {
          console.warn('Profile fetch error:', err);
          // NẾU TOKEN HẾT HẠN HOẶC KHÔNG HỢP LỆ (401):
          // Dọn sạch phiên hỏng để không bị kẹt ở trạng thái zombie
          localStorage.removeItem('zalo_session_token');
          localStorage.removeItem('zalo_user_cache');
          setUser(null);
          setMySerials([]);
          // Tự động làm mới phiên 1-chạm qua Zalo SDK
          handle1ClickZaloAuth();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // ══════════════════════════════════════════════════════════════════════
  // NAVIGATION HISTORY GUARD: Bắt cử chỉ vuốt mép màn hình (Edge Swipe Back)
  // để quay lại màn hình trước thay vì bị thoát Mini App
  // ══════════════════════════════════════════════════════════════════════
  const activeTabRef = useRef<MainTabType>(activeTab);
  activeTabRef.current = activeTab;

  const shopSubViewRef = useRef<ShopSubView>(shopSubView);
  shopSubViewRef.current = shopSubView;

  useEffect(() => {
    // Đặt state gốc nếu chưa có
    try {
      if (!window.history.state) {
        window.history.replaceState({ tab: 'home', subView: 'catalog' }, '');
      }
    } catch (_) {}

    const handlePopState = () => {
      // 1. Nếu đang ở màn hình con (chi tiết SP, giỏ hàng, checkout...) -> Lùi về catalog
      if (shopSubViewRef.current !== 'catalog') {
        setShopSubView('catalog');
        return;
      }

      // 2. Nếu đang ở tab khác ngoài home -> Lùi về tab home
      if (activeTabRef.current !== 'home') {
        setActiveTab('home');
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handler khi chọn sản phẩm từ catalog (Đẩy state vào history stack)
  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    setShopSubView('detail');
    try {
      window.history.pushState({ tab: activeTabRef.current, subView: 'detail' }, '');
    } catch (_) {}
  };

  // Handler khi nhấn "Mua ngay" trên trang chi tiết
  const handleBuyNow = (product: any, quantity: number) => {
    addToCart(product, quantity);
    setShopSubView('checkout');
    try {
      window.history.pushState({ tab: activeTabRef.current, subView: 'checkout' }, '');
    } catch (_) {}
  };

  // Handler khi đặt hàng thành công
  const handleOrderSuccess = (order: any, qrInfo?: any) => {
    setOrderSuccessData(order);
    setVietQrInfo(qrInfo);
    setShopSubView('success');
  };

  // Handler chuyển tab chính (Đẩy state nếu sang tab khác home)
  const handleTabChange = (tab: MainTabType) => {
    if (tab === activeTabRef.current) return;
    setActiveTab(tab);
    if (tab === 'shop') {
      setShopSubView('catalog');
    }
    if ((tab === 'home' || tab === 'profile') && user && mySerials.length === 0) {
      loadUserContent(user);
    }
    if (tab !== 'home') {
      try {
        window.history.pushState({ tab, subView: 'catalog' }, '');
      } catch (_) {}
    }
  };

  // Handler nút Back vật lý / UI
  const handleBackAction = (fallbackSubView: ShopSubView = 'catalog') => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setShopSubView(fallbackSubView);
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
                  onClick={async () => {
                    let zaloProfile: any = undefined;
                    try {
                      const info: any = await getUserInfo({ avatarType: 'normal', autoRequestPermission: true });
                      const u = info?.userInfo || info?.data || info;
                      if (u && (u.name || u.avatar)) {
                        zaloProfile = { id: u.id, name: u.name, avatar: u.avatar };
                      }
                    } catch (_) {}
                    authenticateWithToken(testPhone, undefined, zaloProfile);
                  }}
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

      {/* Đã đăng nhập - Toàn bộ người dùng đều vào giao diện Khách Hàng (Customer) */}
      {!loading && user && (
        <>
          {/* TAB 1: Trang Chủ */}
          {activeTab === 'home' && (
            <CustomerHome 
              user={user} 
              mySerials={mySerials}
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
                  onBack={() => handleBackAction('catalog')}
                  onGoToCart={() => {
                    setShopSubView('cart');
                    try { window.history.pushState({ tab: activeTab, subView: 'cart' }, ''); } catch (_) {}
                  }}
                  onBuyNow={handleBuyNow}
                />
              )}

              {shopSubView === 'cart' && (
                <CartPage
                  onBack={() => handleBackAction('catalog')}
                  onGoToCheckout={(vCode) => {
                    setCheckoutVoucher(vCode);
                    setShopSubView('checkout');
                    try { window.history.pushState({ tab: activeTab, subView: 'checkout' }, ''); } catch (_) {}
                  }}
                  onExploreProducts={() => handleBackAction('catalog')}
                />
              )}

              {shopSubView === 'checkout' && (
                <CheckoutPage
                  user={user}
                  voucherCode={checkoutVoucher}
                  onBack={() => handleBackAction('cart')}
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
                    try { window.history.pushState({ tab: 'profile', subView: 'my_orders' }, ''); } catch (_) {}
                  }}
                  onContinueShopping={() => handleBackAction('catalog')}
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
                  onBack={() => handleBackAction('catalog')}
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
                  onRefresh={() => loadUserContent(user)}
                  onViewMyOrders={() => {
                    setShopSubView('my_orders');
                    try { window.history.pushState({ tab: 'profile', subView: 'my_orders' }, ''); } catch (_) {}
                  }}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Bottom Navigation Bar: Luôn hiển thị cho toàn bộ khách hàng ở các tab chính */}
      {!loading && user && !(
        (activeTab === 'shop' && shopSubView !== 'catalog') ||
        (activeTab === 'profile' && shopSubView === 'my_orders')
      ) && (
        <BottomNavBar 
          activeTab={activeTab} 
          onChangeTab={handleTabChange} 
        />
      )}
    </div>
  );
}
