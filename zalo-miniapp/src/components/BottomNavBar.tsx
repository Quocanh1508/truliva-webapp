import React from 'react';
import { Home, Store, MessageCircle, User, BookOpen } from 'lucide-react';
import { openChat } from 'zmp-sdk/apis';
import { useCart } from '../context/CartContext';
import { FEATURES } from '../config/features';

export type MainTabType = 'home' | 'shop' | 'chat' | 'profile';

interface BottomNavBarProps {
  activeTab: MainTabType;
  onChangeTab: (tab: MainTabType) => void;
}

export default function BottomNavBar({ activeTab, onChangeTab }: BottomNavBarProps) {
  const { totalItemsCount } = useCart();
  const handleOpenOaChat = async () => {
    try {
      await openChat({
        type: 'oa',
        id: '3870382725035413507'
      });
    } catch (err) {
      window.location.href = 'https://zalo.me/3870382725035413507';
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-1 pointer-events-none">
      <nav 
        aria-label="Bottom Navigation" 
        className="max-w-md mx-auto pointer-events-auto bg-white/85 backdrop-blur-2xl border border-white/80 shadow-[0_12px_40px_rgba(11,37,69,0.14)] rounded-[2rem] py-2 px-2 flex justify-around items-center"
      >
        {/* 🏠 Trang chủ */}
        <button 
          onClick={() => onChangeTab('home')}
          className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer touch-tactile ${
            activeTab === 'home' 
              ? 'text-[#1B3A6B] font-black' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <div className={`relative px-3.5 py-1 rounded-full transition-all duration-300 ${
            activeTab === 'home' 
              ? 'bg-gradient-to-r from-sky-100 via-sky-50 to-blue-100 text-[#0284C7] shadow-[0_2px_10px_rgba(2,132,199,0.15)] ring-1 ring-sky-200/50' 
              : 'text-slate-400'
          }`}>
            <Home size={19} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight flex items-center gap-1">
            Trang chủ
            {activeTab === 'home' && <span className="w-1 h-1 rounded-full bg-[#0284C7]"></span>}
          </span>
        </button>

        {/* 🛍️ Cửa hàng hoặc 📖 Sản phẩm */}
        <button 
          onClick={() => onChangeTab('shop')}
          className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer touch-tactile ${
            activeTab === 'shop' 
              ? 'text-[#1B3A6B] font-black' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <div className={`relative px-3.5 py-1 rounded-full transition-all duration-300 ${
            activeTab === 'shop' 
              ? 'bg-gradient-to-r from-sky-100 via-sky-50 to-blue-100 text-[#0284C7] shadow-[0_2px_10px_rgba(2,132,199,0.15)] ring-1 ring-sky-200/50' 
              : 'text-slate-400'
          }`}>
            {FEATURES.ENABLE_ECOMMERCE ? (
              <Store size={19} strokeWidth={activeTab === 'shop' ? 2.5 : 2} />
            ) : (
              <BookOpen size={19} strokeWidth={activeTab === 'shop' ? 2.5 : 2} />
            )}
            {FEATURES.ENABLE_ECOMMERCE && totalItemsCount > 0 && (
              <span className="absolute -top-1 -right-0.5 min-w-[17px] h-4 bg-rose-500 text-white rounded-full text-[9px] font-black px-1 flex items-center justify-center shadow-xs border-2 border-white animate-pulse">
                {totalItemsCount > 99 ? '99+' : totalItemsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight flex items-center gap-1">
            {FEATURES.ENABLE_ECOMMERCE ? 'Cửa hàng' : 'Sản phẩm'}
            {activeTab === 'shop' && <span className="w-1 h-1 rounded-full bg-[#0284C7]"></span>}
          </span>
        </button>

        {/* 💬 Tư vấn Zalo OA */}
        <button 
          onClick={handleOpenOaChat}
          className="flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-2xl text-slate-400 hover:text-slate-600 font-semibold transition-all duration-200 active:scale-95 cursor-pointer touch-tactile"
        >
          <div className="relative px-3.5 py-1 rounded-full text-slate-400 hover:bg-slate-50 transition-colors">
            <MessageCircle size={19} strokeWidth={2} />
            <span className="absolute top-0.5 right-2 w-2 h-2 bg-[#00A3FF] rounded-full animate-pulse shadow-[0_0_8px_rgba(0,163,255,0.8)]"></span>
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Tư vấn OA</span>
        </button>

        {/* 👤 Cá nhân */}
        <button 
          onClick={() => onChangeTab('profile')}
          className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer touch-tactile ${
            activeTab === 'profile' 
              ? 'text-[#1B3A6B] font-black' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <div className={`relative px-3.5 py-1 rounded-full transition-all duration-300 ${
            activeTab === 'profile' 
              ? 'bg-gradient-to-r from-sky-100 via-sky-50 to-blue-100 text-[#0284C7] shadow-[0_2px_10px_rgba(2,132,199,0.15)] ring-1 ring-sky-200/50' 
              : 'text-slate-400'
          }`}>
            <User size={19} strokeWidth={activeTab === 'profile' ? 2.5 : 2} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight flex items-center gap-1">
            Cá nhân
            {activeTab === 'profile' && <span className="w-1 h-1 rounded-full bg-[#0284C7]"></span>}
          </span>
        </button>
      </nav>
    </div>
  );
}
