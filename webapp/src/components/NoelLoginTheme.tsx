import { Snowflake } from 'lucide-react';
import knitBase from '../assets/noel-knit-base.webp';
import knitScene from '../assets/noel-knit-scene.webp';

// Rải đều ngang màn hình, lệch pha nhau; mỗi bông rơi 24–40 giây
const FLAKES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 37 + 4) % 100}%`,
  size: 10 + ((i * 5) % 9),
  opacity: 0.35 + ((i * 3) % 5) * 0.1,
  animationDuration: `${24 + ((i * 7) % 17)}s`,
  animationDelay: `${-i * 4.3}s`,
}));

/** Nền len, tuyết rơi và màu Giáng sinh cho trang đăng nhập (phần tử cha có class `noel-login`). */
export default function NoelLoginTheme() {
  return (
    <>
      <style>{`
        .noel-login.cyber-bg {
          background: url(${knitBase}) center top / 168px auto repeat, #5E0A17;
        }
        .noel-band {
          position: absolute;
          left: 0;
          right: 0;
          pointer-events: none;
          background: url(${knitScene}) center bottom / 336px auto repeat-x;
        }
        .noel-band-top { top: 0; height: 29.333px; }
        .noel-band-bottom { bottom: 0; height: 110px; }
        @media (min-width: 768px) {
          .noel-login.cyber-bg { background-size: 252px auto, auto; }
          .noel-band { background-size: 504px auto; }
          .noel-band-top { height: 44px; }
          .noel-band-bottom { height: 165px; }
        }

        @keyframes noelSnow {
          from { transform: translate3d(0, -20px, 0); }
          33% { transform: translate3d(14px, 33%, 0); }
          66% { transform: translate3d(-8px, 66%, 0); }
          to { transform: translate3d(8px, 100%, 0); }
        }
        .noel-snow {
          position: absolute;
          top: 0;
          bottom: 0;
          color: white;
          animation: noelSnow 30s linear infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .noel-snow { display: none; }
        }

        /* Thẻ đăng nhập: miếng vải khâu chỉ kem */
        .noel-login .glow-card {
          background: #3E0610;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          border: 2px dashed rgba(248, 239, 222, 0.6);
          outline: 8px solid #3E0610;
          box-shadow: 0 24px 50px 4px rgba(20, 0, 5, 0.55);
        }
        .noel-login .cyber-label { color: #F3E2CF; }
        .noel-login .cyber-input {
          background: rgba(28, 2, 8, 0.6);
          border-color: rgba(248, 239, 222, 0.28);
        }
        .noel-login .cyber-input:focus {
          background: rgba(28, 2, 8, 0.8);
          border-color: #F0BA48;
          box-shadow: 0 0 0 3px rgba(240, 186, 72, 0.25);
        }
        .noel-login .cyber-input::placeholder { color: #C6A396; }
        .noel-login .cyber-btn {
          background: #1C6B44;
          box-shadow: 0 4px 12px rgba(10, 0, 3, 0.4);
        }
        .noel-login .cyber-btn:hover:not(:disabled) {
          background: #237D50;
          box-shadow: 0 6px 16px rgba(10, 0, 3, 0.45);
        }
        .noel-login .cyber-alert {
          background: #FDECEA;
          border-color: #F3B8B2;
          color: #8E1B1B;
        }

        /* Chữ/icon xanh trong thẻ và 2 hộp hướng dẫn cài app */
        .noel-login .text-blue-400,
        .noel-login .hover\\:text-blue-300:hover { color: #F7DFB0; }
        .noel-login .bg-blue-500\\/10 {
          background-color: rgba(247, 223, 176, 0.12);
          border-color: rgba(247, 223, 176, 0.35);
        }
        .noel-login .bg-slate-900 { background-color: #3E0610; }
        .noel-login .bg-slate-800 { background-color: #5A0D1A; }
        .noel-login .text-slate-300,
        .noel-login .text-slate-400 { color: #E6CFC0; }
      `}</style>

      <div aria-hidden="true" className="absolute inset-0 pointer-events-none z-0">
        <div className="noel-band noel-band-top" />
        <div className="noel-band noel-band-bottom" />
        {FLAKES.map(({ left, size, opacity, ...timing }) => (
          <div key={left} className="noel-snow" style={{ left, opacity, ...timing }}>
            <Snowflake size={size} />
          </div>
        ))}
      </div>
    </>
  );
}
