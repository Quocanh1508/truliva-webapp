import React, { useState } from 'react';
import { 
  Star, 
  Gift, 
  Megaphone, 
  PhoneCall, 
  ChevronRight, 
  Eye, 
  Sparkles, 
  ShieldCheck, 
  User, 
  MessageSquare,
  QrCode,
  CheckCircle2,
  Calendar,
  Crown,
  Award,
  Gem,
  ShoppingBag,
  Store,
  Truck,
  RotateCcw,
  Scale
} from 'lucide-react';
import LuckyWheelModal from '../../components/LuckyWheelModal';
import NewsDetailModal from '../../components/NewsDetailModal';
import LegalPagesModal, { LegalDocType } from '../../components/LegalPagesModal';
import P3ROceanHeader from '../../components/P3ROceanHeader';
import { openPhone, openWebview } from 'zmp-sdk/apis';
import { fetchZaloApi } from '../../api/client';
import { getCustomerRank, MemberTier, RANK_CONFIGS, NEXT_TIER_ORDER } from '../../utils/memberRank';

interface CustomerHomeProps {
  user: any;
  onOpenScanner?: () => void;
  onOpenWarranty?: () => void;
  onGoToShop?: () => void;
}

const FEATURED_NEWS = [
  {
    id: 'zns-602994',
    title: 'THU CŨ ĐỔI MỚI – NÂNG CẤP MÁY LỌC NƯỚC',
    date: '13/07/2026',
    views: 1420,
    image: '/templates/zns_602994.png',
    summary: 'Chương trình trợ giá thu hồi máy lọc nước cũ bất kỳ lên đến 2.000.000 VNĐ khi nâng cấp lên dòng máy lọc nước thông minh Truliva.',
    content: [
      'Truliva trân trọng gửi tới Quý khách hàng chương trình "Thu Cũ Đổi Mới - Nâng Tầm Nguồn Nước Sạch".',
      'Áp dụng cho tất cả các dòng máy lọc nước cũ, hư hỏng hoặc không rõ nguồn gốc thuộc mọi thương hiệu trên thị trường.',
      'Khách hàng được hỗ trợ thu hồi máy cũ tận nhà và trợ giá trực tiếp khi nâng cấp lên dòng máy lọc nước Truliva Ro/Nano thế hệ mới.',
      'Miễn phí 100% công lắp đặt và kiểm tra đo chỉ số TDS nước đầu vào/đầu ra tận nhà bởi đội ngũ Kỹ thuật viên chính hãng Truliva.'
    ]
  },
  {
    id: 'zns-591923',
    title: 'ĐẾN HẠN THAY LỌC',
    date: '10/06/2026',
    views: 980,
    image: '/templates/zns_591923.png',
    summary: 'Hướng dẫn nhận biết thời điểm vàng cần thay lõi lọc nước và đặt lịch KTV Truliva phục vụ tận nhà nhanh chóng trong 2 giờ.',
    content: [
      'Lõi lọc nước đóng vai trò như lá chắn bảo vệ sức khoẻ gia đình bạn. Việc thay lõi đúng định kỳ giúp duy trì chất lượng nước đạt chuẩn Bộ Y Tế.',
      'Lõi số 1 (PP 5 Micron): Định kỳ thay 3 - 6 tháng (khoảng 10.000 lít nước).',
      'Lõi số 2 (Than hoạt tính CTO): Định kỳ thay 6 - 9 tháng (khoảng 15.000 lít nước).',
      'Lõi số 3 (Màng RO đúc nguyên khối): Định kỳ thay 24 - 36 tháng tuỳ chất lượng nguồn nước.',
      'Đặt lịch ngay trên Zalo Mini App để KTV Truliva kiểm tra nước miễn phí và thay lõi chính hãng có tem chống hàng giả.'
    ]
  },
  {
    id: 'zns-570997',
    title: 'BẢO DƯỠNG ĐỊNH KỲ',
    date: '25/05/2026',
    views: 850,
    image: '/templates/zns_570997.png',
    summary: 'Gói chăm sóc máy lọc nước toàn diện 6 bước chuẩn chuyên gia: vệ sinh máy, đo TDS, súc rửa bình áp, kiểm tra rò rỉ điện nước.',
    content: [
      'Nhằm đảm bảo máy lọc nước luôn vận hành bền bỉ và tiết kiệm điện năng, Truliva cung cấp quy trình bảo dưỡng 6 bước:',
      '1. Đo kiểm tra áp lực nước đầu vào và chỉ số TDS thực tế.',
      '2. Vệ sinh tổng thể cốc lọc, đường ống dẫn và vòi inox 304.',
      '3. Kiểm tra áp suất bình áp chứa nước tinh khiết.',
      '4. Kiểm tra van điện từ, bơm tăng áp và chống rò rỉ nước.',
      '5. Đo chỉ số TDS nước tinh khiết sau lọc trước sự chứng kiến của khách hàng.',
      '6. Kích hoạt tem bảo hành và cập nhật hồ sơ máy điện tử trên hệ thống.'
    ]
  }
];

