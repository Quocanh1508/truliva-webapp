import React, { useMemo, useState } from 'react';
import {
  History, XCircle, Warehouse, Clock, UserCog, MapPin, Activity, Package, StickyNote,
  Wrench, Tag, Bot, Plus, RotateCcw, Ban, UserPlus, Pencil, CalendarClock, ArrowRight, Minus
} from 'lucide-react';

type Props = {
  logs: any[];
  loading: boolean;
  stations: any[];
  allKtvs: any[];
  orderLabel?: string;
  onClose: () => void;
};

// ── Cấu hình trường dữ liệu ──
type FieldGroup = 'warehouse' | 'dispatch' | 'status' | 'schedule' | 'other';

const FIELD_META: Record<string, { label: string; group: FieldGroup; icon: React.ElementType }> = {
  adminStatus: { label: 'Trạng thái xử lý', group: 'status', icon: Activity },
  cancelReason: { label: 'Lý do hủy', group: 'status', icon: Ban },
  workType: { label: 'Loại công việc', group: 'other', icon: Wrench },
  serviceType: { label: 'Dịch vụ chi tiết', group: 'other', icon: Wrench },
  mainStationId: { label: 'Trạm chính', group: 'dispatch', icon: MapPin },
  techStationId: { label: 'Trạm kỹ thuật', group: 'dispatch', icon: MapPin },
  assignedKtvId: { label: 'Kỹ thuật viên', group: 'dispatch', icon: UserCog },
  salesKtvId: { label: 'KTV bán hàng', group: 'dispatch', icon: UserCog },
  appointmentTime: { label: 'Thời gian hẹn', group: 'schedule', icon: Clock },
  rescheduleReason: { label: 'Lý do hẹn lại', group: 'schedule', icon: CalendarClock },
  warehouseInfo: { label: 'Kho xuất hàng', group: 'warehouse', icon: Warehouse },
  items: { label: 'Sản phẩm (tổng SL)', group: 'other', icon: Package },
  note: { label: 'Ghi chú', group: 'other', icon: StickyNote },
  promoCode: { label: 'Mã khuyến mãi', group: 'other', icon: Tag },
  pancakeOrderId: { label: 'Mã đơn Pancake', group: 'other', icon: Tag },
};

const FILTERS: { key: 'all' | FieldGroup; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'warehouse', label: 'Kho' },
  { key: 'dispatch', label: 'KTV / Trạm' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'schedule', label: 'Lịch hẹn' },
  { key: 'other', label: 'Khác' },
];

