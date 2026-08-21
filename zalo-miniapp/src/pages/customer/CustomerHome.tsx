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
  Gem
} from 'lucide-react';
import LuckyWheelModal from '../../components/LuckyWheelModal';
import NewsDetailModal from '../../components/NewsDetailModal';
import { openPhone, openWebview } from 'zmp-sdk/apis';
import { fetchZaloApi } from '../../api/client';
import { getCustomerRank } from '../../utils/memberRank';

interface CustomerHomeProps {
  user: any;
  onOpenScanner?: () => void;
  onOpenWarranty?: () => void;
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
    date: '12/06/2026',
    views: 2850,
    image: '/templates/zns_591923.png',
    summary: 'Nhắc nhở chu kỳ thay thế lõi lọc định kỳ (PPC 3-6 tháng, CTO 6-9 tháng, RO 24-36 tháng) để đảm bảo chất lượng nước đạt chuẩn uống trực tiếp QCVN 6-1:2010/BYT.',
    content: [
      'Lõi lọc nước hoạt động như lá chắn bảo vệ sức khỏe cả gia đình bạn. Sau một thời gian dài giữ lại cặn bẩn, kim loại nặng và vi khuẩn, màng lọc sẽ bị bão hòa.',
      'Việc không thay lõi đúng hạn có thể khiến nước bị tái nhiễm khuẩn và làm giảm tuổi thọ của bơm cũng như màng lọc RO.',
      'Hãy kiểm tra chỉ số TDS hoặc liên hệ tổng đài Truliva 1900 638 463 để được KTV hỗ trợ kiểm tra và thay lõi chính hãng tận nhà.'
    ]
  },
  {
    id: 'zns-590478',
    title: 'CHIA SẺ NƯỚC SẠCH – RINH QUÀ XỊN CÙNG TRULIVA',
    date: '14/06/2026',
    views: 1890,
    image: '/templates/zns_590478.png',
    summary: 'Giới thiệu người thân, bạn bè sử dụng máy lọc nước Truliva để nhận ngay Voucher 300.000 VNĐ cùng bộ quà tặng lõi lọc cao cấp.',
    content: [
      'Lan tỏa nguồn nước tinh khiết đến cộng đồng cùng chương trình "Chia Sẻ Nước Sạch - Rinh Quà Xịn".',
      'Mỗi lượt giới thiệu thành công, Quý khách sẽ nhận ngay Voucher tiền mặt trừ trực tiếp vào đơn thay lõi hoặc mua sắm thiết bị mới.',
      'Người được giới thiệu cũng nhận ngay ưu đãi giảm 10% khi đăng ký lắp đặt máy mới qua Zalo Mini App.'
    ]
  },
  {
    id: 'zns-588834',
    title: 'BÍ QUYẾT GIỮ MÁY LỌC NƯỚC LAVITA LUÔN HOẠT ĐỘNG TỐT',
    date: '14/06/2026',
    views: 3120,
    image: '/templates/zns_588834.png',
    summary: 'Hướng dẫn sử dụng, bảo dưỡng máy lọc nước Lavita / Truliva đúng cách: Xả nước định kỳ, kiểm tra áp lực nước và vệ sinh vòi lấy nước.',
    content: [
      'Để máy lọc nước luôn hoạt động bền bỉ với công suất tối ưu, bạn cần lưu ý một số thói quen sử dụng hàng ngày.',
      '1. Không đặt máy ở nơi có ánh nắng trực tiếp chiếu vào hoặc gần nguồn nhiệt cao.',
      '2. Định kỳ xả sạch bình áp nếu gia đình không sử dụng nước trong nhiều ngày liên tục.',
      '3. Luôn duy trì nguồn điện và van cấp nước đầu vào ổn định để bảo vệ bơm tăng áp.'
    ]
  },
  {
    id: 'zns-581578',
    title: 'Thiết bị lọc tại vòi chỉ từ 700.000 vnd',
    date: '25/05/2026',
    views: 4210,
    image: '/templates/zns_581578.png',
    summary: 'Giải pháp lọc nước sinh hoạt nhỏ gọn lắp trực tiếp tại bồn rửa, loại bỏ 99% clo dư, cặn gỉ sét với chi phí siêu tiết kiệm chỉ từ 700.000đ.',
    content: [
      'Thiết bị lọc tại vòi Truliva là lựa chọn hoàn hảo cho nhu cầu rửa rau củ, nấu ăn và đánh răng rửa mặt sạch khuẩn.',
      'Lắp đặt cực kỳ đơn giản chỉ trong 3 phút, tương thích với 99% các loại vòi nước gia đình hiện nay.',
      'Thiết kế thân vỏ trong suốt giúp bạn dễ dàng theo dõi mức độ bám bẩn của lõi lọc và chủ động thay thế khi cần.'
    ]
  },
  {
    id: 'zns-580754',
    title: 'THƯ MỜI HỢP TÁC CÙNG TRULIVA',
    date: '21/05/2026',
    views: 2350,
    image: '/templates/zns_580754.png',
    summary: 'Chính sách chiết khấu hấp dẫn và hỗ trợ kỹ thuật toàn diện dành cho Đại lý, Trạm kỹ thuật và Cộng tác viên trên toàn quốc.',
    content: [
      'Truliva mở rộng mạng lưới phân phối và trạm dịch vụ kỹ thuật ủy quyền tại 63 tỉnh thành trên toàn quốc.',
      'Chính sách chiết khấu cao, đào tạo kỹ thuật chuyên sâu và cấp phát tài khoản phần mềm điều phối ca thông minh.',
      'Liên hệ ngay phòng phát triển đối tác qua Hotline 1900 638 463 để nhận hồ sơ và chính sách hợp tác chi tiết.'
    ]
  }
];

