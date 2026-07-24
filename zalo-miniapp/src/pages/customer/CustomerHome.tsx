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

interface CustomerHomeProps {
  user: any;
  onOpenScanner?: () => void;
  onOpenWarranty?: () => void;
}

const FEATURED_NEWS = [
  {
    id: '1',
    title: 'Bảo vệ sức khỏe gia đình với việc thay lõi lọc nước định kỳ',
    date: '11:03, 28/12/2023',
    views: 794,
    image: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=60',
    summary: 'Lõi lọc nước đóng vai trò trái tim của hệ thống lọc. Sau 3 - 6 tháng sử dụng, lõi lọc thô tích tụ cặn bẩn cần được thay mới.',
    content: [
      'Nguồn nước sinh hoạt hằng ngày chứa nhiều cặn bẩn, rỉ sét và hóa chất khử trùng.',
      'Lõi lọc thô số 1, 2, 3 có chức năng chặn các cặn bẩn kích thước từ 1 đến 5 micron. Việc thay lõi đúng định kỳ giúp máy vận hành êm ái, kéo dài tuổi thọ màng lọc RO.',
      'Khách hàng sử dụng máy lọc Truliva được theo dõi sức khỏe lõi lọc tự động và hỗ trợ thay lõi tận nơi với chi phí ưu đãi.'
    ]
  },
  {
    id: '2',
    title: 'Chọn máy lọc nước phù hợp cho gia đình: Những tiêu chí quan trọng',
    date: '11:05, 28/12/2023',
    views: 925,
    image: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=500&auto=format&fit=crop&q=60',
    summary: 'Lựa chọn máy lọc nước phù hợp cần dựa trên chất lượng nước đầu vào, số lượng thành viên và công suất sử dụng.',
    content: [
      'Gia đình từ 4 - 6 người nên lựa chọn dòng máy công suất lọc từ 15L/h đến 20L/h.',
      'Đối với nguồn nước máy chứa nhiều Clo, dòng máy tích hợp lõi Carbon cao cấp giúp khử mùi hiệu quả.',
      'Truliva cung cấp giải pháp tư vấn và khảo sát nguồn nước miễn phí tận nhà cho khách hàng.'
    ]
  },
  {
    id: '3',
    title: 'Sự Khác Biệt Giữa Máy Lọc Nước Trực Tiếp và Gián Tiếp',
    date: '11:04, 28/12/2023',
    views: 672,
    image: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=500&auto=format&fit=crop&q=60',
    summary: 'Phân biệt máy lọc nước đấu nối trực tiếp và dòng máy uống nóng lạnh gián tiếp qua bình áp.',
    content: [
      'Máy lọc nước trực tiếp không dùng bình chứa, tối ưu diện tích lắp đặt gầm bếp.',
      'Máy lọc nước gián tiếp sở hữu bình áp dự trữ nước khi mất điện, phục vụ nhu cầu uống liên tục.',
      'Mỗi dòng sản phẩm Truliva đều đạt chuẩn nước uống trực tiếp QCVN 6-1:2010/BYT.'
    ]
  },
  {
    id: '4',
    title: 'Máy lọc nước: Cách loại bỏ chất gây mùi và vị khó chịu trong nước',
    date: '11:04, 28/12/2023',
    views: 815,
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=500&auto=format&fit=crop&q=60',
    summary: 'Khám phá công nghệ than hoạt tính gáo dừa nén khối giúp loại bỏ 99.9% mùi Clo và vị ngái trong nước.',
    content: [
      'Nước máy tại một số khu vực có mùi Clo nồng do quá trình xử lý nhà máy.',
      'Lõi lọc than hoạt tính Truliva có diện tích bề mặt hấp phụ cực lớn, loại bỏ hoàn toàn hợp chất hữu cơ và mùi lạ.',
      'Định kỳ 6 - 9 tháng nên kiểm tra và thay lõi lọc vị để nước luôn tươi ngon ngọt tự nhiên.'
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
