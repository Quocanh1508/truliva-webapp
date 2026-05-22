import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Menu, X, FileText, List, Users, BarChart, ShoppingCart, Building, Key, Image as ImageIcon } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const logoPath = user?.role === 'ADMIN' ? '/admin' : '/ktv/my-orders';

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
    <div className="app-layout">
      {/* Desktop Sidebar Nav */}
      <aside className="app-sidebar">
        {/* Brand Logo */}
        <Link to={logoPath} style={{ padding: '24px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', backgroundColor: '#fff' }}>
          <img src="/logo.png" alt="Truliva" style={{ height: '36px' }} />
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
              {item.name}
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
            <Link to={logoPath} style={{ display: 'flex', alignItems: 'center' }}>
              <img src="/logo.png" alt="Truliva" style={{ height: '32px' }} />
            </Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right', minWidth: 0 }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                {user?.fullName}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {user?.role}
              </div>
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

      {/* Mobile Menu Drawer (Side Drawer) */}
      {mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex' }} onClick={closeMenu}>
          <div 
            style={{ width: '270px', backgroundColor: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header of Drawer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
              <Link to={logoPath} onClick={closeMenu} style={{ display: 'flex', alignItems: 'center' }}>
                <img src="/logo.png" alt="Truliva" style={{ height: '28px' }} />
              </Link>
              <button onClick={closeMenu} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none' }}>
                <X size={20} />
              </button>
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
                  {item.name}
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
    </div>
  );
}