export default function CustomerHome({ user, onOpenScanner, onOpenWarranty }: CustomerHomeProps) {
  const [showWheelModal, setShowWheelModal] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [articles, setArticles] = useState<any[]>(FEATURED_NEWS);

  const userName = user?.fullName || 'Khách hàng Truliva';
  const rank = getCustomerRank(user);

  React.useEffect(() => {
    fetchZaloApi('/zalo-miniapp/articles')
      .then(res => {
        if (res.success && res.articles && res.articles.length > 0) {
          setArticles(res.articles);
        }
      })
      .catch(err => {
        console.warn('Articles fetch error:', err);
      });
  }, []);

  // Deep-linking: Automatically open article modal if opened via Zalo Share link (?articleId=...)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('articleId');
    if (sharedId && articles.length > 0) {
      const target = articles.find(a => a.id === sharedId || a.templateId === sharedId);
      if (target) {
        setSelectedArticle(target);
      }
    }
  }, [articles]);

  const handleArticleClick = async (news: any) => {
    if (news.url && news.url !== 'https://zalo.me' && !news.url.includes('example')) {
      try {
        await openWebview({ url: news.url });
        return;
      } catch (err) {
        window.open(news.url, '_blank');
        return;
      }
    }
    setSelectedArticle(news);
  };

  return (
    <div className="pb-20 bg-slate-50 min-h-screen">
      {/* 1. Header Persona 3 Reload Deep Water Ocean Section */}
      <div className="bg-gradient-to-b from-[#061226] via-[#0B2545] to-[#0F3866] text-white pt-5 pb-16 px-4 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
        
        {/* Floating Realistic Water Bubbles */}
        <div className="water-bubble w-4 h-4 left-[10%] bottom-1 bubble-anim-1"></div>
        <div className="water-bubble w-6 h-6 left-[24%] bottom-2 bubble-anim-2"></div>
        <div className="water-bubble w-3.5 h-3.5 left-[42%] bottom-1 bubble-anim-3"></div>
        <div className="water-bubble w-5 h-5 left-[62%] bottom-3 bubble-anim-4"></div>
        <div className="water-bubble w-3 h-3 left-[78%] bottom-1 bubble-anim-5"></div>
        <div className="water-bubble w-5.5 h-5.5 left-[88%] bottom-2 bubble-anim-6"></div>
        <div className="water-bubble w-4 h-4 left-[52%] bottom-3 bubble-anim-2"></div>

        <div className="max-w-md mx-auto flex items-center justify-between relative z-10">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            {/* Avatar Circle with Dynamic Rank Neon Ring */}
            <div className="relative flex-shrink-0">
              <div className={`w-12 h-12 rounded-full bg-[#0B2545] border-2 ring-2 flex items-center justify-center text-white font-black text-base overflow-hidden transition-all ${rank.ringColor}`}>
                {user?.avatar ? (
                  <img src={user.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User size={24} className="text-cyan-200" />
                )}
              </div>
              <span 
                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-[#061226] rounded-full"
                style={{ backgroundColor: rank.iconColor }}
              ></span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-sky-300 font-medium leading-none mb-1">Xin chào,</p>
              <h1 className="text-base font-black tracking-tight text-white drop-shadow-sm truncate">{userName}</h1>
            </div>
          </div>

          {/* Dynamic Slanted Rank Badge */}
          <div className="flex-shrink-0 ml-2">
            <div className={`p3r-slanted-badge ${rank.badgeBg} border ${rank.borderColor} px-2.5 py-1 text-[10px] font-black ${rank.textColor} uppercase tracking-wider flex items-center space-x-1 ${rank.shadowGlow} transition-all`}>
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
            </div>
          </div>
        </div>
      </div>

      {/* 2. Floating Quick Nav Card (P3R Kinetic 4-Button Grid) */}
      <div className="max-w-md mx-auto px-4 -mt-10 relative z-10">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_10px_30px_rgba(11,37,69,0.12)] p-3.5 border border-sky-100/80 grid grid-cols-4 gap-2 text-center">
          
          {/* Tích điểm */}
          <button 
            onClick={onOpenWarranty}
            className="flex flex-col items-center justify-center space-y-1.5 p-1.5 rounded-xl hover:bg-sky-50/80 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-100/80 text-[#0284C7] flex items-center justify-center border border-sky-200/60 shadow-xs group-hover:shadow-[0_0_15px_rgba(0,163,255,0.35)] group-hover:scale-105 transition-all">
              <Star size={20} className="text-[#0284C7] fill-sky-200" />
            </div>
            <span className="text-[11px] font-bold text-slate-700 tracking-tight whitespace-nowrap">Tích điểm</span>
          </button>

          {/* Ưu đãi (Vòng quay may mắn) */}
          <button 
            onClick={() => setShowWheelModal(true)}
            className="flex flex-col items-center justify-center space-y-1.5 p-1.5 rounded-xl hover:bg-cyan-50/80 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-50 to-sky-100/80 text-[#00A3FF] flex items-center justify-center border border-cyan-200/60 shadow-xs relative group-hover:shadow-[0_0_15px_rgba(0,210,255,0.5)] group-hover:scale-105 transition-all">
              <Gift size={20} className="text-[#00A3FF]" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#00D2FF] rounded-full animate-ping"></span>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#00D2FF] rounded-full shadow-[0_0_6px_#00D2FF]"></span>
            </div>
            <span className="text-[11px] font-bold text-slate-700 tracking-tight whitespace-nowrap">Ưu đãi</span>
          </button>

          {/* Tin tức */}
          <button 
            onClick={() => {
              const newsEl = document.getElementById('tin-tuc-noi-bat');
              newsEl?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex flex-col items-center justify-center space-y-1.5 p-1.5 rounded-xl hover:bg-blue-50/80 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100/80 text-[#1B3A6B] flex items-center justify-center border border-blue-200/60 shadow-xs group-hover:shadow-[0_0_15px_rgba(27,58,107,0.35)] group-hover:scale-105 transition-all">
              <Megaphone size={20} className="text-[#1B3A6B]" />
            </div>
            <span className="text-[11px] font-bold text-slate-700 tracking-tight whitespace-nowrap">Tin tức</span>
          </button>

          {/* Liên hệ */}
          <button 
            onClick={async () => {
              try {
                await openPhone({ phoneNumber: '1900638463' });
              } catch (err) {
                window.location.href = 'tel:1900638463';
              }
            }}
            className="flex flex-col items-center justify-center space-y-1.5 p-1.5 rounded-xl hover:bg-teal-50/80 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-100/80 text-teal-700 flex items-center justify-center border border-teal-200/60 shadow-xs group-hover:shadow-[0_0_15px_rgba(20,184,166,0.35)] group-hover:scale-105 transition-all">
              <PhoneCall size={20} className="text-teal-600" />
            </div>
            <span className="text-[11px] font-bold text-slate-700 tracking-tight whitespace-nowrap">Liên hệ</span>
          </button>
        </div>
      </div>

      {/* 3. Banner Vòng Quay May Mắn (P3R Kinetic Shimmer Banner) */}
      <div className="max-w-md mx-auto px-4 mt-4">
        <div 
          onClick={() => setShowWheelModal(true)}
          className="p3r-shimmer-effect bg-gradient-to-r from-[#061226] via-[#0B2545] to-[#0284C7] text-white rounded-2xl p-4.5 border border-[#00D2FF]/40 shadow-[0_8px_25px_rgba(0,163,255,0.25)] flex items-center justify-between cursor-pointer hover:shadow-[0_10px_30px_rgba(0,210,255,0.4)] active:scale-[0.99] transition-all relative overflow-hidden"
        >
          <div className="space-y-1.5 z-10">
            <div className="inline-block p3r-slanted-badge bg-[#00D2FF] text-[#061226] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider shadow-xs">
              <span>SỰ KIỆN ĐẶC BIỆT</span>
            </div>
            <h3 className="font-black italic text-[15px] text-white tracking-tight leading-tight drop-shadow-sm">
              Quan Tâm Zalo OA Nhận 1 Lượt Quay!
            </h3>
            <p className="text-[11px] text-cyan-200 font-medium">100% Trúng Voucher 50K - 100K thay lõi lọc thô</p>
          </div>
          <div className="p-3 bg-[#00D2FF]/20 border border-[#00D2FF]/40 backdrop-blur-md rounded-2xl text-[#00D2FF] z-10 p3r-animate-float shadow-[0_0_15px_rgba(0,210,255,0.3)]">
            <Sparkles size={24} />
          </div>
        </div>
      </div>

      {/* 4. Section Quét Mã QR Bảo Hành Máy (P3R Tech Scan Panel) */}
      <div className="max-w-md mx-auto px-4 mt-4">
        <div className="bg-white p-4 rounded-2xl border border-sky-200/80 shadow-xs flex items-center justify-between hover:shadow-[0_4px_20px_rgba(0,163,255,0.12)] transition-shadow">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-gradient-to-br from-sky-50 to-cyan-100 text-[#0284C7] rounded-2xl border border-sky-200/60 shadow-xs">
              <QrCode size={24} />
            </div>
            <div>
              <h4 className="font-black text-xs text-slate-900 uppercase tracking-tight">Quét mã QR Bảo Hành</h4>
              <p className="text-[11px] text-slate-500 font-medium">Kích hoạt & Xem tuổi thọ lõi lọc</p>
            </div>
          </div>
          <button 
            onClick={onOpenScanner}
            className="p3r-slanted-badge bg-gradient-to-r from-[#1B3A6B] to-[#0284C7] hover:from-[#0284C7] hover:to-[#00D2FF] text-white px-4 py-2.5 text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <span>QUÉT MÃ</span>
          </button>
        </div>
      </div>

      {/* 5. Section Tin tức nổi bật (P3R Article Showcase) */}
      <div id="tin-tuc-noi-bat" className="max-w-md mx-auto px-4 mt-6 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1.5">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
              TIN TỨC TRUYỀN THÔNG
            </h2>
          </div>
          <button className="text-[11px] font-bold text-[#0284C7] hover:text-[#1B3A6B] flex items-center transition-colors cursor-pointer uppercase tracking-tight">
            <span>Tất cả</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* 2-Column Article Grid */}
        <div className="grid grid-cols-2 gap-3">
          {(Array.isArray(articles) ? articles : FEATURED_NEWS).map((news, idx) => (
            <div 
              key={news?.id || idx}
              onClick={() => handleArticleClick(news)}
              className="bg-white rounded-2xl overflow-hidden border border-sky-100 shadow-xs hover:shadow-[0_8px_20px_rgba(0,163,255,0.15)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between group"
            >
              {/* Thumbnail Image with P3R Slanted Badge */}
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

              {/* Card Content */}
              <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                <h3 className="font-bold text-xs text-slate-800 line-clamp-2 leading-snug group-hover:text-[#0284C7] transition-colors">
                  {news?.title || 'Tin tức Truliva'}
                </h3>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-100 font-medium">
                  <span className="truncate">{news?.date ? String(news.date).split(',')[0] : ''}</span>
                  <span className="flex items-center ml-1 flex-shrink-0 text-slate-500">
                    <Eye size={10} className="mr-0.5 text-[#0284C7]" />
                    {news?.views || 0}
                  </span>
                </div>
              </div>
            </div>
          ))}
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
    </div>
  );
}
