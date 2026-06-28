import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { fetchApi } from '../api/client';

export default function ForgotPasswordPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await fetchApi('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ usernameOrEmail }),
      });
      setSuccess(data.message);
      setUsernameOrEmail('');
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
          <img src="/logo.png?v=2" alt="Truliva Logo" style={{ height: '60px', margin: '0 auto 1rem' }} />
          <h2 className="font-bold text-xl">Quên mật khẩu</h2>
          <p className="text-muted text-sm mt-2">Nhập username hoặc email của bạn để nhận liên kết khôi phục mật khẩu</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {!success ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group mb-6">
              <label className="form-label">Username hoặc Email</label>
              <input
                type="text"
                className="form-input"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="Nhập tên đăng nhập hoặc email"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full flex justify-center"
              disabled={loading || !usernameOrEmail}
            >
              {loading ? <span className="spinner"></span> : <><Mail size={20} /> Gửi yêu cầu</>}
            </button>
          </form>
        ) : (
          <div className="text-center mt-4">
            <p className="text-sm text-muted">Vui lòng kiểm tra cả thư mục Spam nếu không thấy email trong hộp thư đến.</p>
          </div>
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
