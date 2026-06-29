import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Menu, X, FileText, List, Users, BarChart, Building, Image as ImageIcon, MessageSquare, Bell, Wrench, User, Warehouse, Network, Send, Hash, Tag } from 'lucide-react';
import { fetchApi } from '../api/client';
import SyncManager from './SyncManager';
import { fetchCurrentWeather, type WeatherInfo } from '../utils/weather';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const isOfficeRole = user && user.role !== 'KTV' && user.role !== 'DEV';
  const logoPath = isOfficeRole ? '/admin/orders' : (user?.role === 'DEV' ? '/dev/feedbacks' : '/ktv/my-orders');

  useEffect(() => {
    if (!user || user.role !== 'KTV') return;
    const loadWeather = async () => {
      const stationName = user.techStation?.name || user.techStation?.mainStation?.name || '';
      const data = await fetchCurrentWeather(false, stationName);
      if (data) setWeather(data);
    };
    loadWeather();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const checkNotifications = async () => {
      try {
        const data = await fetchApi('/notifications');
        setUnreadCount(data.unreadCount || 0);
      } catch (e) {
        console.error('Lỗi khi kiểm tra thông báo', e);
      }
    };

    checkNotifications();
    window.addEventListener('notifications-updated', checkNotifications);

    const interval = setInterval(checkNotifications, 30000); // Polling mỗi 30 giây
    return () => {
      window.removeEventListener('notifications-updated', checkNotifications);
      clearInterval(interval);
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getNavItems = () => {
    if (!user) return [];
    
    if (user.role === 'DEV') {
      return [
        { name: 'Sơ đồ hệ thống', path: '/dev/system-map', icon: <Network size={20} /> },
        { name: 'Phản hồi người dùng', path: '/dev/feedbacks', icon: <MessageSquare size={20} /> },
        { name: 'Gửi thông báo', path: '/admin/broadcast', icon: <Send size={20} /> },
        { name: 'Thông báo', path: '/notifications', icon: <Bell size={20} /> },
        { name: 'Thông tin cá nhân', path: '/profile', icon: <User size={20} /> },
      ];
    }
    
    if (user.role === 'KTV') {
      return [
        { name: 'Dịch vụ được giao', path: '/ktv/my-orders', icon: <Wrench size={20} /> },
        { name: 'Tồn kho của tôi', path: '/ktv/inventory', icon: <Warehouse size={20} /> },
        { name: 'Thông báo', path: '/notifications', icon: <Bell size={20} /> },
        { name: 'Tạo báo cáo', path: '/ktv/report', icon: <FileText size={20} /> },
        { name: 'Báo cáo của tôi', path: '/ktv/my-reports', icon: <List size={20} /> },
        { name: 'Đóng góp ý kiến', path: '/feedback', icon: <MessageSquare size={20} /> },
        { name: 'Thông tin cá nhân', path: '/profile', icon: <User size={20} /> },
      ];
    }
    
    // Office / Administrative roles
    const items: any[] = [];
    
    // 1. Dashboard: Admin, Staff (Service group)
    const canSeeDashboard = 
      user.role === 'ADMIN' || 
      (user.role === 'STAFF' && user.group === 'Service');
    if (canSeeDashboard) {
      items.push({ name: 'Dashboard', path: '/admin', icon: <BarChart size={20} /> });
    }
    
    // 2. Quản lý kho: Admin, Coordinator
    const canSeeInventory = user.role === 'ADMIN' || user.role === 'COORDINATOR';
    if (canSeeInventory) {
      items.push({ name: 'Quản lý kho', path: '/admin/inventory', icon: <Warehouse size={20} /> });
      items.push({ name: 'Quản lý Serial', path: '/admin/serials', icon: <Hash size={20} /> });
    }

    const canSeePromos = ['ADMIN', 'COORDINATOR', 'SALE_SUPERVISOR', 'SALER', 'HOTLINE'].includes(user.role);
    if (canSeePromos) {
      items.push({ name: 'Quản lý Khuyến mãi', path: '/admin/promos', icon: <Tag size={20} /> });
    }
    
    // 3. Quản lý dịch vụ: All office roles
    items.push({ name: 'Quản lý dịch vụ', path: '/admin/orders', icon: <Wrench size={20} /> });
    
    // 4. Danh sách báo cáo: All office roles
    items.push({ name: 'Danh sách báo cáo', path: '/admin/reports', icon: <List size={20} /> });
    
    // 5. Quản lý Trạm, KTV, Ảnh mẫu: Admin, Coordinator
    const canSeeSettings = user.role === 'ADMIN' || user.role === 'COORDINATOR';
    if (canSeeSettings) {
      items.push(
        { name: 'Quản lý Trạm', path: '/admin/stations', icon: <Building size={20} /> },
        { name: 'Quản lí nhân viên', path: '/admin/users', icon: <Users size={20} /> },
        { name: 'Ảnh mẫu báo cáo', path: '/admin/sample-images', icon: <ImageIcon size={20} /> }
      );
    }
    
    // Gửi thông báo hệ thống: Admin
    if (user.role === 'ADMIN') {
      items.push({ name: 'Gửi thông báo', path: '/admin/broadcast', icon: <Send size={20} /> });
    }
    
    // Shared elements
    items.push(
      { name: 'Thông báo', path: '/notifications', icon: <Bell size={20} /> },
      { name: 'Đóng góp ý kiến', path: '/feedback', icon: <MessageSquare size={20} /> },
      { name: 'Thông tin cá nhân', path: '/profile', icon: <User size={20} /> }
    );
    
    return items;
  };

  const navItems = getNavItems();

  const getTodayString = () => {
    const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const dateStr = now.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    return `${dayName}, ngày ${dateStr}`;
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div className="app-layout">
      {/* Desktop Sidebar Nav */}
      <aside className="app-sidebar">
        {/* Brand Logo */}
        <Link to={logoPath} style={{ height: '70px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', overflow: 'hidden' }}>
          <img src="/logo.png?v=2" alt="Truliva" style={{ height: '150px', objectFit: 'contain' }} />
        </Link>

        {/* Links */}
        <nav style={{ padding: '16px 0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                fontWeight: 600,
                fontSize: '14px',
                color: location.pathname === item.path ? '#1B3A6B' : 'var(--text-muted)',
                backgroundColor: location.pathname === item.path ? '#eff6ff' : 'transparent',
                borderLeft: location.pathname === item.path ? '4px solid #1B3A6B' : '4px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              {item.icon}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{item.name}</span>
                {item.path === '/notifications' && unreadCount > 0 && (
                  <span style={{
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    borderRadius: '9999px',
                    lineHeight: 1
                  }}>
                    {unreadCount}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </nav>

        {/* Profile / Logout at Bottom */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', backgroundColor: '#fff' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.fullName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {user?.role}
            </div>
          </div>
          <button 
            onClick={handleLogout}
            style={{ padding: '8px', color: 'var(--danger)', background: '#fef2f2', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Đăng xuất"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Mobile Top Header (only visible under 1024px) */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={() => setMobileMenuOpen(true)}
              style={{ padding: '8px', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}
            >
              <Menu size={24} />
            </button>
            <Link to={logoPath} style={{ display: 'flex', alignItems: 'center', height: '48px', overflow: 'hidden' }}>
              <img src="/logo.png?v=2" alt="Truliva" style={{ height: '110px', objectFit: 'contain' }} />
            </Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={handleLogout}
              style={{ padding: '8px', color: 'var(--text-muted)', background: 'transparent' }}
              title="Đăng xuất"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer (Side Drawer) */}
      {mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex' }} onClick={closeMenu}>
          <div 
            style={{ width: '270px', backgroundColor: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header of Drawer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
              <Link to={logoPath} onClick={closeMenu} style={{ display: 'flex', alignItems: 'center', height: '48px', overflow: 'hidden' }}>
                <img src="/logo.png?v=2" alt="Truliva" style={{ height: '110px', objectFit: 'contain' }} />
              </Link>
              <button onClick={closeMenu} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none' }}>
                <X size={20} />
              </button>
            </div>

            {/* Welcome Info */}
            <div style={{ 
              padding: '12px 16px', 
              backgroundColor: '#f8fafc', 
              borderBottom: '1px solid var(--border-color)',
              fontSize: '12.5px',
              color: '#475569',
              lineHeight: '1.5'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📅</span> 
                <span>{getTodayString()}</span>
              </div>
              <div style={{ marginTop: '4px', fontWeight: 600 }}>
                Xin chào, <span style={{ color: '#1B3A6B', fontWeight: 700 }}>{user?.fullName}</span> 👋
              </div>
              {user?.role === 'KTV' && weather && (
                <div style={{ 
                  marginTop: '8px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '6px 10px', 
                  backgroundColor: '#eff6ff', 
                  borderRadius: '8px', 
                  border: '1px solid #bfdbfe' 
                }}>
                  <span style={{ fontSize: '18px' }}>{weather.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: '#1B3A6B', fontSize: '12px' }}>
                      {weather.temperature}°C - {weather.text}
                    </span>
                    <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={weather.locationName}>
                      📍 {weather.locationName}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Nav items */}
            <nav style={{ padding: '16px 0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={closeMenu}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', fontWeight: 600, fontSize: '14px',
                    color: location.pathname === item.path ? '#1B3A6B' : 'var(--text-muted)',
                    backgroundColor: location.pathname === item.path ? '#eff6ff' : 'transparent',
                    borderLeft: location.pathname === item.path ? '4px solid #1B3A6B' : '4px solid transparent'
                  }}
                >
                  {item.icon}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{item.name}</span>
                    {item.path === '/notifications' && unreadCount > 0 && (
                      <span style={{
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '9999px',
                        lineHeight: 1
                      }}>
                        {unreadCount}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </nav>

            {/* User Profile in Drawer */}
            <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--primary)' }}>{user?.fullName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user?.role}</div>
              </div>
              <button 
                onClick={handleLogout}
                style={{ padding: '8px', color: 'var(--danger)', background: '#fef2f2', borderRadius: '8px', display: 'flex', alignItems: 'center', border: 'none' }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="app-main">
        <Outlet />
      </main>
      <SyncManager />
    </div>
  );
}
