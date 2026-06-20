import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Download, Smartphone, X, Share2, PlusSquare, Monitor, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchApi } from '../api/client';
import { Capacitor } from '@capacitor/core';

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

  // 3D Tilt and Glare Effect
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    // Max tilt angle is 8 degrees
    const rotateX = -(y - yc) / 25;
    const rotateY = (x - xc) / 25;
    setTilt({ x: rotateY, y: rotateX });
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.15,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setGlare(prev => ({ ...prev, opacity: 0 }));
  };

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
      window.location.href = '/Truliva_technician.apk';
    } else if (isiOS) {
      setShowIosModal(true);
    } else {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult: any) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted PWA installation');
          }
          setDeferredPrompt(null);
        });
      } else {
        setShowGeneralModal(true);
      }
    }
  };

  return (
    <div className="relative flex items-center justify-center h-screen overflow-hidden cyber-bg">
      
      {/* Subtle grid pattern overlay */}
      <div className="absolute inset-0 pointer-events-none z-0 cyber-grid" />

      {/* Ambient Glowing Orbs */}
      <div className="cyber-orb orb-blue z-0" />
      <div className="cyber-orb orb-cyan z-0" />

      <style>{`
        .cyber-bg {
          background: radial-gradient(circle at 50% 30%, #0B132B 0%, #050A16 70%, #010204 100%);
        }

        .cyber-grid {
          background-image: 
            linear-gradient(rgba(59, 130, 246, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.04) 1px, transparent 1px);
          background-size: 32px 32px;
          background-position: center;
        }

        .cyber-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          pointer-events: none;
          opacity: 0.35;
          mix-blend-mode: screen;
        }

        .orb-blue {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, rgba(37, 99, 235, 0) 70%);
          top: -10%;
          left: 15%;
          animation: float-slow 15s infinite alternate;
        }

        .orb-cyan {
          width: 550px;
          height: 550px;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, rgba(6, 182, 212, 0) 70%);
          bottom: -10%;
          right: 15%;
          animation: float-slow 20s infinite alternate-reverse;
        }

        @keyframes float-slow {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(30px, 20px) scale(1.05); }
        }

        /* 3D Glassmorphism Card Style */
        .glow-card {
          position: relative;
          background: rgba(10, 18, 36, 0.75);
          backdrop-filter: blur(16px);
          border-radius: 1.25rem;
          padding: 2.25rem 2rem;
          width: 100%;
          max-width: 400px;
          margin: 1.5rem;
          box-shadow: 
            0 15px 35px -5px rgba(0, 0, 0, 0.5), 
            0 5px 15px -5px rgba(0, 0, 0, 0.3),
            0 0 30px rgba(59, 130, 246, 0.05);
          transform-style: preserve-3d;
        }

        .glow-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 1.25rem;
          padding: 1.5px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(6, 182, 212, 0.08), rgba(59, 130, 246, 0.08), rgba(6, 182, 212, 0.3));
          -webkit-mask: 
             linear-gradient(#fff 0 0) content-box, 
             linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          pointer-events: none;
        }

        .cyber-label {
          color: #94a3b8;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 6px;
          display: block;
        }

        .cyber-input {
          background: rgba(5, 10, 20, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: white;
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
          font-size: 14px;
          transition: all 0.25s ease;
        }

        .cyber-input:focus {
          border-color: rgba(59, 130, 246, 0.7);
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.25);
          background: rgba(5, 10, 20, 0.7);
          outline: none;
        }

        .cyber-input::placeholder {
          color: #475569;
        }

        .cyber-btn {
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
          border: none;
          color: white;
          font-weight: 600;
          font-size: 14px;
          padding: 0.85rem;
          border-radius: 0.75rem;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
          transition: all 0.25s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .cyber-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
          transform: translateY(-1px);
        }

        .cyber-btn:active:not(:disabled) {
          transform: translateY(1px);
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2);
        }

        .cyber-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .cyber-alert {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #F87171;
          padding: 0.75rem;
          border-radius: 0.75rem;
          font-size: 13px;
          margin-bottom: 1.25rem;
          text-align: center;
        }
      `}</style>

      {/* Login Card */}
      <div 
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="glow-card relative z-10 transition-all duration-300 group"
        style={{
          transform: `perspective(1000px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)`,
          transition: 'transform 0.1s ease, box-shadow 0.3s ease',
        }}
      >
        {/* Dynamic glare shine effect overlay */}
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle 180px at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.08), transparent 100%)`,
            opacity: glare.opacity,
            mixBlendMode: 'overlay',
          }}
        />

        <div className="text-center mb-6">
          <div className="flex justify-center mb-4 relative">
            <img 
              src="/logo.jpg" 
              alt="Truliva Logo" 
              className="h-16 rounded-xl bg-white p-1 shadow-md border border-white/10 object-contain transition-transform duration-300 group-hover:scale-105"
            />
            {/* Ambient logo glow */}
            <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full pointer-events-none z-[-1]" />
          </div>
          
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 select-none">
            <ShieldCheck size={11} className="text-blue-400 animate-pulse" />
            <span>Kỹ thuật viên</span>
          </div>
          <h2 className="font-bold text-xl mt-3 text-white tracking-wide">Đăng nhập hệ thống</h2>
        </div>

        {error && <div className="cyber-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label className="cyber-label">Tài khoản</label>
            <input
              type="text"
              className="cyber-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
              required
            />
          </div>

          <div className="form-group">
            <div className="flex justify-between items-center mb-1">
              <label className="cyber-label mb-0">Mật khẩu</label>
              <Link to="/forgot-password" style={{ color: '#60A5FA' }} className="text-xs font-semibold hover:underline transition-colors">
                Quên mật khẩu?
              </Link>
            </div>
            <input
              type="password"
              className="cyber-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          <button
            type="submit"
            className="cyber-btn w-full mt-2"
            disabled={loading || !username || !password}
          >
            {loading ? <span className="spinner border-2 border-white/30 border-t-white rounded-full w-5 h-5 animate-spin"></span> : <><LogIn size={18} /> Đăng nhập</>}
          </button>
        </form>

        {/* Nút tải ứng dụng hiển thị ở cuối thẻ đăng nhập */}
        {!isApp && (
          <div className="text-center mt-6 pt-4 border-t border-white/5">
            <button
              onClick={handleDownloadAppClick}
              className="inline-flex items-center gap-2 text-xs font-semibold hover:underline transition-all text-blue-400 hover:text-blue-300"
            >
              <Download size={14} /> Tải ứng dụng Truliva Mobile
            </button>
          </div>
        )}
      </div>

      {/* Modal hướng dẫn cho iOS (iPhone/iPad) */}
      {showIosModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 animate-slide-up shadow-2xl relative text-white">
            <button 
              onClick={() => setShowIosModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-400">
                <Smartphone size={24} />
              </div>
              <h3 className="font-bold text-lg text-white">Cài đặt Truliva trên iPhone</h3>
              <p className="text-slate-400 text-sm mt-1">Vui lòng làm theo hướng dẫn dưới đây sử dụng trình duyệt Safari</p>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">1</div>
                <p className="text-sm text-slate-300">
                  Bấm vào nút <strong>Chia sẻ (Share)</strong> <span className="inline-block p-1 bg-slate-800 rounded border border-white/10 align-middle"><Share2 size={12} className="inline text-blue-400" /></span> trên thanh công cụ ở dưới cùng Safari.
                </p>
              </div>
              
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">2</div>
                <p className="text-sm text-slate-300">
                  Kéo danh sách xuống dưới và chọn <strong>"Thêm vào MH chính" (Add to Home Screen)</strong> <span className="inline-block p-1 bg-slate-800 rounded border border-white/10 align-middle"><PlusSquare size={12} className="inline text-blue-400" /></span>.
                </p>
              </div>
              
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">3</div>
                <p className="text-sm text-slate-300">
                  Bấm <strong>Thêm (Add)</strong> ở góc trên bên phải màn hình để hoàn tất cài đặt ứng dụng.
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => setShowIosModal(false)}
              className="w-full cyber-btn py-2.5 rounded-xl font-semibold flex justify-center"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

      {/* Modal lựa chọn cho Desktop / Thiết bị khác */}
      {showGeneralModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 animate-fade-in shadow-2xl relative text-white">
            <button 
              onClick={() => setShowGeneralModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-400">
                <Monitor size={24} />
              </div>
              <h3 className="font-bold text-lg text-white">Cài đặt ứng dụng Truliva</h3>
              <p className="text-slate-400 text-sm mt-1">Chọn phương thức cài đặt phù hợp với thiết bị của bạn</p>
            </div>
            
            <div className="space-y-3 mb-6">
              <a 
                href="/Truliva_technician.apk"
                className="flex items-center gap-4 p-3.5 rounded-xl border border-white/5 hover:border-white/10 bg-slate-950/40 hover:bg-slate-950/60 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center font-bold text-sm shrink-0">APK</div>
                <div>
                  <div className="font-semibold text-sm text-white group-hover:text-emerald-300 transition-colors">Tải file cài đặt Android (APK)</div>
                  <div className="text-xs text-slate-400">Tải trực tiếp file Truliva_technician.apk để cài đặt thủ công</div>
                </div>
              </a>
              
              <button 
                onClick={() => {
                  setShowGeneralModal(false);
                  setShowIosModal(true);
                }}
                className="w-full flex items-center gap-4 p-3.5 rounded-xl border border-white/5 hover:border-white/10 bg-slate-950/40 hover:bg-slate-950/60 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/25 flex items-center justify-center shrink-0"><Smartphone size={18} /></div>
                <div>
                  <div className="font-semibold text-sm text-white group-hover:text-blue-300 transition-colors">Hướng dẫn cài đặt trên iPhone (iOS)</div>
                  <div className="text-xs text-slate-400">Thêm ứng dụng vào màn hình chính qua trình duyệt Safari</div>
                </div>
              </button>
            </div>
            
            <button 
              onClick={() => setShowGeneralModal(false)}
              className="w-full cyber-btn py-2.5 rounded-xl font-semibold flex justify-center"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
