import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Download, Smartphone, X, Share2, PlusSquare, Monitor } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchApi } from '../api/client';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Modals and PWA states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosModal, setShowIosModal] = useState(false);
  const [showGeneralModal, setShowGeneralModal] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  // Detect if running inside the Capacitor mobile app shell
  const isApp = window.hasOwnProperty('Capacitor') || (window as any).Capacitor !== undefined;

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

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
        navigate('/admin/orders');
      } else if (data.user.role === 'DEV') {
        navigate('/dev/feedbacks');
      } else {
        navigate('/ktv/my-orders');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAppClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isAndroid = /android/i.test(userAgent);
    const isiOS = /ipad|iphone|ipod/i.test(userAgent) && !(window as any).MSStream;

    if (isAndroid) {
      // Tải trực tiếp file APK được phục vụ từ thư mục public
      window.location.href = '/app-debug.apk';
    } else if (isiOS) {
      // Hiển thị modal hướng dẫn cách "Thêm vào MH chính" trên iOS Safari
      setShowIosModal(true);
    } else {
      // Thiết bị Desktop/Khác
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult: any) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted PWA installation');
          }
          setDeferredPrompt(null);
        });
      } else {
        // Hiện hộp thoại chung cung cấp cả link tải APK và hướng dẫn iOS
        setShowGeneralModal(true);
      }
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
            <div className="flex justify-between items-center mb-2">
              <label className="form-label mb-0">Mật khẩu</label>
              <Link to="/forgot-password" style={{ color: '#00A3FF' }} className="text-sm font-semibold hover:underline">
                Quên mật khẩu?
              </Link>
            </div>
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

        {/* Nút tải ứng dụng hiển thị ở cuối thẻ đăng nhập (chỉ hiện trên web browser, ẩn khi đã chạy trong native app shell) */}
        {!isApp && (
          <div className="text-center mt-6 pt-4 border-t border-slate-200">
            <button
              onClick={handleDownloadAppClick}
              className="inline-flex items-center gap-2 text-sm font-semibold hover:underline transition-all"
              style={{ color: '#00A3FF' }}
            >
              <Download size={16} /> Tải ứng dụng Truliva Mobile
            </button>
          </div>
        )}
      </div>

      {/* Modal hướng dẫn cho iOS (iPhone/iPad) */}
      {showIosModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 animate-slide-up shadow-2xl relative text-slate-800">
            <button 
              onClick={() => setShowIosModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-3 text-sky-600">
                <Smartphone size={24} />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Cài đặt Truliva trên iPhone</h3>
              <p className="text-slate-500 text-sm mt-1">Vui lòng làm theo hướng dẫn dưới đây sử dụng trình duyệt Safari</p>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">1</div>
                <p className="text-sm text-slate-600">
                  Bấm vào nút <strong>Chia sẻ (Share)</strong> <span className="inline-block p-1 bg-slate-100 rounded border border-slate-200 align-middle"><Share2 size={14} className="inline text-sky-600" /></span> trên thanh công cụ ở dưới cùng Safari.
                </p>
              </div>
              
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">2</div>
                <p className="text-sm text-slate-600">
                  Kéo danh sách xuống dưới và chọn <strong>"Thêm vào MH chính" (Add to Home Screen)</strong> <span className="inline-block p-1 bg-slate-100 rounded border border-slate-200 align-middle"><PlusSquare size={14} className="inline text-slate-600" /></span>.
                </p>
              </div>
              
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">3</div>
                <p className="text-sm text-slate-600">
                  Bấm <strong>Thêm (Add)</strong> ở góc trên bên phải màn hình để hoàn tất cài đặt ứng dụng.
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => setShowIosModal(false)}
              className="w-full btn btn-primary py-2.5 rounded-xl font-semibold flex justify-center"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

      {/* Modal lựa chọn cho Desktop / Thiết bị khác */}
      {showGeneralModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-fade-in shadow-2xl relative text-slate-800">
            <button 
              onClick={() => setShowGeneralModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-3 text-sky-600">
                <Monitor size={24} />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Cài đặt ứng dụng Truliva</h3>
              <p className="text-slate-500 text-sm mt-1">Chọn phương thức cài đặt phù hợp với thiết bị của bạn</p>
            </div>
            
            <div className="space-y-3 mb-6">
              <a 
                href="/app-debug.apk"
                className="flex items-center gap-4 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">APK</div>
                <div>
                  <div className="font-semibold text-sm text-slate-900">Tải file cài đặt Android (APK)</div>
                  <div className="text-xs text-slate-500">Tải trực tiếp file app-debug.apk để cài đặt thủ công</div>
                </div>
              </a>
              
              <button 
                onClick={() => {
                  setShowGeneralModal(false);
                  setShowIosModal(true);
                }}
                className="w-full flex items-center gap-4 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Smartphone size={20} /></div>
                <div>
                  <div className="font-semibold text-sm text-slate-900">Hướng dẫn cài đặt trên iPhone (iOS)</div>
                  <div className="text-xs text-slate-500">Thêm ứng dụng vào màn hình chính qua trình duyệt Safari</div>
                </div>
              </button>
            </div>
            
            <button 
              onClick={() => setShowGeneralModal(false)}
              className="w-full btn btn-primary py-2.5 rounded-xl font-semibold flex justify-center"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
