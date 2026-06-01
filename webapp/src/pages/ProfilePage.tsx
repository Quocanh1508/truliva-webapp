import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { fetchApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { login } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await fetchApi('/auth/me');
        if (data.user) {
          setFullName(data.user.fullName || '');
          setEmail(data.user.email || '');
          setPhoneNumber(data.user.phoneNumber || '');
          setUsername(data.user.username || '');
          setRole(data.user.role || '');
        }
      } catch (err: any) {
        setError(err.message || 'Lỗi khi tải thông tin cá nhân');
      } finally {
        setFetching(false);
      }
    };
    loadProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName.trim()) {
      setError('Họ và tên không được để trống.');
      return;
    }

    setLoading(true);

    try {
      const data = await fetchApi('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName, email, phoneNumber }),
      });

      setSuccess('Cập nhật thông tin cá nhân thành công!');
      
      // Cập nhật context local để sidebar hiển thị tên mới
      if (data.user) {
        login(data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi cập nhật thông tin cá nhân.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="spinner" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}></span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '2rem auto' }} className="animate-fade-in">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#1B3A6B' }}>
            <User size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Thông tin cá nhân</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>Cập nhật thông tin tài khoản đăng nhập của bạn</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <AlertCircle size={20} />
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '12px', borderRadius: '8px' }}>
            <CheckCircle size={20} />
            <div>{success}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Readonly username and role */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tài khoản</label>
              <input
                type="text"
                className="form-input bg-gray-50 text-gray-500"
                value={username}
                disabled
                style={{ cursor: 'not-allowed', backgroundColor: '#f3f4f6', color: '#6b7280' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Vai trò</label>
              <input
                type="text"
                className="form-input bg-gray-50 text-gray-500"
                value={role}
                disabled
                style={{ cursor: 'not-allowed', backgroundColor: '#f3f4f6', color: '#6b7280' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
            <label className="form-label">Họ và tên <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nhập họ và tên"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">
              Email liên hệ <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 'normal' }}>(Dùng để khôi phục mật khẩu)</span>
            </label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Số điện thoại</label>
            <input
              type="text"
              className="form-input"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Nhập số điện thoại"
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate(-1)}
              disabled={loading}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !fullName}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {loading ? <span className="spinner"></span> : <><Save size={18} /> Lưu thông tin</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
