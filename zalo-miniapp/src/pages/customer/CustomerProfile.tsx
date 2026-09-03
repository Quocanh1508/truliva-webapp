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
  Sparkles,
  ShoppingBag,
  Building2,
  FileText,
  Scale
} from 'lucide-react';
import { openWebview, openChat } from 'zmp-sdk/apis';
import { getCustomerRank, MemberTier, RANK_CONFIGS, NEXT_TIER_ORDER } from '../../utils/memberRank';
import CustomerVoucherModal from '../../components/CustomerVoucherModal';
import CustomerHistoryModal from '../../components/CustomerHistoryModal';
import CustomerLoyaltyModal from '../../components/CustomerLoyaltyModal';
import LegalPagesModal, { LegalDocType } from '../../components/LegalPagesModal';
import P3ROceanHeader from '../../components/P3ROceanHeader';

interface CustomerProfileProps {
  user: any;
  mySerials: any[];
  onLogout?: () => void;
  onOpenScanner?: () => void;
  onViewMyOrders?: () => void;
}

export default function CustomerProfile({ 
  user, 
  mySerials, 
  onLogout, 
  onOpenScanner,
  onViewMyOrders 
}: CustomerProfileProps) {
  const [overrideTier, setOverrideTier] = useState<MemberTier | null>(null);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);

  // Legal Modal
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalDocType, setLegalDocType] = useState<LegalDocType>('TERMS');
  
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
    } catch {
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

  const handleOpenLegal = (type: LegalDocType) => {
    setLegalDocType(type);
    setShowLegalModal(true);
  };

  return (
    <div className="pb-28 bg-slate-50 min-h-screen font-sans">
      {/* 1. Header Profile Card with Persona 3 Reload Ocean Waves */}
      <P3ROceanHeader className="p-5 pt-5 pb-10">
        <div className="max-w-md mx-auto space-y-4">
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
                className="absolute bottom-0 right-0 w-4 h-4 border-2 border-[#061226] rounded-full transition-all shadow-xs"
                style={{ backgroundColor: rank.iconColor }}
              ></span>
            </div>
            
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-white truncate drop-shadow-sm">{userName}</h1>
              <p className="text-xs text-sky-200 flex items-center mt-0.5 font-medium">
                <Phone size={12} className="mr-1 flex-shrink-0 text-[#00D2FF]" />
                {userPhone}
              </p>
              
              {/* Dynamic Rank Badge */}
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

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-2 bg-[#041426]/70 backdrop-blur-md rounded-2xl p-2.5 text-center border border-cyan-400/30 text-xs shadow-[0_4px_20px_rgba(0,210,255,0.15)]">
            <button 
              onClick={scrollToDevices}
              className="p-1 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer group"
            >
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold group-hover:text-white transition-colors">Thiết bị</p>
              <p className="font-black text-white text-base mt-0.5">{(mySerials || []).length}</p>
            </button>

            <button 
              onClick={() => setShowLoyaltyModal(true)}
              className="p-1 rounded-xl border-x border-cyan-400/20 hover:bg-white/10 active:scale-95 transition-all cursor-pointer group"
            >
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold group-hover:text-white transition-colors">Điểm thưởng</p>
              <p className="font-black text-base mt-0.5 drop-shadow-xs" style={{ color: rank.iconColor }}>{userPoints}</p>
            </button>

            <button 
              onClick={() => setShowVoucherModal(true)}
              className="p-1 rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer group"
            >
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold group-hover:text-white transition-colors">Voucher</p>
              <p className="font-black text-cyan-300 text-base mt-0.5">3</p>
            </button>
          </div>
        </div>
      </P3ROceanHeader>

      <div className="max-w-md mx-auto px-4 mt-4 space-y-4">
        {/* 2. My Devices Section */}
        <div ref={devicesSectionRef} className="space-y-3 scroll-mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-blue-100 text-[#1B3A6B] rounded-lg">
                <Droplets size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-800 tracking-tight">Máy Lọc Nước Của Tôi</h2>
            </div>
            <span className="text-[11px] font-bold text-[#0284C7] bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
              {(mySerials || []).length} máy
            </span>
          </div>

          {(mySerials || []).length === 0 ? (
            <div className="bg-white rounded-3xl p-5 border border-sky-100 shadow-[0_4px_20px_rgba(27,58,107,0.06)] text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto border border-slate-100">
                <Droplets size={24} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700">Chưa có thiết bị nào kích hoạt</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Quét mã QR trên thân máy hoặc nhập số Serial để theo dõi bảo hành và tuổi thọ lõi lọc tự động.
                </p>
              </div>
              {onOpenScanner && (
                <button
                  onClick={onOpenScanner}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-[#1B3A6B] hover:bg-[#152e55] text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <QrCode size={14} />
                  <span>Quét mã QR thân máy</span>
                </button>
              )}
            </div>
          ) : (
            mySerials.map((s, idx) => (
              <div key={idx} className="bg-white rounded-3xl p-4 border border-sky-100 shadow-[0_4px_20px_rgba(27,58,107,0.06)] space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs">{s.model || s.productLine || 'Máy lọc nước Truliva'}</h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">Serial: {s.serialNumber}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                    {s.status || 'Đang hoạt động'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-slate-400 text-[10px]">Ngày kích hoạt</p>
                    <p className="font-semibold text-slate-700 mt-0.5">
                      {s.activationDate ? new Date(s.activationDate).toLocaleDateString('vi-VN') : 'Mới lắp đặt'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px]">Hạn bảo hành</p>
                    <p className="font-semibold text-emerald-600 mt-0.5">
                      {s.warrantyExpiryDate ? new Date(s.warrantyExpiryDate).toLocaleDateString('vi-VN') : '12 - 24 tháng'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleBookMaintenance(s.serialNumber)}
                  className="w-full py-2 bg-sky-50 hover:bg-sky-100 text-[#0284C7] rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-sky-100"
                >
                  <Wrench size={14} />
                  <span>Yêu cầu KTV bảo trì / Thay lõi</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* 3. E-Commerce & Service Actions List */}
        <div className="bg-white rounded-3xl border border-sky-100 shadow-[0_4px_20px_rgba(27,58,107,0.06)] divide-y divide-slate-100 text-xs overflow-hidden">
          {/* My Orders Button */}
          {onViewMyOrders && (
            <button 
              onClick={onViewMyOrders}
              className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 text-[#1B3A6B] rounded-2xl border border-blue-100">
                  <ShoppingBag size={18} />
                </div>
                <div className="text-left">
                  <div className="font-bold">Đơn hàng mua sắm của tôi</div>
                  <div className="text-[10px] text-gray-400">Theo dõi tiến độ giao hàng & lắp đặt</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          )}

          <button 
            onClick={() => setShowVoucherModal(true)}
            className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-cyan-50 text-[#00A3FF] rounded-2xl border border-cyan-100">
                <Ticket size={18} />
              </div>
              <span className="font-bold">Ưu đãi & Voucher của tôi (3)</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </button>

          <button 
            onClick={() => setShowHistoryModal(true)}
            className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-sky-50 text-[#0284C7] rounded-2xl border border-sky-100">
                <History size={18} />
              </div>
              <span className="font-bold">Lịch sử bảo trì & Thay lõi</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </button>

          <button 
            onClick={handleOpenOaChat}
            className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-50 text-[#1B3A6B] rounded-2xl border border-blue-100">
                <MessageSquare size={18} />
              </div>
              <span className="font-bold">Tư vấn & Hỗ trợ kỹ thuật Zalo OA</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </button>
        </div>

        {/* 4. ⚖️ Khung Pháp Lý & Quy Chế TMĐT (Luật TMĐT 2025 & NĐ 248/2026) */}
        <div className="bg-white rounded-3xl border border-sky-100 shadow-[0_4px_20px_rgba(27,58,107,0.06)] divide-y divide-slate-100 text-xs overflow-hidden">
          <div className="p-3 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Scale size={14} className="text-[#1B3A6B]" />
              Pháp Lý & Quy Chế TMĐT Truliva
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-extrabold">Luật 2025</span>
          </div>

          <button 
            onClick={() => handleOpenLegal('COMPANY')}
            className="w-full p-3 flex items-center justify-between text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <Building2 size={16} className="text-gray-400" />
              <span>Thông tin pháp lý doanh nghiệp</span>
            </div>
            <ChevronRight size={14} className="text-slate-400" />
          </button>

          <button 
            onClick={() => handleOpenLegal('TERMS')}
            className="w-full p-3 flex items-center justify-between text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <FileText size={16} className="text-gray-400" />
              <span>Điều khoản giao dịch mua bán hàng</span>
            </div>
            <ChevronRight size={14} className="text-slate-400" />
          </button>

          <button 
            onClick={() => handleOpenLegal('PRIVACY')}
            className="w-full p-3 flex items-center justify-between text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <ShieldCheck size={16} className="text-gray-400" />
              <span>Chính sách bảo vệ dữ liệu cá nhân</span>
            </div>
            <ChevronRight size={14} className="text-slate-400" />
          </button>

          <button 
            onClick={() => handleOpenLegal('RETURN')}
            className="w-full p-3 flex items-center justify-between text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <Award size={16} className="text-gray-400" />
              <span>Xem toàn bộ 8 chính sách TMĐT</span>
            </div>
            <span className="text-[10px] font-bold text-[#1B3A6B] flex items-center">
              Chi tiết <ChevronRight size={14} />
            </span>
          </button>
        </div>

        {/* 5. Log out */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-red-100"
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

      <LegalPagesModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        initialType={legalDocType}
      />
    </div>
  );
}
