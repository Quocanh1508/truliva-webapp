import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Menu, X, FileText, List, Users, BarChart, ShoppingCart, Building, Key, Image as ImageIcon } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = user?.role === 'ADMIN' ? [
    { name: 'Dashboard', path: '/admin', icon: <BarChart size={20} /> },
    { name: 'Quản lý Đơn hàng', path: '/admin/orders', icon: <ShoppingCart size={20} /> },
    { name: 'Danh sách báo cáo', path: '/admin/reports', icon: <List size={20} /> },
    { name: 'Quản lý Trạm', path: '/admin/stations', icon: <Building size={20} /> },
    { name: 'Kỹ thuật viên', path: '/admin/users', icon: <Users size={20} /> },
    { name: 'Ảnh mẫu báo cáo', path: '/admin/sample-images', icon: <ImageIcon size={20} /> },
    { name: 'Đổi mật khẩu', path: '/change-password', icon: <Key size={20} /> },
  ] : [
    { name: 'Đơn hàng được giao', path: '/ktv/my-orders', icon: <ShoppingCart size={20} /> },
    { name: 'Tạo báo cáo', path: '/ktv/report', icon: <FileText size={20} /> },
    { name: 'Báo cáo của tôi', path: '/ktv/my-reports', icon: <List size={20} /> },
    { name: 'Đổi mật khẩu', path: '/change-password', icon: <Key size={20} /> },
  ];

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navbar */}
      <header style={{ backgroundColor: '#fff', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 30 }}>
        <div className="container flex items-center justify-between" style={{ height: '64px' }}>
          <div className="flex items-center gap-2">
            <button 
              className="menu-toggle"
              style={{ padding: '8px', background: 'transparent' }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <img src="/logo.png" alt="Truliva" style={{ height: '32px' }} />
          </div>

          {/* Desktop Nav */}
          <nav className="nav-desktop items-center gap-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', fontWeight: 500,
                  color: location.pathname === item.path ? '#1B3A6B' : 'var(--text-muted)',
                  backgroundColor: location.pathname === item.path ? '#eff6ff' : 'transparent'
                }}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--primary)' }}>{user?.fullName}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{user?.role}</div>
            </div>
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

      {/* Mobile Sidebar */}
      {mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={closeMenu}>
          <div 
            style={{ width: '250px', backgroundColor: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{user?.fullName}</div>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{user?.role}</div>
            </div>
            <nav style={{ padding: '16px 0', flex: 1, overflowY: 'auto' }}>
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={closeMenu}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', fontWeight: 500,
                    color: location.pathname === item.path ? '#1B3A6B' : 'var(--text-muted)',
                    backgroundColor: location.pathname === item.path ? '#eff6ff' : 'transparent',
                    borderRight: location.pathname === item.path ? '4px solid #1B3A6B' : 'none'
                  }}
                >
                  {item.icon}
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container" style={{ flex: 1, padding: '24px 16px' }}>
        <Outlet />
      </main>
    </div>
  );
}
