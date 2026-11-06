import React, { useState, useEffect } from 'react';
import { X, Ticket, Copy, Check, Sparkles, ExternalLink, Gift, Clock } from 'lucide-react';
import { fetchZaloApi } from '../api/client';

interface CustomerVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseVoucher: (code: string) => void;
}

const DEFAULT_VOUCHERS = [
  {
    id: 'v-50k',
    code: 'THAYLOI50K',
    title: 'Voucher 50.000đ Thay Lõi Lọc',
    description: 'Áp dụng cho dịch vụ thay bộ 3 lõi lọc thô số 1, 2, 3 Truliva chính hãng tận nhà.',
    discountAmount: 50000,
    minOrderAmount: 150000,
    expiryDate: '30/09/2026',
    badge: 'ƯU ĐÃI THÀNH VIÊN',
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200'
  },
  {
    id: 'v-100k',
    code: 'BAODUONG100K',
    title: 'Voucher 100.000đ Bảo Dưỡng Toàn Diện',
    description: 'Áp dụng cho gói vệ sinh bình áp, đo kiểm chỉ số TDS và bảo dưỡng tổng thể máy lọc nước.',
    discountAmount: 100000,
    minOrderAmount: 300000,
    expiryDate: '31/10/2026',
    badge: 'HOT NHẤT THÁNG',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  {
    id: 'v-free-tds',
    code: 'MIENPHITDS',
    title: 'Miễn Phí Đo TDS & Khám Nước Tận Nhà',
    description: 'Kỹ thuật viên Truliva kiểm tra đo TDS nước đầu vào/đầu ra và tư vấn bảo vệ nguồn nước miễn phí 100%.',
    discountAmount: 0,
    minOrderAmount: 0,
    expiryDate: '31/12/2026',
    badge: 'QUÀ TẶNG 1-CLICK',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
];

export default function CustomerVoucherModal({ isOpen, onClose, onUseVoucher }: CustomerVoucherModalProps) {
  const [vouchers, setVouchers] = useState<any[]>(DEFAULT_VOUCHERS);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchZaloApi('/zalo-miniapp/vouchers')
        .then(res => {
          if (res.success && Array.isArray(res.vouchers) && res.vouchers.length > 0) {
            setVouchers(res.vouchers);
          }
        })
        .catch(err => {
          console.warn('Could not fetch vouchers, using fallback:', err);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-sky-100 animate-scale-up">
        
        {/* Header (P3R Ocean Depth) */}
        <div className="bg-gradient-to-r from-[#061226] via-[#0B2545] to-[#0F3866] p-4 text-white flex items-center justify-between relative overflow-hidden">
          <div className="flex items-center space-x-2.5 relative z-10">
            <div className="w-8 h-8 rounded-xl bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_10px_rgba(0,210,255,0.4)]">
              <Ticket size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Voucher & Ưu Đãi Của Tôi</h3>
              <p className="text-[10px] text-sky-200">Đã áp dụng tự động cho tài khoản Zalo</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Vouchers List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-slate-50">
          {vouchers.map((v) => (
            <div 
              key={v.id || v.code}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs relative overflow-hidden space-y-2.5 group hover:border-sky-300 transition-all"
            >
              {/* Badge */}
              <div className="flex justify-between items-start">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider ${v.badgeColor || 'bg-cyan-50 text-cyan-700 border-cyan-200'}`}>
                  {v.badge || 'ƯU ĐÃI'}
                </span>
                <span className="text-[10px] font-medium text-slate-400 flex items-center">
                  <Clock size={11} className="mr-1" />
                  HSD: {v.expiryDate}
                </span>
              </div>

              {/* Title & Info */}
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs leading-snug">{v.title}</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{v.description}</p>
              </div>

              {/* Code Box & Actions */}
              <div className="bg-sky-50/60 rounded-xl p-2 flex items-center justify-between border border-sky-100">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">MÃ:</span>
                  <span className="font-mono font-black text-xs text-[#0284C7] tracking-wider">{v.code}</span>
                </div>

                <div className="flex items-center space-x-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleCopy(v.code)}
                    className="p-1.5 bg-white text-slate-600 hover:text-[#0284C7] rounded-lg border border-slate-200 text-[10px] font-bold flex items-center space-x-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    {copiedCode === v.code ? (
                      <>
                        <Check size={12} className="text-emerald-600" />
                        <span className="text-emerald-600">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onUseVoucher(v.code)}
                    className="px-2.5 py-1.5 bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white rounded-lg text-[10px] font-bold shadow-xs active:scale-95 hover:opacity-95 transition-all flex items-center space-x-1 cursor-pointer"
                  >
                    <Gift size={11} />
                    <span>Dùng ngay</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400">
            Voucher được giảm trừ trực tiếp khi KTV thực hiện dịch vụ tại nhà.
          </p>
        </div>

      </div>
    </div>
  );
}