const ACTION_META: Record<string, { label: string; icon: React.ElementType; dot: string; badge: string }> = {
  created_manual: { label: 'Tạo ca thủ công', icon: Plus, dot: 'bg-green-500', badge: 'bg-green-50 text-green-700 border-green-200' },
  created: { label: 'Tạo ca', icon: Plus, dot: 'bg-green-500', badge: 'bg-green-50 text-green-700 border-green-200' },
  updated: { label: 'Cập nhật', icon: Pencil, dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  assigned: { label: 'Phân công', icon: UserPlus, dot: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  cancelled: { label: 'Hủy đơn', icon: Ban, dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' },
  restored: { label: 'Khôi phục', icon: RotateCcw, dot: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  rescheduled: { label: 'Hẹn lại lịch', icon: CalendarClock, dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const EMPTY = 'Trống';

function parseChanges(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  if (typeof raw === 'object') return [raw];
  return [];
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function dayKey(d: Date) {
  return d.toLocaleDateString('vi-VN');
}

function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const base = d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (dayKey(d) === dayKey(today)) return `Hôm nay · ${d.toLocaleDateString('vi-VN')}`;
  if (dayKey(d) === dayKey(yesterday)) return `Hôm qua · ${d.toLocaleDateString('vi-VN')}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function relativeTime(d: Date) {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  return `${days} ngày trước`;
}

export default function OrderAuditTimeline({ logs, loading, stations, allKtvs, orderLabel, onClose }: Props) {
  const [filter, setFilter] = useState<'all' | FieldGroup>('all');

  const getStationName = (id: string) => {
    const mainSt = stations.find((s: any) => s.id === id);
    if (mainSt) return mainSt.name;
    for (const main of stations) {
      const techSt = main.techStations?.find((t: any) => t.id === id);
      if (techSt) return techSt.name;
    }
    return id;
  };

  const getKtvName = (id: string) => allKtvs.find((x: any) => x.id === id)?.fullName || id;

  const formatValue = (field: string, val: any): string => {
    if (val === null || val === undefined || val === '' || val === EMPTY || val === 'null') return EMPTY;
    if (field === 'adminStatus' && String(val).toLowerCase() === 'đang thực hiện') return 'đã phân công';
    if (field === 'mainStationId' || field === 'techStationId') return getStationName(String(val));
    if (field === 'assignedKtvId' || field === 'salesKtvId') return getKtvName(String(val));
    if (field === 'warehouseInfo') {
      if (typeof val === 'object') return val.name || val.id || 'Kho hàng';
      if (typeof val === 'string' && val.startsWith('{')) {
        try {
          const parsed = JSON.parse(val);
          return parsed.name || parsed.id || 'Kho hàng';
        } catch { /* ignore */ }
      }
      return String(val);
    }
    if (field === 'appointmentTime' || field === 'createdAt' || field === 'updatedAt') {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        return `${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString('vi-VN')}`;
      }
    }
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Chuẩn hóa toàn bộ log 1 lần
  const entries = useMemo(() => {
    return logs.map((log: any) => {
      const changes = parseChanges(log.changes)
        .map((c: any) => {
          const field = c.field || Object.keys(c)[0] || 'N/A';
          const from = formatValue(field, c.from ?? c[Object.keys(c)[0]] ?? EMPTY);
          const to = formatValue(field, c.to ?? EMPTY);
          const meta = FIELD_META[field] || { label: field, group: 'other' as FieldGroup, icon: Pencil };
          return { field, from, to, meta };
        })
        // warehouseId trùng nghĩa với warehouseInfo (đã hiển thị tên kho)
        .filter(c => c.field !== 'warehouseId' && c.from !== c.to);
      const date = new Date(log.createdAt);
      const isSystem = log.userId === 'system';
      return { log, changes, date, isSystem };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, stations, allKtvs]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      const groups = new Set(e.changes.map(ch => ch.meta.group));
      groups.forEach(g => { c[g] = (c[g] || 0) + 1; });
    }
    return c;
  }, [entries]);

  const visible = filter === 'all'
    ? entries
    : entries
        .map(e => ({ ...e, changes: e.changes.filter(ch => ch.meta.group === filter) }))
        .filter(e => e.changes.length > 0);

  // Nhóm theo ngày (log đã sắp xếp mới nhất trước)
  const grouped: { key: string; label: string; items: typeof visible }[] = [];
  for (const e of visible) {
    const k = dayKey(e.date);
    let g = grouped.find(x => x.key === k);
    if (!g) {
      g = { key: k, label: dayLabel(e.date), items: [] };
      grouped.push(g);
    }
    g.items.push(e);
  }

  const latestId = entries[0]?.log.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 overscroll-contain">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[680px] max-h-[88vh] flex flex-col overflow-hidden border border-gray-100 overscroll-contain">
        {/* Header */}
        <div className="px-6 pt-4 pb-3 border-b border-gray-200 bg-gray-50">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <History size={20} className="text-gray-500" />
                <span>Lịch sử thay đổi</span>
                {orderLabel && <span className="text-blue-600">{orderLabel}</span>}
              </h3>
              {!loading && (
                <p className="text-xs text-gray-500 mt-0.5 ml-7">
                  {entries.length} lần thao tác · mới nhất ở trên cùng
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 hover:bg-gray-100 rounded-full"
            >
              <XCircle size={22} />
            </button>
          </div>

          {!loading && entries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {FILTERS.filter(f => f.key === 'all' || counts[f.key]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    filter === f.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {f.label}
                  <span className={`ml-1.5 ${filter === f.key ? 'text-blue-100' : 'text-gray-400'}`}>{counts[f.key] || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5 overscroll-contain">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-gray-500 text-sm font-medium">Đang tải dữ liệu...</div>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-dashed p-6">
              Chưa có lịch sử thay đổi nào được ghi nhận cho ca này.
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Không có thay đổi nào thuộc nhóm này.</div>
          ) : (
            <div className="space-y-6">
              {grouped.map(group => (
                <div key={group.key}>
                  <div className="sticky top-0 z-10 -mx-1 px-1 pb-2 bg-white">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{group.label}</span>
                  </div>

                  <ol className="relative border-l-2 border-gray-100 ml-[72px]">
                    {group.items.map(({ log, changes, date, isSystem }) => {
                      const action = ACTION_META[log.action] || {
                        label: log.action, icon: Pencil, dot: 'bg-gray-400', badge: 'bg-gray-50 text-gray-700 border-gray-200'
                      };
                      const ActionIcon = isSystem ? Bot : action.icon;
                      const isLatest = log.id === latestId;

                      return (
                        <li key={log.id} className="relative pl-6 pb-5 last:pb-0">
                          {/* Giờ bên trái trục */}
                          <div className="absolute -left-[72px] top-0.5 w-[50px] text-right whitespace-nowrap tabular-nums">
                            <div className="text-[13px] font-bold text-gray-800 leading-tight">
                              {String(date.getHours()).padStart(2, '0')}:{String(date.getMinutes()).padStart(2, '0')}
                            </div>
                            <div className="text-[10px] text-gray-400">:{String(date.getSeconds()).padStart(2, '0')} giây</div>
                          </div>

                          {/* Chấm trên trục */}
                          <span
                            className={`absolute -left-[13px] top-0 w-6 h-6 rounded-full ring-4 ring-white flex items-center justify-center text-white ${
                              isSystem ? 'bg-slate-500' : action.dot
                            }`}
                          >
                            <ActionIcon size={12} />
                          </span>

                          {/* Nội dung */}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2" title={`${fmtTime(date)} ${date.toLocaleDateString('vi-VN')}`}>
                            <span className="font-semibold text-gray-900 text-[13px]">{log.userName}</span>
                            {isSystem && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                Tự động
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${action.badge}`}>
                              {action.label}
                            </span>
                            {isLatest && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">MỚI NHẤT</span>
                            )}
                            <span className="text-[11px] text-gray-400 ml-auto">{relativeTime(date)}</span>
                          </div>

                          {changes.length === 0 ? (
                            <div className="text-[12px] text-gray-400 italic flex items-center gap-1.5">
                              <Minus size={12} /> Lưu lại nhưng không thay đổi giá trị nào
                            </div>
                          ) : (
                            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                              {changes.map((c, i) => {
                                const FieldIcon = c.meta.icon;
                                const isLong = c.from.length > 40 || c.to.length > 40;
                                return (
                                  <div key={i} className="px-3 py-2.5 bg-white">
                                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 mb-1.5">
                                      <FieldIcon size={13} className="text-gray-400" />
                                      {c.meta.label}
                                    </div>
                                    <div className={`flex ${isLong ? 'flex-col' : 'flex-wrap items-center'} gap-1.5 text-[13px]`}>
                                      <span className="inline-flex items-baseline gap-1.5 text-gray-500 break-words">
                                        <span className="text-[10px] font-semibold uppercase text-gray-400">Cũ</span>
                                        <span className={c.from === EMPTY ? 'italic text-gray-400' : 'line-through decoration-red-300'}>{c.from}</span>
                                      </span>
                                      <ArrowRight size={14} className={`text-gray-300 shrink-0 ${isLong ? 'rotate-90 ml-3' : ''}`} />
                                      <span className="inline-flex items-baseline gap-1.5 break-words">
                                        <span className="text-[10px] font-semibold uppercase text-green-600">Mới</span>
                                        <span className={`font-semibold px-1.5 py-0.5 rounded ${c.to === EMPTY ? 'italic text-gray-400 bg-gray-50' : 'text-gray-900 bg-green-50'}`}>
                                          {c.to}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
