import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { KeyRound, ArrowLeft } from 'lucide-react';
import { fetchApi } from '../api/client';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('Liên kết khôi phục mật khẩu không hợp lệ');
      return;
    }

    if (newPassword.length < 4) {
      setError('Mật khẩu mới phải có ít nhất 4 ký tự');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);

    try {
      const data = await fetchApi('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setSuccess(data.message);
      
      // Tự động chuyển hướng về trang đăng nhập sau 3 giây
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen" style={{ backgroundColor: '#1B3A6B' }}>
      <div className="card w-full animate-fade-in" style={{ maxWidth: '400px', margin: '1rem' }}>
        <div className="text-center mb-6">
          <img src="/logo.png" alt="Truliva Logo" style={{ height: '60px', margin: '0 auto 1rem' }} />
          <h2 className="font-bold text-xl">Đặt lại mật khẩu</h2>
          <p className="text-muted text-sm mt-2">Nhập mật khẩu mới cho tài khoản của bạn</p>
        </div>

        {!token ? (
          <div className="alert alert-error text-center">
            Liên kết không hợp lệ. Vui lòng yêu cầu lại liên kết khôi phục mật khẩu.
          </div>
        ) : (
          <>
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {!success ? (
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Mật khẩu mới</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập ít nhất 4 ký tự"
                    required
                  />
                </div>

                <div className="form-group mb-6">
                  <label className="form-label">Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    className="form-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full flex justify-center"
                  disabled={loading || !newPassword || !confirmPassword}
                >
                  {loading ? <span className="spinner"></span> : <><KeyRound size={20} /> Đổi mật khẩu</>}
                </button>
              </form>
            ) : (
              <div className="text-center mt-4">
                <p className="text-sm text-muted">Hệ thống sẽ tự động chuyển hướng về trang đăng nhập sau vài giây...</p>
                <Link to="/login" className="btn btn-outline w-full mt-4 flex justify-center">
                  Đăng nhập ngay
                </Link>
              </div>
            )}
          </>
        )}

        <div className="text-center mt-6 pt-4 border-t border-slate-200">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold hover:underline" style={{ color: '#1B3A6B' }}>
            <ArrowLeft size={16} /> Quay lại Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
