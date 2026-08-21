import React from 'react';
import { X, Star, Crown, Award, Gem, Sparkles, CheckCircle2, ChevronRight, Gift, QrCode, UserPlus, MessageSquare } from 'lucide-react';
import { RankConfig, RANK_CONFIGS } from '../utils/memberRank';

interface CustomerLoyaltyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPoints: number;
  rank: RankConfig;
  onOpenScanner?: () => void;
}

export default function CustomerLoyaltyModal({ isOpen, onClose, userPoints, rank, onOpenScanner }: CustomerLoyaltyModalProps) {
  if (!isOpen) return null;

  // Tính điểm cần thêm để lên hạng tiếp theo
  let nextRankName = 'Hạng tối đa';
  let pointsNeeded = 0;
  let progressPercent = 100;

  if (userPoints < 200) {
    nextRankName = 'Thành viên Bạc';
    pointsNeeded = 200 - userPoints;
    progressPercent = Math.min(100, Math.round((userPoints / 200) * 100));
  } else if (userPoints < 500) {
    nextRankName = 'Thành viên Vàng';
    pointsNeeded = 500 - userPoints;
    progressPercent = Math.min(100, Math.round(((userPoints - 200) / 300) * 100));
  } else if (userPoints < 1000) {
    nextRankName = 'Thành viên Kim Cương';
    pointsNeeded = 1000 - userPoints;
    progressPercent = Math.min(100, Math.round(((userPoints - 500) / 500) * 100));
  }

  const TIERS = [
    {
      tier: 'BRONZE',
      name: 'Thành viên Đồng',
      points: '0 - 199 Điểm',
      icon: <Award size={14} className="text-[#FBBF24]" />,
      benefits: ['Tích điểm bảo dưỡng 100%', 'Nhận voucher 50k thay lõi']
    },
    {
      tier: 'SILVER',
      name: 'Thành viên Bạc',
      points: '200 - 499 Điểm',
      icon: <Sparkles size={14} className="text-[#E2E8F0]" />,
      benefits: ['Tích điểm bảo dưỡng 110%', 'Voucher 100k bảo dưỡng', 'Hỗ trợ ưu tiên qua Hotline']
    },
    {
      tier: 'GOLD',
      name: 'Thành viên Vàng',
      points: '500 - 999 Điểm',
      icon: <Crown size={14} className="text-[#FACC15]" />,
      benefits: ['Tích điểm bảo dưỡng 120%', 'Miễn phí kiểm tra TDS tại nhà 1 lần/năm', 'Quà tặng tri ân sinh nhật']
    },
    {
      tier: 'DIAMOND',
      name: 'Thành viên Kim Cương',
      points: '1000+ Điểm',
      icon: <Gem size={14} className="text-[#F0ABFC]" />,
      benefits: ['Tích điểm 150%', 'Miễn phí công KTV trọn đời', 'Đổi voucher không giới hạn', 'KTV Trưởng phục vụ']
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-sky-100 animate-scale-up">
        
        {/* Header (P3R Ocean Depth with dynamic rank glow) */}
        <div className="bg-gradient-to-r from-[#061226] via-[#0B2545] to-[#0F3866] p-4 text-white flex items-center justify-between relative overflow-hidden">
          <div className="flex items-center space-x-2.5 relative z-10">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-xs`} style={{ backgroundColor: `${rank.iconColor}25`, borderColor: rank.iconColor }}>
              <Star size={18} style={{ color: rank.iconColor }} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Điểm Thưởng & Hạng Thành Viên</h3>
              <p className="text-[10px] text-sky-200">Đặc quyền tích điểm thành viên Truliva</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 bg-slate-50">
          
          {/* 1. Point HUD Card */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Điểm hiện có</span>
                <div className="text-2xl font-black mt-0.5" style={{ color: rank.iconColor }}>
                  {userPoints} <span className="text-xs text-slate-500 font-bold">Điểm</span>
                </div>
              </div>
              <div className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border ${rank.badgeBg} ${rank.borderColor} ${rank.textColor} flex items-center space-x-1`}>
                <span style={{ color: rank.iconColor }}>●</span>
                <span>{rank.label}</span>
              </div>
            </div>

            {/* Progress bar */}
            {pointsNeeded > 0 ? (
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 font-semibold mb-1">
                  <span>Tiến độ lên {nextRankName}</span>
                  <span className="font-bold text-[#0284C7]">Còn {pointsNeeded} điểm</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/60">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ width: `${progressPercent}%`, backgroundColor: rank.iconColor }}
                  ></div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-emerald-600 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                🎉 Bạn đã đạt cấp độ Hạng Thành viên cao nhất!
              </div>
            )}
          </div>

          {/* 2. Ways to earn points */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Cách tích thêm điểm thưởng</h4>
            <div className="bg-white rounded-2xl p-3 border border-slate-200 divide-y divide-slate-100 text-xs shadow-xs">
              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-sky-50 text-[#0284C7] rounded-lg">
                    <QrCode size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Kích hoạt bảo hành máy mới</p>
                    <p className="text-[10px] text-slate-400">Quét mã QR dán trên thân máy</p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">+100 đ</span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                    <UserPlus size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Giới thiệu bạn bè dùng máy</p>
                    <p className="text-[10px] text-slate-400">Chia sẻ link Zalo Mini App</p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">+150 đ</span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                    <MessageSquare size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Đánh giá dịch vụ KTV 5 Sao</p>
                    <p className="text-[10px] text-slate-400">Sau khi KTV hoàn thành ca</p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">+50 đ</span>
              </div>
            </div>
          </div>

          {/* 3. Tier Perks Table */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Đặc quyền 4 Hạng Thành Viên</h4>
            <div className="space-y-2">
              {TIERS.map((t) => (
                <div 
                  key={t.tier}
                  className={`bg-white rounded-2xl p-3 border shadow-2xs space-y-1.5 ${rank.tier === t.tier ? 'border-[#0284C7] ring-1 ring-[#0284C7]/30' : 'border-slate-200/80'}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-1.5 font-bold text-xs text-slate-900">
                      {t.icon}
                      <span>{t.name}</span>
                      {rank.tier === t.tier && (
                        <span className="bg-[#0284C7] text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full ml-1">Hiện tại</span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{t.points}</span>
                  </div>
                  <ul className="text-[10px] text-slate-500 space-y-0.5 pl-4 list-disc">
                    {t.benefits.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-100 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Đã hiểu
          </button>
        </div>

      </div>
    </div>
  );
}
