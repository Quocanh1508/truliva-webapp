import React, { useState, useEffect, useCallback } from 'react';
import { X, History, Wrench, Calendar, User, Package, Tag, RefreshCw } from 'lucide-react';
import { fetchZaloApi } from '../api/client';

interface CustomerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookService: (serialNumber?: string) => void;
}

export interface ServiceHistoryRecord {
  id: string;
  status: string; // Thứ tự 1: Trạng thái (Hoàn thành, Đang thực hiện, Chờ xử lý...)
  statusCode?: 'completed' | 'in_progress' | 'pending' | 'rescheduled' | 'cancelled';
  updatedAt: string; // Thứ tự 2: Thời gian cập nhật realtime
  completedAt?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  productName: string; // Thứ tự 3: Tên sản phẩm / dòng máy
  modelName?: string;
  serial?: string | null; // Thứ tự 4: Mã Serial máy
  serialNumber?: string | null;
  jobType: string; // Thứ tự 5: Loại công việc
  workType?: string;
  serviceType?: string | null; // Thứ tự 6: Loại dịch vụ (ẩn nếu null)
  technicianName?: string | null; // Thứ tự 7: KTV phụ trách (không có SĐT)
  ktvUser?: { fullName: string } | null;
}

function getStatusBadge(status?: string, statusCode?: string) {
  const s = (status || statusCode || '').toLowerCase().trim();

  if (s.includes('hoàn thành') || s.includes('completed') || s.includes('delivered') || s.includes('approved')) {
    return {
      label: status || 'Hoàn thành',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
  }
  if (s.includes('đang') || s.includes('in_progress') || s.includes('processing') || s.includes('phân công') || s.includes('assigned') || s.includes('shipping')) {
    return {
      label: status || 'Đang thực hiện',
      className: 'bg-blue-50 text-blue-700 border-blue-200'
    };
  }
  if (s.includes('chờ') || s.includes('pending') || s.includes('chưa') || s.includes('tiếp nhận')) {
    return {
      label: status || 'Chờ xử lý',
      className: 'bg-amber-50 text-amber-700 border-amber-200'
    };
  }
  if (s.includes('hẹn lại') || s.includes('rescheduled') || s.includes('hẹn')) {
    return {
      label: status || 'Hẹn lại',
      className: 'bg-purple-50 text-purple-700 border-purple-200'
    };
  }
  if (s.includes('hủy') || s.includes('cancelled') || s.includes('từ chối') || s.includes('rejected')) {
    return {
      label: status || 'Hủy đơn',
      className: 'bg-rose-50 text-rose-700 border-rose-200'
    };
  }
  if (s.includes('đổi') || s.includes('returned')) {
    return {
      label: status || 'Đổi hoàn',
      className: 'bg-indigo-50 text-indigo-700 border-indigo-200'
    };
  }
  return {
    label: status || 'Đang xử lý',
    className: 'bg-slate-100 text-slate-700 border-slate-200'
  };
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--';
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch {
    return '--';
  }
}

export default function CustomerHistoryModal({ isOpen, onClose, onBookService }: CustomerHistoryModalProps) {
  const [history, setHistory] = useState<ServiceHistoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHistory = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

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
          <div className="flex items-center space-x-1.5 relative z-10">
            <button
              onClick={fetchHistory}
              disabled={loading}
              title="Làm mới realtime"
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-cyan-300' : ''} />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-slate-50">
          {loading && history.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500 font-medium">Đang đồng bộ dữ liệu realtime...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200/80 shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-[#0284C7] flex items-center justify-center mx-auto border border-sky-100">
                <Wrench size={24} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Chưa có lịch sử bảo trì</p>
                <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                  Khi KTV tiếp nhận, đang thực hiện hoặc hoàn thành ca kiểm tra, thay lõi, thông tin sẽ được cập nhật realtime tại đây.
                </p>
              </div>
              <button
                onClick={() => onBookService()}
                className="w-full py-2.5 bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                Đặt lịch KTV bảo trì / Thay lõi ngay
              </button>
            </div>
          ) : (
            history.map((item) => {
              const badge = getStatusBadge(item.status, item.statusCode);
              const serialStr = item.serial || item.serialNumber;
              const prodName = item.productName || item.modelName || 'Máy lọc nước Truliva';
              const jobStr = item.jobType || item.workType || 'Bảo trì & Thay lõi';
              const timeStr = formatDateTime(item.updatedAt || item.completedAt || item.scheduledAt || item.createdAt);
              const techName = item.technicianName || item.ktvUser?.fullName || 'Đang điều phối KTV';

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs space-y-2.5 transition-all hover:shadow-sm"
                >
                  {/* Thứ tự 1 & 2: Trạng thái (Trái) & Thời gian (Phải) */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    {/* Thứ tự 1 - Trạng thái */}
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${badge.className}`}>
                      {badge.label}
                    </span>
                    {/* Thứ tự 2 - Thời gian cập nhật */}
                    <span className="text-[11px] text-slate-400 font-medium flex items-center shrink-0">
                      <Calendar size={12} className="mr-1 text-slate-400" />
                      {timeStr}
                    </span>
                  </div>

                  {/* Thứ tự 3 - Tên sản phẩm */}
                  <div className="flex items-start gap-2 pt-0.5">
                    <div className="w-6 h-6 rounded-lg bg-sky-50 text-[#0284C7] flex items-center justify-center shrink-0 mt-0.5 border border-sky-100">
                      <Package size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-extrabold text-slate-900 text-xs leading-snug line-clamp-2">
                        {prodName}
                      </h4>
                    </div>
                  </div>

                  {/* Thứ tự 4 - Serial máy */}
                  {serialStr && (
                    <div className="bg-sky-50/80 px-2.5 py-1.5 rounded-xl border border-sky-100 text-[11px] font-mono text-[#0284C7] flex items-center justify-between">
                      <span className="text-slate-500 font-sans font-medium text-[10px]">Serial máy:</span>
                      <span className="font-bold tracking-tight">{serialStr}</span>
                    </div>
                  )}

                  {/* Thứ tự 5 - Loại công việc */}
                  <div className="flex items-center text-xs text-slate-700">
                    <Wrench size={13} className="text-slate-400 mr-1.5 shrink-0" />
                    <span className="text-slate-500 text-[11px] mr-1">Loại công việc:</span>
                    <strong className="text-slate-800 text-[11px] font-bold">{jobStr}</strong>
                  </div>

                  {/* Thứ tự 6 - Loại dịch vụ (chỉ render khi có dữ liệu, ẩn khi rỗng/null) */}
                  {item.serviceType && item.serviceType.trim() !== '' && (
                    <div className="flex items-center text-xs text-slate-700">
                      <Tag size={13} className="text-slate-400 mr-1.5 shrink-0" />
                      <span className="text-slate-500 text-[11px] mr-1">Loại dịch vụ:</span>
                      <span className="text-slate-700 text-[11px] font-medium">{item.serviceType}</span>
                    </div>
                  )}

                  {/* Thứ tự 7 - KTV (Chỉ hiển thị tên KTV, XÓA BỎ HOÀN TOÀN số điện thoại) */}
                  <div className="flex items-center text-xs text-slate-600 pt-1.5 border-t border-slate-100">
                    <User size={13} className="text-slate-400 mr-1.5 shrink-0" />
                    <span className="text-slate-500 text-[11px] mr-1">KTV:</span>
                    <strong className="text-slate-800 text-[11px]">{techName}</strong>
                  </div>
                </div>
              );
            })
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
