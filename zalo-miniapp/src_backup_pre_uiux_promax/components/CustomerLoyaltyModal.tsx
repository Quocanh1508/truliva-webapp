import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Sparkles, CheckCircle2, Coins } from 'lucide-react';
import { fetchZaloApi } from '../api/client';

interface CustomerLoyaltyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPoints: number;
  rank?: any;
  onOpenScanner?: () => void;
}

export default function CustomerLoyaltyModal({ isOpen, onClose, userPoints }: CustomerLoyaltyModalProps) {
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

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[88vh] border border-sky-100 animate-scale-up">
        
        {/* Header (P3R Ocean Depth) */}
        <div className="bg-gradient-to-r from-[#061226] via-[#0B2545] to-[#0F3866] p-4 text-white flex items-center justify-between relative overflow-hidden">
          <div className="flex items-center space-x-2.5 relative z-10">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center border shadow-xs bg-amber-500/20 border-amber-400">
              <Coins size={18} className="text-amber-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Ví Điểm Tích Lũy</h3>
              <p className="text-[10px] text-sky-200">1 Điểm = 1.000 VNĐ giảm giá đơn hàng</p>
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
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Số điểm tích lũy của bạn</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-amber-500">
                {currentPoints.toLocaleString('vi-VN')}
              </span>
              <span className="text-xs text-slate-500 font-bold uppercase">Điểm</span>
            </div>
          </div>

          {/* 2. Lịch sử tích điểm từ đơn hàng Truliva */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag size={13} className="text-[#0284C7]" />
                Lịch sử tích điểm từ đơn hàng Truliva
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
                        +{ord.pointsEarned.toLocaleString('vi-VN')} điểm
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 text-center border border-slate-200 space-y-1">
                <p className="text-xs font-semibold text-slate-600">Chưa có đơn hàng tích điểm nào</p>
                <p className="text-[10px] text-slate-400">Các đơn hàng hoàn thành trên Truliva App sẽ tự động được cộng điểm vào đây</p>
              </div>
            )}
          </div>

          {/* 3. Cơ chế tích điểm Truliva */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Cơ chế tích & dùng điểm</h4>
            <div className="bg-white rounded-2xl p-3 border border-slate-200 divide-y divide-slate-100 text-xs shadow-xs">
              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Đơn hàng từ 5 triệu trở xuống</p>
                    <p className="text-[10px] text-slate-400">Thay lõi, bảo dưỡng, dịch vụ</p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">Tích 10%</span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-sky-50 text-[#0284C7] rounded-lg">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Đơn hàng trên 5 triệu</p>
                    <p className="text-[10px] text-slate-400">Mua máy mới, thiết bị lớn</p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-[#0284C7] bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">Tích 5%</span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                    <CheckCircle2 size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[11px]">Tỷ lệ quy đổi điểm</p>
                    <p className="text-[10px] text-slate-400">1 Điểm = 1.000 VNĐ giảm giá trực tiếp</p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">1 Điểm = 1.000đ</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-100 flex justify-end">
          <button 
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-xs bg-[#1B3A6B] text-white hover:bg-[#152e55] transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
