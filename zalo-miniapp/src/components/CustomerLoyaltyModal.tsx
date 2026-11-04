import React, { useState, useEffect } from 'react';
import { X, Star, Crown, Award, Gem, Sparkles, CheckCircle2, Gift, QrCode, UserPlus, MessageSquare, ShoppingBag } from 'lucide-react';
import { RankConfig, RANK_CONFIGS } from '../utils/memberRank';
import { fetchZaloApi } from '../api/client';

interface CustomerLoyaltyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPoints: number;
  rank: RankConfig;
  onOpenScanner?: () => void;
}

export default function CustomerLoyaltyModal({ isOpen, onClose, userPoints, rank, onOpenScanner }: CustomerLoyaltyModalProps) {
  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoadingOrders(true);
      fetchZaloApi('/zalo-miniapp/loyalty')
        .then(res => {
          if (res && res.success) {
            setLoyaltyData(res);
          }
        })
        .catch(err => {
          console.warn('Could not load loyalty details:', err);
        })
        .finally(() => {
          setLoadingOrders(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPoints = typeof loyaltyData?.points === 'number' ? loyaltyData.points : userPoints;
  const currentRank = loyaltyData?.tier && RANK_CONFIGS[loyaltyData.tier as keyof typeof RANK_CONFIGS]
    ? RANK_CONFIGS[loyaltyData.tier as keyof typeof RANK_CONFIGS]
    : rank;

  // Tính điểm cần thêm để lên hạng tiếp theo
  let nextRankName = 'Hạng tối đa';
  let pointsNeeded = 0;
  let progressPercent = 100;

  if (currentPoints < 200) {
    nextRankName = 'Thành viên Bạc';
    pointsNeeded = 200 - currentPoints;
    progressPercent = Math.min(100, Math.round((currentPoints / 200) * 100));
  } else if (currentPoints < 500) {
    nextRankName = 'Thành viên Vàng';
    pointsNeeded = 500 - currentPoints;
    progressPercent = Math.min(100, Math.round(((currentPoints - 200) / 300) * 100));
  } else if (currentPoints < 1000) {
    nextRankName = 'Thành viên Kim Cương';
    pointsNeeded = 1000 - currentPoints;
    progressPercent = Math.min(100, Math.round(((currentPoints - 500) / 500) * 100));
  }

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const TIERS = [
    {
      tier: 'BRONZE',
      name: 'Thành viên Đồng',
      points: '0 - 199 Điểm',
      icon: <Award size={14} className="text-[#FBBF24]" />,
      benefits: ['Tích 10% đơn <= 5tr, 5% đơn > 5tr', 'Khấu trừ tiền hàng (1 điểm = 1.000đ)']
    },
    {
      tier: 'SILVER',
      name: 'Thành viên Bạc',
      points: '200 - 499 Điểm',
      icon: <Sparkles size={14} className="text-[#E2E8F0]" />,
      benefits: ['Ưu đãi giảm giá 5% lõi lọc thay thế', 'Hỗ trợ kỹ thuật viên ưu tiên']
    },
    {
      tier: 'GOLD',
      name: 'Thành viên Vàng',
      points: '500 - 999 Điểm',
      icon: <Crown size={14} className="text-[#FACC15]" />,
      benefits: ['Miễn phí kiểm tra TDS tại nhà 1 lần/năm', 'Quà tặng tri ân sinh nhật chính hãng']
    },
    {
      tier: 'DIAMOND',
      name: 'Thành viên Kim Cương',
      points: '1000+ Điểm',
      icon: <Gem size={14} className="text-[#F0ABFC]" />,
      benefits: ['Miễn phí công KTV bảo dưỡng trọn đời', 'KTV Trưởng phục vụ chuyên biệt']
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[88vh] border border-sky-100 animate-scale-up">
        
        {/* Header (P3R Ocean Depth with dynamic rank glow) */}
        <div className="bg-gradient-to-r from-[#061226] via-[#0B2545] to-[#0F3866] p-4 text-white flex items-center justify-between relative overflow-hidden">
          <div className="flex items-center space-x-2.5 relative z-10">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-xs`} style={{ backgroundColor: `${currentRank.iconColor}25`, borderColor: currentRank.iconColor }}>
              <Star size={18} style={{ color: currentRank.iconColor }} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Điểm Thưởng & Hạng Thành Viên</h3>
              <p className="text-[10px] text-sky-200">Cơ chế tích điểm Truliva (Shopee Xu)</p>
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
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Điểm tích lũy hiện có</span>
                <div className="text-2xl font-black mt-0.5" style={{ color: currentRank.iconColor }}>
                  {currentPoints.toLocaleString('vi-VN')} <span className="text-xs text-slate-500 font-bold">Điểm</span>
                </div>
                <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                  ≈ {formatVND(currentPoints * 1000)} tiền mặt khấu trừ
                </p>
              </div>
              <div className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border ${currentRank.badgeBg} ${currentRank.borderColor} ${currentRank.textColor} flex items-center space-x-1`}>
                <span style={{ color: currentRank.iconColor }}>●</span>
                <span>{currentRank.label}</span>
              </div>
            </div>

            {/* Progress bar */}
            {pointsNeeded > 0 ? (
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 font-semibold mb-1">
                  <span>Tiến độ lên {nextRankName}</span>
                  <span className="font-bold text-[#0284C7]">Còn {pointsNeeded.toLocaleString('vi-VN')} điểm</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/60">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ width: `${progressPercent}%`, backgroundColor: currentRank.iconColor }}
                  ></div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-emerald-600 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                🎉 Bạn đã đạt cấp độ Hạng Thành viên cao nhất!
              </div>
            )}
          </div>

          {/* 2. Lịch sử tích điểm từ đơn hàng Truliva */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag size={13} className="text-[#0284C7]" />
                Lịch sử tích điểm từ đơn hàng
              </h4>
              {loyaltyData?.orders && (
                <span className="text-[10px] text-slate-400 font-semibold">{loyaltyData.orders.length} đơn</span>
              )}
            </div>

            {loadingOrders ? (
              <div className="bg-white rounded-2xl p-4 text-center border border-slate-200">
                <span className="text-xs text-slate-400">Đang tải lịch sử tích điểm...</span>
              </div>
            ) : loyaltyData?.orders && loyaltyData.orders.length > 0 ? (
              <div className="bg-white rounded-2xl p-3 border border-slate-200 divide-y divide-slate-100 text-xs shadow-xs max-h-48 overflow-y-auto">
                {loyaltyData.orders.map((ord: any) => (
                  <div key={ord.orderId} className="py-2.5 first:pt-1 last:pb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-[11px]">{ord.orderCode}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-sky-50 text-[#0284C7] border border-sky-100">
                          Tích {ord.ratePercent}%
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">{ord.itemsSummary}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">
                        Giá trị đơn: {formatVND(ord.orderAmount)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[12px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 block">
                        +{ord.pointsEarned.toLocaleString('vi-VN')} đ
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        ≈ +{formatVND(ord.pointValueVnd)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 text-center border border-slate-200 space-y-1">
                <p className="text-xs font-semibold text-slate-600">Chưa có đơn hàng tích điểm nào</p>
                <p className="text-[10px] text-slate-400">Đơn hàng hoàn thành sẽ tự động tích điểm vào ví của bạn</p>
              </div>
            )}
          </div>

          {/* 3. Cơ chế tích điểm Truliva */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Quy chế tích điểm & Tiêu điểm</h4>
            <div className="bg-white rounded-2xl p-3 border border-slate-200 divide-y divide-slate-100 text-xs shadow-xs">
              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Đơn hàng từ 5 triệu trở xuống</p>
                    <p className="text-[10px] text-slate-400">Thay lõi, bảo dưỡng, linh kiện</p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">Tích 10%</span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                    <Crown size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Đơn hàng trên 5 triệu</p>
                    <p className="text-[10px] text-slate-400">Máy lọc nước mới, gói combo</p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">Tích 5%</span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                    <Gift size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Quy đổi như Shopee Xu</p>
                    <p className="text-[10px] text-slate-400">Khấu trừ trực tiếp khi mua hàng</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">1đ = 1.000đ</span>
              </div>
            </div>
          </div>

          {/* 4. Tier Perks Table */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Đặc quyền 4 Hạng Thành Viên</h4>
            <div className="space-y-2">
              {TIERS.map((t) => (
                <div 
                  key={t.tier}
                  className={`bg-white rounded-2xl p-3 border shadow-2xs space-y-1.5 ${currentRank.tier === t.tier ? 'border-[#0284C7] ring-1 ring-[#0284C7]/30' : 'border-slate-200/80'}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-1.5 font-bold text-xs text-slate-900">
                      {t.icon}
                      <span>{t.name}</span>
                      {currentRank.tier === t.tier && (
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
