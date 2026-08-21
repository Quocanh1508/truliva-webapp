import React, { useState, useEffect } from 'react';
import { X, History, Wrench, ShieldCheck, Calendar, Droplets, User, AlertCircle, ChevronRight, Phone } from 'lucide-react';
import { fetchZaloApi } from '../api/client';

interface CustomerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookService: (serialNumber?: string) => void;
}

export default function CustomerHistoryModal({ isOpen, onClose, onBookService }: CustomerHistoryModalProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchZaloApi('/zalo-miniapp/service-history')
        .then(res => {
          if (res.success && Array.isArray(res.history)) {
            setHistory(res.history);
          }
        })
        .catch(err => {
          console.warn('Could not fetch service history:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-sky-100 animate-scale-up">
        
        {/* Header (P3R Ocean Depth) */}
        <div className="bg-gradient-to-r from-[#061226] via-[#0B2545] to-[#0F3866] p-4 text-white flex items-center justify-between relative overflow-hidden">
          <div className="flex items-center space-x-2.5 relative z-10">
            <div className="w-8 h-8 rounded-xl bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_10px_rgba(0,210,255,0.4)]">
              <History size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Lịch Sử Bảo Trì & Thay Lõi</h3>
              <p className="text-[10px] text-sky-200">Nhật ký kỹ thuật viên chăm sóc máy</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-slate-50">
          {loading ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500 font-medium">Đang tải lịch sử dịch vụ...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200/80 shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-[#0284C7] flex items-center justify-center mx-auto border border-sky-100">
                <Wrench size={24} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Chưa có lịch sử bảo trì</p>
                <p className="text-slate-400 text-[11px] mt-1">Khi KTV hoàn thành ca kiểm tra, thay lõi hoặc bảo dưỡng, thông tin sẽ được lưu tự động tại đây.</p>
              </div>
              <button
                onClick={() => onBookService()}
                className="w-full py-2.5 bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                Đặt lịch KTV bảo trì / Thay lõi ngay
              </button>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id}
                className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs space-y-2.5"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                      Hoàn thành
                    </span>
                    <h4 className="font-extrabold text-slate-900 text-xs mt-1">
                      {item.workType || item.serviceType || 'Bảo trì & Thay lõi lọc'}
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium flex items-center">
                    <Calendar size={11} className="mr-1" />
                    {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                {item.serialNumber && (
                  <p className="text-[10px] font-mono text-[#0284C7] bg-sky-50 px-2 py-1 rounded-md border border-sky-100">
                    Serial máy: {item.serialNumber}
                  </p>
                )}

                {/* TDS & Water Quality indicator */}
                {(typeof item.tdsIn === 'number' || typeof item.tdsOut === 'number') && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl text-[10px] border border-slate-100">
                    <div>
                      <span className="text-slate-400">TDS Nước vào:</span>
                      <span className="font-bold text-slate-700 ml-1">{item.tdsIn ?? '--'} ppm</span>
                    </div>
                    <div>
                      <span className="text-slate-400">TDS Nước ra:</span>
                      <span className="font-bold text-emerald-600 ml-1">{item.tdsOut ?? '--'} ppm (Đạt chuẩn)</span>
                    </div>
                  </div>
                )}

                {/* Technician info */}
                {item.ktvUser && (
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                    <span className="flex items-center">
                      <User size={11} className="mr-1 text-slate-400" />
                      KTV: <strong className="text-slate-700 ml-0.5">{item.ktvUser.fullName}</strong>
                    </span>
                    {item.ktvUser.phoneNumber && (
                      <span className="text-sky-600 font-medium">{item.ktvUser.phoneNumber}</span>
                    )}
                  </div>
                )}

                {item.notes && (
                  <p className="text-[10px] text-slate-500 italic bg-amber-50/50 p-1.5 rounded border border-amber-100/60">
                    Ghi chú: {item.notes}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-medium">Tổng số ca: {history.length}</span>
          <button
            onClick={() => onBookService()}
            className="px-3 py-1.5 bg-[#1B3A6B] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center space-x-1 cursor-pointer"
          >
            <Wrench size={12} />
            <span>Đặt lịch KTV mới</span>
          </button>
        </div>

      </div>
    </div>
  );
}