export default function CustomerHome({ user, onOpenScanner, onOpenWarranty, onGoToShop }: CustomerHomeProps) {
  const [showWheelModal, setShowWheelModal] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [overrideTier, setOverrideTier] = useState<MemberTier | null>(null);
  const [newsList, setNewsList] = useState<any[]>(FEATURED_NEWS);

  // Legal Modal
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalDocType, setLegalDocType] = useState<LegalDocType>('TERMS');

  React.useEffect(() => {
    fetchZaloApi('/zalo-miniapp/articles')
      .then(res => {
        if (res && res.success && res.articles && res.articles.length > 0) {
          setNewsList(res.articles);
        }
      })
      .catch(err => {
        console.warn('Could not fetch articles, using default fallback', err);
      });
  }, []);

  const userName = user?.fullName || 'Khách hàng Truliva';
  const userPhone = user?.phoneNumber || '';
  const userPoints = Number(user?.rewardPoints ?? user?.points ?? 250);

  const baseRank = getCustomerRank(user, userPoints);
  const rank = overrideTier ? RANK_CONFIGS[overrideTier] : baseRank;

  const handleCycleTier = () => {
    const currentIndex = NEXT_TIER_ORDER.indexOf(rank.tier);
    const nextTier = NEXT_TIER_ORDER[(currentIndex + 1) % NEXT_TIER_ORDER.length];
    setOverrideTier(nextTier);
  };

  return (
    <div className="pb-28 bg-slate-50 min-h-screen font-sans">
      {/* 1. Header Profile Card with Persona 3 Reload Ocean Waves */}
      <P3ROceanHeader className="p-4 pt-5 pb-12">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className={`w-12 h-12 rounded-full bg-[#0B2545] border-2 ring-2 flex items-center justify-center text-white font-bold text-lg overflow-hidden transition-all ${rank.ringColor}`}>
                {user?.avatar ? (
                  <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={26} className="text-cyan-200" />
                )}
              </div>
              <span 
                className="absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-[#061226] rounded-full transition-all shadow-xs"
                style={{ backgroundColor: rank.iconColor }}
              ></span>
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] text-sky-200 font-bold uppercase tracking-wider">Xin chào</span>
                <span className="inline-block w-1.5 h-1.5 bg-[#00D2FF] rounded-full animate-pulse"></span>
              </div>
              <h1 className="text-base font-black text-white truncate max-w-[170px] drop-shadow-sm">{userName}</h1>
              <p className="text-[11px] text-sky-100 font-medium">
                {userPhone ? userPhone : 'Truliva Care'}
              </p>
            </div>
          </div>

          <div className="flex-shrink-0 ml-2">
            <button 
              onClick={handleCycleTier}
              title="Nhấn để đổi xem màu các hạng thành viên: Đồng ➔ Bạc ➔ Vàng ➔ Kim Cương"
              className={`p3r-slanted-badge ${rank.badgeBg} border ${rank.borderColor} px-2.5 py-1 text-[10px] font-black ${rank.textColor} uppercase tracking-wider flex items-center space-x-1 ${rank.shadowGlow} active:scale-95 transition-all cursor-pointer`}
            >
              <div className="flex items-center space-x-1">
                {rank.tier === 'GOLD' ? (
                  <Crown size={11} style={{ color: rank.iconColor }} />
                ) : rank.tier === 'DIAMOND' ? (
                  <Gem size={11} style={{ color: rank.iconColor }} />
                ) : rank.tier === 'BRONZE' ? (
                  <Award size={11} style={{ color: rank.iconColor }} />
                ) : (
                  <Sparkles size={11} style={{ color: rank.iconColor }} />
                )}
                <span>{rank.label}</span>
              </div>
            </button>
          </div>
        </div>
      </P3ROceanHeader>

      {/* 2. Floating Quick Nav Card */}
      <div className="max-w-md mx-auto px-4 -mt-10 relative z-10">
        <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-[0_12px_36px_rgba(11,37,69,0.12)] p-3.5 border border-sky-100/90 grid grid-cols-4 gap-2 text-center">
          {/* Cửa hàng */}
          <button 
            onClick={onGoToShop}
            className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-2xl hover:bg-sky-50/80 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100/80 text-[#1B3A6B] flex items-center justify-center border border-blue-200/60 shadow-xs group-hover:scale-105 transition-all">
              <Store size={22} className="text-[#1B3A6B]" />
            </div>
            <span className="text-[11px] font-bold text-slate-700 tracking-tight whitespace-nowrap">Cửa hàng</span>
          </button>

          {/* Tích điểm */}
          <button 
            onClick={onOpenWarranty}
            className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-2xl hover:bg-sky-50/80 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100/80 text-amber-600 flex items-center justify-center border border-amber-200/60 shadow-xs group-hover:scale-105 transition-all">
              <Star size={22} className="text-amber-500 fill-amber-200" />
            </div>
            <span className="text-[11px] font-bold text-slate-700 tracking-tight whitespace-nowrap">Tích điểm</span>
          </button>

          {/* Ưu đãi */}
          <button 
            onClick={() => setShowWheelModal(true)}
            className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-2xl hover:bg-cyan-50/80 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-50 to-sky-100/80 text-[#00A3FF] flex items-center justify-center border border-cyan-200/60 shadow-xs relative group-hover:scale-105 transition-all">
              <Gift size={22} className="text-[#00A3FF]" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#00D2FF] rounded-full animate-ping"></span>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#00D2FF] rounded-full shadow-[0_0_6px_#00D2FF]"></span>
            </div>
            <span className="text-[11px] font-bold text-slate-700 tracking-tight whitespace-nowrap">Vòng quay</span>
          </button>

          {/* Hotline */}
          <button 
            onClick={async () => {
              try {
                await openPhone({ phoneNumber: '1900638463' });
              } catch (err) {
                window.location.href = 'tel:1900638463';
              }
            }}
            className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-2xl hover:bg-emerald-50/80 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100/80 text-emerald-700 flex items-center justify-center border border-emerald-200/60 shadow-xs group-hover:scale-105 transition-all">
              <PhoneCall size={22} className="text-emerald-600" />
            </div>
            <span className="text-[11px] font-bold text-slate-700 tracking-tight whitespace-nowrap">Hotline</span>
          </button>
        </div>
      </div>

      {/* 3. 🛍️ High-Conversion E-Commerce Promo Banner */}
      <div className="max-w-md mx-auto px-4 mt-4">
        <div 
          onClick={onGoToShop}
          className="bg-gradient-to-r from-[#1B3A6B] via-[#152e55] to-[#0284C7] text-white rounded-3xl p-4.5 border border-cyan-400/40 shadow-[0_8px_25px_rgba(27,58,107,0.18)] flex items-center justify-between cursor-pointer hover:shadow-[0_12px_32px_rgba(0,163,255,0.25)] active:scale-[0.99] transition-all relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-36 h-36 bg-[#00A3FF]/20 rounded-full blur-xl pointer-events-none"></div>
          
          <div className="space-y-1 z-10">
            <div className="inline-flex items-center gap-1 bg-[#00D2FF] text-[#061226] px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded-md">
              <Sparkles size={11} />
              <span>GIAN HÀNG CHÍNH HÃNG</span>
            </div>
            <h3 className="font-extrabold text-[15px] text-white tracking-tight leading-tight">
              Máy Lọc Nước Truliva 2026
            </h3>
            <p className="text-[11px] text-cyan-200">
              Miễn phí giao hàng & lắp đặt • Bảo hành 1-2 năm theo POS
            </p>
          </div>

          <div className="p-3 bg-white/15 border border-white/20 backdrop-blur-md rounded-2xl text-cyan-300 z-10 shrink-0">
            <ShoppingBag size={24} />
          </div>
        </div>
      </div>

      {/* 4. Section Quét Mã QR Bảo Hành Máy */}
      <div className="max-w-md mx-auto px-4 mt-4">
        <div className="bg-white p-4 rounded-3xl border border-sky-100 shadow-[0_4px_20px_rgba(27,58,107,0.06)] flex items-center justify-between hover:shadow-[0_8px_24px_rgba(0,163,255,0.12)] transition-shadow">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-gradient-to-br from-sky-50 to-cyan-100 text-[#0284C7] rounded-2xl border border-sky-200/60 shadow-xs">
              <QrCode size={24} />
            </div>
            <div>
              <h4 className="font-black text-xs text-slate-900 uppercase tracking-tight">Kích hoạt bảo hành</h4>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Quét mã QR thân máy để đo TDS & lõi lọc</p>
            </div>
          </div>
          <button 
            onClick={onOpenScanner}
            className="p3r-slanted-badge bg-gradient-to-r from-[#1B3A6B] to-[#0284C7] hover:from-[#0284C7] hover:to-[#00D2FF] text-white px-4 py-2.5 text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all cursor-pointer flex items-center space-x-1"
          >
            <span>QUÉT MÃ</span>
          </button>
        </div>
      </div>

      {/* 5. Trust Guarantee Strip */}
      <div className="max-w-md mx-auto px-4 mt-4">
        <div className="bg-sky-50/80 border border-sky-100/90 rounded-2xl py-2.5 px-3 flex items-center justify-between text-[10px] text-slate-600 font-semibold">
          <div className="flex items-center space-x-1">
            <ShieldCheck size={13} className="text-[#0284C7]" />
            <span>Chính hãng 100%</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center space-x-1">
            <Truck size={13} className="text-emerald-600" />
            <span>Miễn phí giao lắp</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center space-x-1">
            <RotateCcw size={13} className="text-amber-600" />
            <span>Đổi mới 7 ngày</span>
          </div>
        </div>
      </div>

      {/* 6. Section Tin Tức & Kiến Thức Nước Sạch */}
      <div id="tin-tuc-noi-bat" className="max-w-md mx-auto px-4 mt-6 space-y-3 scroll-mt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-blue-100 text-[#1B3A6B] rounded-lg">
              <Megaphone size={16} />
            </div>
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">Tin Tức & Cẩm Nang</h2>
          </div>
          <span className="text-[11px] font-bold text-[#0284C7] bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
            {newsList.length} bài viết
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {newsList.map((news) => (
            <div 
              key={news.id} 
              onClick={() => setSelectedArticle(news)}
              className="bg-white rounded-3xl border border-sky-100 shadow-[0_4px_20px_rgba(27,58,107,0.06)] overflow-hidden flex flex-col hover:border-cyan-300 hover:shadow-[0_8px_25px_rgba(0,163,255,0.15)] active:scale-[0.99] transition-all cursor-pointer group"
            >
              <div className="relative h-28 bg-slate-900 overflow-hidden">
                <img 
                  src={news?.image || 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=60'} 
                  alt={news?.title || 'Tin tức Truliva'} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-95"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#061226]/80 via-transparent to-transparent opacity-60"></div>
                <div className="absolute top-2 left-2 p3r-slanted-badge bg-[#00D2FF] text-[#061226] text-[8px] font-black px-2 py-0.5 uppercase tracking-wider shadow-xs">
                  <span>TRULIVA</span>
                </div>
              </div>

              <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                <h3 className="font-bold text-xs text-slate-800 line-clamp-2 leading-snug group-hover:text-[#0284C7] transition-colors">
                  {news?.title || 'Tin tức Truliva'}
                </h3>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-100 font-medium">
                  <span className="truncate">{news?.date ? String(news.date).split(',')[0] : ''}</span>
                  <span className="flex items-center ml-1 flex-shrink-0 text-slate-500">
                    <Eye size={11} className="mr-0.5 text-[#0284C7]" />
                    {news?.views || 0}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 7. ⚖️ Legal Compliance Footer Bar */}
      <div className="max-w-md mx-auto px-4 mt-6">
        <div className="bg-slate-100/80 p-3.5 rounded-2xl border border-slate-200/80 text-center text-[10px] text-gray-500 space-y-1.5">
          <div className="flex items-center justify-center gap-1.5 font-bold text-gray-700">
            <Scale size={13} className="text-[#1B3A6B]" />
            <span>Hệ Thống TMĐT Chính Thức - Công Ty TNHH Truliva</span>
          </div>
          <p className="text-[10px] text-gray-400">
            Tuân thủ Luật TMĐT 2025 & Nghị định 248/2026/NĐ-CP • MST: 0317582910
          </p>
          <div className="flex items-center justify-center gap-3 pt-1 text-[11px] font-semibold text-[#1B3A6B]">
            <button onClick={() => { setLegalDocType('COMPANY'); setShowLegalModal(true); }} className="hover:underline">
              Doanh nghiệp
            </button>
            <span>•</span>
            <button onClick={() => { setLegalDocType('TERMS'); setShowLegalModal(true); }} className="hover:underline">
              Điều khoản
            </button>
            <span>•</span>
            <button onClick={() => { setLegalDocType('PRIVACY'); setShowLegalModal(true); }} className="hover:underline">
              Bảo mật
            </button>
            <span>•</span>
            <button onClick={() => { setLegalDocType('WARRANTY'); setShowLegalModal(true); }} className="hover:underline">
              Bảo hành
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <LuckyWheelModal 
        isOpen={showWheelModal} 
        onClose={() => setShowWheelModal(false)} 
        user={user} 
      />

      <NewsDetailModal 
        article={selectedArticle} 
        onClose={() => setSelectedArticle(null)} 
      />

      <LegalPagesModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        initialType={legalDocType}
      />
    </div>
  );
}
