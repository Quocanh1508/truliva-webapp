import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Save, AlertCircle, CheckCircle, MapPin, FileText, CreditCard, Shield, Key } from 'lucide-react';
import { fetchApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { login } = useAuth();
  
  // Basic states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  
  // Extended Profile states
  const [address, setAddress] = useState('');
  const [cccdNumber, setCccdNumber] = useState('');
  const [cccdDate, setCccdDate] = useState('');
  const [cccdPlace, setCccdPlace] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankName, setBankName] = useState('');
  const [techStationName, setTechStationName] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const navigate = useNavigate();

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword.length < 4) {
      setPwError('Mật khẩu mới phải có ít nhất 4 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
      return;
    }

    setPwLoading(true);

    try {
      await fetchApi('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setPwSuccess('Thay đổi mật khẩu thành công!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.message || 'Lỗi khi đổi mật khẩu.');
    } finally {
      setPwLoading(false);
    }
  };

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
          
          setAddress(data.user.address || '');
          setCccdNumber(data.user.cccdNumber || '');
          setCccdDate(data.user.cccdDate || '');
          setCccdPlace(data.user.cccdPlace || '');
          setBankAccount(data.user.bankAccount || '');
          setBankName(data.user.bankName || '');
          
          if (data.user.techStation) {
            const msName = data.user.techStation.mainStation?.name || '';
            const tsName = data.user.techStation.name || '';
            setTechStationName(msName ? `${msName} | ${tsName}` : tsName);
          } else {
            setTechStationName('Chưa phân trạm');
          }
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
        body: JSON.stringify({ 
          fullName, 
          email, 
          phoneNumber,
          address,
          cccdNumber,
          cccdDate,
          cccdPlace,
          bankAccount,
          bankName
        }),
      });

      setSuccess('Cập nhật thông tin cá nhân thành công!');
      
      // Update local auth context
      if (data.user) {
        login(data.user);
      }
      
      // Scroll to top to see success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
    <div style={{ maxWidth: '750px', margin: '2rem auto' }} className="animate-fade-in px-4">
      <div className="card shadow-md">
        
        {/* Header Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#1B3A6B' }}>
            <User size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: '#1B3A6B' }}>Thông tin cá nhân</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>Cập nhật và hoàn thiện thông tin hồ sơ của bạn</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} />
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div className="alert alert-success mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '12px', borderRadius: '8px' }}>
            <CheckCircle size={20} />
            <div>{success}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          
          {/* SECTION 1: SYSTEM INFO */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#1B3A6B', fontWeight: 600, fontSize: '14px' }}>
              <Shield size={16} />
              <span>Thông tin tài khoản hệ thống</span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Tên tài khoản</label>
                <input
                  type="text"
                  className="form-input"
                  value={username}
                  disabled
                  style={{ cursor: 'not-allowed', backgroundColor: '#f3f4f6', color: '#6b7280' }}
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Vai trò</label>
                <input
                  type="text"
                  className="form-input text-transform: uppercase"
                  value={role}
                  disabled
                  style={{ cursor: 'not-allowed', backgroundColor: '#f3f4f6', color: '#6b7280', textTransform: 'uppercase' }}
                />
              </div>
              {role === 'KTV' && (
                <div className="form-group mb-0">
                  <label className="form-label text-xs">Trạm trực thuộc</label>
                  <input
                    type="text"
                    className="form-input"
                    value={techStationName}
                    disabled
                    style={{ cursor: 'not-allowed', backgroundColor: '#f3f4f6', color: '#6b7280' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: BASIC PERSONAL DETAILS */}
          <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#1B3A6B', fontWeight: 600, fontSize: '14px' }}>
              <MapPin size={16} />
              <span>Thông tin liên hệ cơ bản</span>
            </div>

            <div className="form-group mb-4">
              <label className="form-label text-xs">Họ và tên <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                className="form-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nhập họ và tên"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Số điện thoại</label>
                <input
                  type="tel"
                  className="form-input"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Nhập số điện thoại"
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-xs">
                  Email liên hệ <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>(Để khôi phục mật khẩu)</span>
                </label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-xs">Địa chỉ liên hệ</label>
              <input
                type="text"
                className="form-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
              />
            </div>
          </div>

          {/* SECTION 3: LEGAL DOCUMENT DETAILS (CCCD) */}
          <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#1B3A6B', fontWeight: 600, fontSize: '14px' }}>
              <FileText size={16} />
              <span>Thông tin chứng minh nhân dân / CCCD</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Số CCCD</label>
                <input
                  type="text"
                  className="form-input"
                  value={cccdNumber}
                  onChange={(e) => setCccdNumber(e.target.value)}
                  placeholder="Nhập số CCCD"
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Ngày cấp CCCD</label>
                <input
                  type="date"
                  className="form-input"
                  value={cccdDate}
                  onChange={(e) => setCccdDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-xs">Nơi cấp CCCD</label>
              <input
                type="text"
                className="form-input"
                value={cccdPlace}
                onChange={(e) => setCccdPlace(e.target.value)}
                placeholder="Ví dụ: Cục Cảnh sát QLHC về trật tự xã hội"
              />
            </div>
          </div>

          {/* SECTION 4: PAYMENT INFO */}
          <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '20px', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#1B3A6B', fontWeight: 600, fontSize: '14px' }}>
              <CreditCard size={16} />
              <span>Thông tin tài khoản ngân hàng</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Số tài khoản thanh toán</label>
                <input
                  type="text"
                  className="form-input"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="Nhập số tài khoản"
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Ngân hàng thanh toán</label>
                <input
                  type="text"
                  className="form-input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Ví dụ: Vietcombank, Techcombank..."
                />
              </div>
            </div>
          </div>

          {/* SECTION 5: CHANGE PASSWORD */}
          <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '20px', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#1B3A6B', fontWeight: 600, fontSize: '14px' }}>
              <Key size={16} />
              <span>Đổi mật khẩu tài khoản</span>
            </div>

            {pwError && (
              <div className="alert alert-error mb-3" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                <AlertCircle size={16} />
                <div>{pwError}</div>
              </div>
            )}

            {pwSuccess && (
              <div className="alert alert-success mb-3" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px' }}>
                <CheckCircle size={16} />
                <div>{pwSuccess}</div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  className="form-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Mật khẩu mới</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mật khẩu mới (tối thiểu 4 ký tự)"
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  className="form-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: '#1B3A6B', color: '#1B3A6B', height: '38px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
                  onClick={() => handleChangePassword()}
                  disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
                >
                  {pwLoading ? <span className="spinner" style={{ width: '14px', height: '14px' }}></span> : <><Key size={14} /> Đổi mật khẩu</>}
                </button>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
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
