import React from 'react';
import { Home, Store, MessageCircle, User } from 'lucide-react';
import { openChat } from 'zmp-sdk/apis';

export type MainTabType = 'home' | 'shop' | 'chat' | 'profile';

interface BottomNavBarProps {
  activeTab: MainTabType;
  onChangeTab: (tab: MainTabType) => void;
}

export default function BottomNavBar({ activeTab, onChangeTab }: BottomNavBarProps) {
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
        className="max-w-md mx-auto pointer-events-auto bg-white/90 backdrop-blur-xl border border-slate-200/90 shadow-[0_8px_32px_rgba(11,37,69,0.12)] rounded-3xl py-2 px-2 flex justify-around items-center"
      >
        {/* 🏠 Trang chủ */}
        <button 
          onClick={() => onChangeTab('home')}
          className={`flex-1 flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer ${
            activeTab === 'home' 
              ? 'text-[#1B3A6B] font-black' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <div className={`relative px-3 py-1 rounded-full transition-all duration-300 ${
            activeTab === 'home' 
              ? 'bg-gradient-to-r from-sky-100/90 to-blue-100/80 text-[#0284C7] shadow-xs' 
              : 'text-slate-400'
          }`}>
            <Home size={19} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Trang chủ</span>
        </button>

        {/* 🛍️ Cửa hàng */}
        <button 
          onClick={() => onChangeTab('shop')}
          className={`flex-1 flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer ${
            activeTab === 'shop' 
              ? 'text-[#1B3A6B] font-black' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <div className={`relative px-3 py-1 rounded-full transition-all duration-300 ${
            activeTab === 'shop' 
              ? 'bg-gradient-to-r from-sky-100/90 to-blue-100/80 text-[#0284C7] shadow-xs' 
              : 'text-slate-400'
          }`}>
            <Store size={19} strokeWidth={activeTab === 'shop' ? 2.5 : 2} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Cửa hàng</span>
        </button>

        {/* 💬 Tư vấn Zalo OA */}
        <button 
          onClick={handleOpenOaChat}
          className="flex-1 flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-2xl text-slate-400 hover:text-slate-600 font-semibold transition-all duration-200 active:scale-95 cursor-pointer"
        >
          <div className="relative px-3 py-1 rounded-full text-slate-400 hover:bg-slate-50 transition-colors">
            <MessageCircle size={19} strokeWidth={2} />
            <span className="absolute top-0.5 right-2 w-2 h-2 bg-[#00A3FF] rounded-full animate-pulse"></span>
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Tư vấn OA</span>
        </button>

        {/* 👤 Cá nhân */}
        <button 
          onClick={() => onChangeTab('profile')}
          className={`flex-1 flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer ${
            activeTab === 'profile' 
              ? 'text-[#1B3A6B] font-black' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <div className={`relative px-3 py-1 rounded-full transition-all duration-300 ${
            activeTab === 'profile' 
              ? 'bg-gradient-to-r from-sky-100/90 to-blue-100/80 text-[#0284C7] shadow-xs' 
              : 'text-slate-400'
          }`}>
            <User size={19} strokeWidth={activeTab === 'profile' ? 2.5 : 2} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Cá nhân</span>
        </button>
      </nav>
    </div>
  );
}
