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
  Calendar
} from 'lucide-react';
import LuckyWheelModal from '../../components/LuckyWheelModal';
import NewsDetailModal from '../../components/NewsDetailModal';
import { openPhone, openWebview } from 'zmp-sdk/apis';
import { fetchZaloApi } from '../../api/client';

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

  const userName = user?.fullName || 'Guest';

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
      {/* 1. Header Navy Gradient Section */}
      <div className="bg-gradient-to-b from-blue-900 via-blue-800 to-blue-900 text-white pt-6 pb-12 px-4 rounded-b-[2rem] shadow-lg relative">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Avatar Circle */}
            <div className="w-11 h-11 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-bold text-base shadow-inner">
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
              ) : (
                <User size={22} />
              )}
            </div>
            <div>
              <p className="text-xs text-blue-200 font-medium">Xin chào,</p>
              <h1 className="text-lg font-extrabold tracking-tight text-white">{userName}</h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center space-x-1">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              <span>Thành viên Bạc</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. White Floating Quick Nav Card (Tri kỷ 4 Nút - Tích điểm, Ưu đãi, Tin tức, Liên hệ) */}
      <div className="max-w-md mx-auto px-4 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl p-4 border border-slate-100 grid grid-cols-4 gap-2 text-center">
          
          {/* Tích điểm */}
          <button 
            onClick={onOpenWarranty}
            className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-xl hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100 shadow-sm">
              <Star size={22} className="text-blue-600 fill-blue-100" />
            </div>
            <span className="text-xs font-semibold text-slate-700">Tích điểm</span>
          </button>

          {/* Ưu đãi (Vòng quay may mắn) */}
          <button 
            onClick={() => setShowWheelModal(true)}
            className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-xl hover:bg-amber-50 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shadow-sm relative">
              <Gift size={22} className="text-amber-600" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
            </div>
            <span className="text-xs font-semibold text-slate-700">Ưu đãi</span>
          </button>

          {/* Tin tức */}
          <button 
            onClick={() => {
              const newsEl = document.getElementById('tin-tuc-noi-bat');
              newsEl?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-xl hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100 shadow-sm">
              <Megaphone size={22} className="text-indigo-600" />
            </div>
            <span className="text-xs font-semibold text-slate-700">Tin tức</span>
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
            className="flex flex-col items-center justify-center space-y-1.5 p-2 rounded-xl hover:bg-emerald-50 active:scale-95 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shadow-sm">
              <PhoneCall size={22} className="text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-slate-700">Liên hệ</span>
          </button>
        </div>
      </div>

      {/* 3. Banner Vòng Quay May Mắn thu hút quan tâm Zalo OA */}
      <div className="max-w-md mx-auto px-4 mt-4">
        <div 
          onClick={() => setShowWheelModal(true)}
          className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white rounded-2xl p-4 shadow-md flex items-center justify-between cursor-pointer hover:shadow-lg transition-shadow relative overflow-hidden"
        >
          <div className="space-y-1 z-10">
            <span className="bg-white/20 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
              🎁 Game Vòng Quay Trúng Quà
            </span>
            <h3 className="font-extrabold text-sm text-white">Quan Tâm Zalo OA Nhận 1 Lượt Quay!</h3>
            <p className="text-[11px] text-amber-100">100% Trúng Voucher 50K - 100K thay lõi lọc thô</p>
          </div>
          <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl text-white z-10">
            <Sparkles size={24} />
          </div>
        </div>
      </div>

      {/* 4. Section Quét Mã QR Bảo Hành Máy */}
      <div className="max-w-md mx-auto px-4 mt-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <QrCode size={24} />
            </div>
            <div>
              <h4 className="font-bold text-xs text-slate-900">Quét mã QR Bảo Hành</h4>
              <p className="text-[11px] text-slate-500">Kích hoạt & Xem tuổi thọ lõi lọc</p>
            </div>
          </div>
          <button 
            onClick={onOpenScanner}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
          >
            Quét mã
          </button>
        </div>
      </div>

      {/* 5. Section Tin tức nổi bật (2 Cột bài viết) */}
      <div id="tin-tuc-noi-bat" className="max-w-md mx-auto px-4 mt-6 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Tin tức nổi bật</h2>
          <button className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center cursor-pointer">
            <span>Xem thêm</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* 2-Column Article Grid */}
        <div className="grid grid-cols-2 gap-3">
          {(Array.isArray(articles) ? articles : FEATURED_NEWS).map((news, idx) => (
            <div 
              key={news?.id || idx}
              onClick={() => handleArticleClick(news)}
              className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between"
            >
              {/* Thumbnail Image */}
              <div className="relative h-28 bg-slate-100 overflow-hidden">
                <img 
                  src={news?.image || 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=60'} 
                  alt={news?.title || 'Tin tức Truliva'} 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* Card Content */}
              <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                <h3 className="font-bold text-xs text-slate-800 line-clamp-2 leading-snug">
                  {news?.title || 'Tin tức Truliva'}
                </h3>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                  <span className="truncate">{news?.date ? String(news.date).split(',')[0] : ''}</span>
                  <span className="flex items-center ml-1 flex-shrink-0">
                    <Eye size={10} className="mr-0.5" />
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
