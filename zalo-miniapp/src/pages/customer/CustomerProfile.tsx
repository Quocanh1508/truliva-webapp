import React, { useState, useRef } from 'react';
import { 
  User, 
  Phone, 
  ShieldCheck, 
  Wrench, 
  QrCode, 
  Star, 
  Ticket, 
  History, 
  HelpCircle, 
  ChevronRight, 
  LogOut,
  Droplets,
  Calendar,
  MessageSquare,
  Crown,
  Award,
  Gem,
  Sparkles
} from 'lucide-react';
import { openWebview, openChat } from 'zmp-sdk/apis';
import { getCustomerRank, MemberTier, RANK_CONFIGS, NEXT_TIER_ORDER } from '../../utils/memberRank';
import CustomerVoucherModal from '../../components/CustomerVoucherModal';
import CustomerHistoryModal from '../../components/CustomerHistoryModal';
import CustomerLoyaltyModal from '../../components/CustomerLoyaltyModal';

interface CustomerProfileProps {
  user: any;
  mySerials: any[];
  onLogout?: () => void;
  onOpenScanner?: () => void;
}

export default function CustomerProfile({ user, mySerials, onLogout, onOpenScanner }: CustomerProfileProps) {
  const [overrideTier, setOverrideTier] = useState<MemberTier | null>(null);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);
  
  const devicesSectionRef = useRef<HTMLDivElement>(null);

  const userName = user?.fullName || 'Khách hàng Truliva';
  const userPhone = user?.phoneNumber || 'Chưa cập nhật SĐT';
  const userPoints = Number(user?.rewardPoints ?? user?.points ?? 250);
  const baseRank = getCustomerRank(user, userPoints);
  const rank = overrideTier ? RANK_CONFIGS[overrideTier] : baseRank;

  const handleCycleTier = () => {
    const currentIndex = NEXT_TIER_ORDER.indexOf(rank.tier);
    const nextTier = NEXT_TIER_ORDER[(currentIndex + 1) % NEXT_TIER_ORDER.length];
    setOverrideTier(nextTier);
  };

  const handleBookMaintenance = async (serialNumber?: string) => {
    const url = serialNumber 
      ? `https://trulivaofficial.com/warranty-activate?serial=${encodeURIComponent(serialNumber)}`
      : 'https://trulivaofficial.com/warranty-activate';
    try {
      await openWebview({ url });
    } catch (err) {
      window.open(url, '_blank');
    }
  };

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

  const scrollToDevices = () => {
    devicesSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="pb-20 bg-slate-50 min-h-screen">
      {/* 1. Header Profile Card (P3R Ocean Depth) */}
      <div className="bg-gradient-to-b from-[#061226] via-[#0B2545] to-[#0F3866] text-white p-5 pt-5 pb-9 rounded-b-[2.2rem] shadow-xl relative overflow-hidden">
        {/* Floating Realistic Water Bubbles */}
        <div className="water-bubble w-4 h-4 left-[8%] bottom-1 bubble-anim-1"></div>
        <div className="water-bubble w-6 h-6 left-[22%] bottom-2 bubble-anim-2"></div>
        <div className="water-bubble w-3.5 h-3.5 left-[50%] bottom-1 bubble-anim-3"></div>
        <div className="water-bubble w-5 h-5 left-[75%] bottom-3 bubble-anim-4"></div>
        <div className="water-bubble w-4 h-4 left-[90%] bottom-2 bubble-anim-5"></div>

        <div className="max-w-md mx-auto space-y-4 relative z-10">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className={`w-16 h-16 rounded-full bg-[#0B2545] border-2 ring-2 flex items-center justify-center text-white font-black text-xl overflow-hidden transition-all ${rank.ringColor}`}>
                {user?.avatar ? (
                  <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={32} className="text-cyan-200" />
                )}
              </div>
              <span 
                className="absolute bottom-0 right-0 w-4 h-4 border-2 border-[#061226] rounded-full transition-all"
                style={{ backgroundColor: rank.iconColor }}
              ></span>
            </div>
            
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-white truncate drop-shadow-sm">{userName}</h1>
              <p className="text-xs text-sky-200 flex items-center mt-0.5 font-medium">
                <Phone size={12} className="mr-1 flex-shrink-0 text-[#00D2FF]" />
                {userPhone}
              </p>
              
              {/* Dynamic Rank Badge (Click to Preview all tiers) */}
              <button 
                onClick={handleCycleTier}
                title="Nhấn để đổi xem màu các hạng thành viên: Đồng ➔ Bạc ➔ Vàng ➔ Kim Cương"
                className={`mt-2 inline-block p3r-slanted-badge ${rank.badgeBg} border ${rank.borderColor} px-3 py-0.5 text-[9px] font-black ${rank.textColor} uppercase tracking-wider ${rank.shadowGlow} active:scale-95 transition-all cursor-pointer`}
              >
                <div className="flex items-center space-x-1.5">
                  {rank.tier === 'GOLD' ? (
                    <Crown size={11} style={{ color: rank.iconColor }} />
                  ) : rank.tier === 'DIAMOND' ? (
                    <Gem size={11} style={{ color: rank.iconColor }} />
                  ) : rank.tier === 'BRONZE' ? (
                    <Award size={11} style={{ color: rank.iconColor }} />
                  ) : (
                    <Sparkles size={11} style={{ color: rank.iconColor }} />
                  )}
                  <span>{rank.label} ({overrideTier ? rank.minPoints : userPoints} Điểm)</span>
                </div>
              </button>
            </div>
          </div>

          {/* Quick Stats Grid (Interactive P3R HUD Panel) */}
          <div className="grid grid-cols-3 gap-2 bg-white/10 backdrop-blur-md rounded-2xl p-2.5 text-center border border-white/15 text-xs shadow-inner">
            <button 
              onClick={scrollToDevices}
              className="p-1 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer group"
            >
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold group-hover:text-white transition-colors">Thiết bị</p>
              <p className="font-black text-white text-base mt-0.5">{(mySerials || []).length}</p>
            </button>

            <button 
              onClick={() => setShowLoyaltyModal(true)}
              className="p-1 rounded-xl border-x border-white/15 hover:bg-white/10 active:scale-95 transition-all cursor-pointer group"
            >
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold group-hover:text-white transition-colors">Điểm thưởng</p>
              <p className="font-black text-base mt-0.5 drop-shadow-xs" style={{ color: rank.iconColor }}>{userPoints}</p>
            </button>

            <button 
              onClick={() => setShowVoucherModal(true)}
              className="p-1 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer group"
            >
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold group-hover:text-white transition-colors">Voucher</p>
              <p className="font-black text-cyan-200 text-base mt-0.5">3</p>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 mt-4 space-y-4">
        
        {/* 2. Section Máy lọc nước của tôi */}
        <div ref={devicesSectionRef} className="space-y-2 scroll-mt-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Máy lọc nước của tôi ({(mySerials || []).length})
            </h2>
            <button 
              onClick={() => handleBookMaintenance()}
              className="text-xs text-[#0284C7] font-bold flex items-center hover:underline cursor-pointer"
            >
              <QrCode size={14} className="mr-1" />
              Kích hoạt / Thêm máy
            </button>
          </div>

          {!mySerials || mySerials.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl text-center text-xs text-slate-400 border border-slate-200/80 shadow-sm space-y-2">
              <Droplets size={32} className="mx-auto text-sky-300" />
              <p>Bạn chưa liên kết máy lọc nước nào với tài khoản Zalo này.</p>
              <button 
                onClick={() => handleBookMaintenance()}
                className="px-4 py-2 bg-[#1B3A6B] hover:bg-[#2563EB] text-white font-bold rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
              >
                Kích hoạt bảo hành điện tử ngay
              </button>
            </div>
          ) : (
            (mySerials || []).map((s) => (
              <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      {s.status || 'Đang hoạt động'}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{s.model || 'Máy lọc nước Truliva RO'}</h3>
                    <p className="text-xs font-mono text-[#0284C7] mt-0.5">Serial: {s.serialNumber}</p>
                  </div>
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl">
                    <ShieldCheck size={20} />
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-2 border border-slate-100">
                  <div className="flex justify-between text-[11px] text-slate-600">
                    <span className="flex items-center"><Calendar size={12} className="mr-1 text-slate-400" />Hạn bảo hành:</span>
                    <span className="font-bold text-slate-800">
                      {s.warrantyExpiryDate ? new Date(s.warrantyExpiryDate).toLocaleDateString('vi-VN') : '12 Tháng'}
                    </span>
                  </div>

                  {/* Filter Health Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-semibold">
                      <span>Tuổi thọ lõi lọc thô số 1</span>
                      <span className="text-[#0284C7] font-bold">Còn 85%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#0284C7] h-full w-[85%] rounded-full"></div>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => handleBookMaintenance(s.serialNumber)}
                  className="w-full py-2.5 bg-sky-50 hover:bg-sky-100 active:scale-98 text-[#0284C7] rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <Wrench size={14} />
                  <span>Đặt lịch KTV bảo trì / Thay lõi 1-Click</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* 3. Utility Actions List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 text-xs">
          
          <button 
            onClick={() => setShowVoucherModal(true)}
            className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-cyan-50 text-cyan-700 rounded-xl">
                <Ticket size={18} />
              </div>
              <span>Ưu đãi & Voucher của tôi (3)</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </button>

          <button 
            onClick={() => setShowHistoryModal(true)}
            className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl">
                <History size={18} />
              </div>
              <span>Lịch sử bảo trì & Thay lõi</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </button>

          <button 
            onClick={handleOpenOaChat}
            className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <MessageSquare size={18} />
              </div>
              <span>Hỗ trợ & Chat Zalo OA</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </button>

        </div>

        {/* Log out */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            <span>Đăng xuất khỏi Mini App</span>
          </button>
        )}
      </div>

      {/* Interactive Modals */}
      <CustomerVoucherModal
        isOpen={showVoucherModal}
        onClose={() => setShowVoucherModal(false)}
        onUseVoucher={(_code) => {
          setShowVoucherModal(false);
          handleBookMaintenance();
        }}
      />

      <CustomerHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        onBookService={(serialNumber) => {
          setShowHistoryModal(false);
          handleBookMaintenance(serialNumber);
        }}
      />

      <CustomerLoyaltyModal
        isOpen={showLoyaltyModal}
        onClose={() => setShowLoyaltyModal(false)}
        userPoints={userPoints}
        rank={rank}
        onOpenScanner={onOpenScanner}
      />
    </div>
  );
}

