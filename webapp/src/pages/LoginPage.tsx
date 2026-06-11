import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Download, Smartphone, X, Share2, PlusSquare, Monitor } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchApi } from '../api/client';
import { Capacitor } from '@capacitor/core';
import confetti from 'canvas-confetti';

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
  const isApp = Capacitor.isNativePlatform();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Trigger World Cup confetti effect
  const triggerWorldCupConfetti = () => {
    try {
      const soccer = confetti.shapeFromText({ text: '⚽' });
      const trophy = confetti.shapeFromText({ text: '🏆' });
      const flag = confetti.shapeFromText({ text: '🇻🇳' });
      const star = confetti.shapeFromText({ text: '⭐' });

      // Shoot from left corner
      confetti({
        particleCount: 25,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.85 },
        shapes: [soccer, trophy, flag, star],
        scalar: 2.2,
        zIndex: 1100
      });
      // Shoot from right corner
      confetti({
        particleCount: 25,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.85 },
        shapes: [soccer, trophy, flag, star],
        scalar: 2.2,
        zIndex: 1100
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      triggerWorldCupConfetti();
    }, 600);
    return () => clearTimeout(timer);
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
      
      if (data.token) {
        localStorage.setItem('session_token', data.token);
      }
      
      login(data.user);
      
      if (data.user.role === 'DEV') {
        navigate('/dev/feedbacks');
      } else if (data.user.role === 'KTV') {
        navigate('/ktv/my-orders');
      } else {
        navigate('/admin/orders');
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

  const flags = [
    { code: 'vn', name: 'Việt Nam' },
    { code: 'br', name: 'Brazil' },
    { code: 'ar', name: 'Argentina' },
    { code: 'fr', name: 'Pháp' },
    { code: 'de', name: 'Đức' },
    { code: 'gb', name: 'Anh' },
    { code: 'pt', name: 'Bồ Đào Nha' },
    { code: 'es', name: 'Tây Ban Nha' },
    { code: 'jp', name: 'Nhật Bản' },
    { code: 'it', name: 'Ý' },
    { code: 'hr', name: 'Croatia' },
    { code: 'be', name: 'Bỉ' }
  ];

  return (
    <div className="relative flex items-center justify-center h-screen overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 15%, #1F4068 0%, #162447 50%, #1A1A2E 100%)' }}>
      
      {/* Stadium Spotlight Beams */}
      <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none z-0">
        <div className="stadium-light left-beam"></div>
        <div className="stadium-light right-beam"></div>
      </div>

      {/* Hanging Bunting Flags (Cờ dây trang trí World Cup) */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none overflow-hidden h-[120px] flex justify-center">
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/10 shadow-md"></div>
        <div className="flex gap-2.5 sm:gap-4 md:gap-6 lg:gap-8 px-4 justify-around w-full max-w-7xl">
          {flags.map((flag, idx) => (
            <div 
              key={flag.code} 
              className="bunting-flag" 
              style={{ 
                backgroundImage: `url(https://flagcdn.com/w80/${flag.code}.png)`,
                animationDelay: `${idx * 0.12}s`,
                animationDuration: `${2.2 + (idx % 3) * 0.3}s`
              }}
              title={flag.name}
            />
          ))}
        </div>
      </div>

      {/* Floating soccer balls & flags background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="soccer-ball sb-1">⚽</div>
        <div className="soccer-ball sb-2">⚽</div>
        <div className="soccer-ball sb-3">⚽</div>
        <div className="soccer-ball sb-4">⚽</div>
        <div className="soccer-ball sb-5">⚽</div>
        <div className="soccer-ball sb-6">⚽</div>
        <div className="soccer-ball sb-7">⚽</div>
        <div className="soccer-ball sb-8">⚽</div>

        {/* Floating Waving Flags */}
        <div className="floating-flag ff-1" style={{ backgroundImage: 'url(https://flagcdn.com/w80/vn.png)', animationDelay: '1s' }}></div>
        <div className="floating-flag ff-2" style={{ backgroundImage: 'url(https://flagcdn.com/w80/br.png)', animationDelay: '3.5s' }}></div>
        <div className="floating-flag ff-3" style={{ backgroundImage: 'url(https://flagcdn.com/w80/ar.png)', animationDelay: '6s' }}></div>
        <div className="floating-flag ff-4" style={{ backgroundImage: 'url(https://flagcdn.com/w80/fr.png)', animationDelay: '2s' }}></div>
        <div className="floating-flag ff-5" style={{ backgroundImage: 'url(https://flagcdn.com/w80/de.png)', animationDelay: '8s' }}></div>
        <div className="floating-flag ff-6" style={{ backgroundImage: 'url(https://flagcdn.com/w80/pt.png)', animationDelay: '10.5s' }}></div>
        <div className="floating-flag ff-7" style={{ backgroundImage: 'url(https://flagcdn.com/w80/jp.png)', animationDelay: '12s' }}></div>
        <div className="floating-flag ff-8" style={{ backgroundImage: 'url(https://flagcdn.com/w80/es.png)', animationDelay: '5s' }}></div>
      </div>

      <style>{`
        /* Spotlight Glow Effects */
        .stadium-light {
          position: absolute;
          top: -20%;
          width: 50%;
          height: 100%;
          background: radial-gradient(ellipse at top, rgba(0, 163, 255, 0.15) 0%, rgba(0, 163, 255, 0) 70%);
          filter: blur(40px);
          pointer-events: none;
          transform-origin: top center;
        }
        .left-beam {
          left: -10%;
          transform: rotate(25deg);
          animation: sweep-left 12s ease-in-out infinite alternate;
        }
        .right-beam {
          right: -10%;
          transform: rotate(-25deg);
          animation: sweep-right 12s ease-in-out infinite alternate;
        }

        @keyframes sweep-left {
          0% { transform: rotate(15deg) scaleX(0.9); }
          100% { transform: rotate(35deg) scaleX(1.1); }
        }
        @keyframes sweep-right {
          0% { transform: rotate(-15deg) scaleX(0.9); }
          100% { transform: rotate(-35deg) scaleX(1.1); }
        }

        /* Bunting Flags Styling */
        .bunting-flag {
          width: 24px;
          height: 38px;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          border-bottom-left-radius: 4px;
          border-bottom-right-radius: 4px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45);
          transform-origin: top center;
          animation: swing 4s ease-in-out infinite alternate, wave-flag 2.5s ease-in-out infinite;
          position: relative;
        }
        @media (min-width: 640px) {
          .bunting-flag {
            width: 38px;
            height: 58px;
          }
        }
        .bunting-flag::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0.18) 25%,
            rgba(0,0,0,0.22) 50%,
            rgba(255,255,255,0.15) 75%,
            rgba(0,0,0,0) 100%
          );
          background-size: 200% 100%;
          animation: wind-shadow 2.2s linear infinite;
          border-bottom-left-radius: 4px;
          border-bottom-right-radius: 4px;
        }

        @keyframes swing {
          0% { transform: rotate(-7deg); }
          100% { transform: rotate(7deg); }
        }
        @keyframes wave-flag {
          0% { transform: rotate(-7deg) skewY(-2.5deg) scaleX(1); }
          50% { transform: rotate(0deg) skewY(2.5deg) scaleX(0.96); }
          100% { transform: rotate(7deg) skewY(-2.5deg) scaleX(1); }
        }
        @keyframes wind-shadow {
          0% { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }

        /* Floating Objects */
        @keyframes float-up {
          0% {
            transform: translateY(105vh) rotate(0deg) scale(0.6);
            opacity: 0;
          }
          10% { opacity: 0.35; }
          90% { opacity: 0.35; }
          100% {
            transform: translateY(-15vh) rotate(360deg) scale(1.1);
            opacity: 0;
          }
        }
        .soccer-ball {
          position: absolute;
          bottom: -50px;
          font-size: 2rem;
          user-select: none;
          pointer-events: none;
          animation: float-up 12s linear infinite;
          z-index: 0;
        }
        .sb-1 { left: 8%; animation-delay: 0s; animation-duration: 14s; }
        .sb-2 { left: 23%; animation-delay: 3s; animation-duration: 18s; font-size: 2.5rem; }
        .sb-3 { left: 43%; animation-delay: 6s; animation-duration: 15s; }
        .sb-4 { left: 58%; animation-delay: 1s; animation-duration: 20s; font-size: 3rem; }
        .sb-5 { left: 73%; animation-delay: 8s; animation-duration: 16s; }
        .sb-6 { left: 88%; animation-delay: 4s; animation-duration: 22s; font-size: 2.2rem; }
        .sb-7 { left: 33%; animation-delay: 10s; animation-duration: 17s; font-size: 1.8rem; }
        .sb-8 { left: 80%; animation-delay: 12s; animation-duration: 19s; font-size: 2.8rem; }

        /* Floating Waving Flags */
        .floating-flag {
          position: absolute;
          bottom: -60px;
          width: 32px;
          height: 22px;
          background-size: cover;
          background-position: center;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
          border-radius: 2px;
          animation: float-up-flag 15s linear infinite;
          opacity: 0;
          z-index: 0;
        }
        .floating-flag::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0.12) 25%,
            rgba(0,0,0,0.18) 50%,
            rgba(255,255,255,0.1) 75%,
            rgba(0,0,0,0) 100%
          );
          background-size: 200% 100%;
          animation: wind-shadow 2.5s linear infinite;
        }
        .ff-1 { left: 15%; animation-duration: 15s; }
        .ff-2 { left: 35%; animation-duration: 19s; }
        .ff-3 { left: 50%; animation-duration: 16s; }
        .ff-4 { left: 65%; animation-duration: 21s; }
        .ff-5 { left: 85%; animation-duration: 17s; }
        .ff-6 { left: 5%; animation-duration: 23s; }
        .ff-7 { left: 45%; animation-duration: 14s; }
        .ff-8 { left: 75%; animation-duration: 18s; }

        @keyframes float-up-flag {
          0% {
            transform: translateY(105vh) rotate(0deg) scale(0.7) skewY(0deg);
            opacity: 0;
          }
          10% { opacity: 0.3; }
          90% { opacity: 0.3; }
          100% {
            transform: translateY(-15vh) rotate(180deg) scale(1.15) skewY(4deg);
            opacity: 0;
          }
        }

        /* Pulsing World Cup Badge */
        @keyframes pulse-gold {
          0% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.5); }
          70% { box-shadow: 0 0 0 8px rgba(255, 215, 0, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
        }
        .badge-world-cup {
          background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%) !important;
          color: #0d1e36 !important;
          font-weight: 700 !important;
          box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.4) !important;
          animation: pulse-gold 2s infinite;
        }
      `}</style>

      {/* Gold card styling */}
      <div 
        className="card w-full animate-fade-in relative z-10" 
        style={{ 
          maxWidth: '400px', 
          margin: '1rem',
          border: '1.5px solid rgba(255, 215, 0, 0.35)', 
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.55), 0 0 20px rgba(255, 215, 0, 0.12)',
          backdropFilter: 'blur(8px)',
          background: 'rgba(255, 255, 255, 0.95)'
        }}
      >
        <div className="text-center mb-6">
          <img 
            src="/TRULIVA_WC.png" 
            alt="Truliva Logo" 
            onClick={triggerWorldCupConfetti}
            title="Bấm vào để bắn pháo hoa World Cup!"
            style={{ height: '65px', margin: '0 auto 0.75rem', cursor: 'pointer', transition: 'transform 0.2s' }} 
            className="mx-auto hover:opacity-90 active:scale-95 hover:scale-105"
          />
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] select-none badge-world-cup">
            <span>⚽</span>
            <span>World Cup Mode</span>
            <span>🏆</span>
          </div>
          <h2 className="font-bold text-xl mt-3 text-slate-800">Đăng nhập hệ thống KTV</h2>
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
