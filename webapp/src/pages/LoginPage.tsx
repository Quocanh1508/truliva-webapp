import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchApi } from '../api/client';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      
      login(data.user);
      
      if (data.user.role === 'ADMIN') {
        navigate('/admin');
      } else if (data.user.role === 'DEV') {
        navigate('/dev/feedbacks');
      } else {
        navigate('/ktv/report');
      }
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
          <h2 className="font-bold text-xl">Đăng nhập hệ thống KTV</h2>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Tài khoản</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập username"
              required
            />
          </div>

          <div className="form-group mb-6">
            <label className="form-label">Mật khẩu</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full flex justify-center"
            disabled={loading || !username || !password}
          >
            {loading ? <span className="spinner"></span> : <><LogIn size={20} /> Đăng nhập</>}
          </button>
        </form>
      </div>
    </div>
  );
}
