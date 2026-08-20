import React from 'react';
import { Home, MessageCircle, User } from 'lucide-react';
import { openChat } from 'zmp-sdk/apis';

interface BottomNavBarProps {
  activeTab: 'home' | 'chat' | 'profile';
  onChangeTab: (tab: 'home' | 'chat' | 'profile') => void;
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
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-2 px-6 flex justify-around items-center max-w-md mx-auto shadow-lg">
      
      {/* 🏠 Trang chủ */}
      <button 
        onClick={() => onChangeTab('home')}
        className={`flex flex-col items-center justify-center space-y-0.5 transition-colors cursor-pointer ${
          activeTab === 'home' ? 'text-[#0284C7] font-bold' : 'text-slate-400 hover:text-slate-600 font-medium'
        }`}
      >
        <div className={`p-1 rounded-full ${activeTab === 'home' ? 'bg-sky-50' : ''}`}>
          <Home size={20} />
        </div>
        <span className="text-[10px]">Trang chủ</span>
      </button>

      {/* 💬 Tin nhắn (Zalo OA) */}
      <button 
        onClick={handleOpenOaChat}
        className="flex flex-col items-center justify-center space-y-0.5 transition-colors cursor-pointer text-slate-400 hover:text-slate-600 font-medium"
      >
        <div className="p-1 rounded-full">
          <MessageCircle size={20} />
        </div>
        <span className="text-[10px]">Tin nhắn</span>
      </button>

      {/* 👤 Cá nhân */}
      <button 
        onClick={() => onChangeTab('profile')}
        className={`flex flex-col items-center justify-center space-y-0.5 transition-colors cursor-pointer ${
          activeTab === 'profile' ? 'text-[#0284C7] font-bold' : 'text-slate-400 hover:text-slate-600 font-medium'
        }`}
      >
        <div className={`p-1 rounded-full ${activeTab === 'profile' ? 'bg-sky-50' : ''}`}>
          <User size={20} />
        </div>
        <span className="text-[10px]">Cá nhân</span>
      </button>
    </div>
  );
}
