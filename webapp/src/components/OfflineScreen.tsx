import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineScreen() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Fallback interval to verify navigator.onLine status
    const checkInterval = setInterval(() => {
      if (navigator.onLine !== !isOffline) {
        setIsOffline(!navigator.onLine);
      }
    }, 2500);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkInterval);
    };
  }, [isOffline]);

  if (!isOffline) return null;

  const handleCheckConnection = () => {
    setIsOffline(!navigator.onLine);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xs z-[9999] flex flex-col items-center justify-center p-6 text-center animate-fade-in font-sans">
      <div className="bg-red-500/10 p-5 rounded-full mb-6 border border-red-500/20 animate-pulse">
        <WifiOff size={44} className="text-red-500" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Mất kết nối Internet</h2>
      <p className="text-sm text-slate-400 max-w-xs mb-6 leading-relaxed">
        Thiết bị hiện không có kết nối mạng. Vui lòng kiểm tra lại Wifi hoặc dung lượng mạng di động (3G/4G/5G).
      </p>
      <button
        onClick={handleCheckConnection}
        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md active:scale-95 transition-all text-sm outline-none"
      >
        Thử kết nối lại
      </button>
    </div>
  );
}
