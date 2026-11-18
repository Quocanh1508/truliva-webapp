import { useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CalendarDays, ClipboardCheck, Inbox, UserX, Info,
  ArrowUpRight, ArrowDownRight, Minus, Database
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  CartesianGrid, LineChart, Line
} from 'recharts';

// ── Kiểu dữ liệu trả về từ GET /api/dashboard/overview ──
interface Period { start: string; end: string }
interface Kpis {
  createdAll: number; ecomCreated: number; created: number; completed: number; cancelled: number;
  returned: number; open: number; cancelRate: number | null; onTime: number; late: number;
  onTimeRate: number | null; leadTimeP50: number | null; leadTimeP80: number | null; leadTimeSample: number;
  slaOrders: number; rescheduled: number; rescheduleRate: number | null;
  deliveryCreated: number; deliveryCompleted: number; revenue: number; grossSales: number; completedAll: number;
}
interface AttentionItem {
  id: string; pancakeOrderId: number | null; customerName: string; customerPhone: string; workType: string;
  adminStatus: string; ktvName: string | null; stationName: string; appointmentDate: string | null;
  ageDays: number; delayDays: number; rescheduleCount: number; reasons: string[];
}
interface TrendPoint {
  month: string; created: number; completed: number; cancelled: number; returned: number; open: number;
  onTimeRate: number | null; leadTimeP50: number | null; leadTimeP80: number | null; rescheduleRate: number | null;
  revenue: number; isPartial: boolean; isLegacy: boolean;
}
interface WorkTypeRow {
  name: string; created: number; completed: number; cancelled: number; open: number; cancelRate: number | null;
  onTimeRate: number | null; leadTimeP50: number | null; leadTimeP80: number | null; rescheduleRate: number | null;
  excludedFromSla: boolean;
}
interface ChannelRow {
  name: string; isEcom: boolean; created: number; prevCreated: number; completed: number; cancelled: number;
  cancelRate: number | null; revenue: number; prevRevenue: number;
}
export interface OverviewData {
  generatedAt: string;
  today: string;
  period: { current: Period; previous: Period; previousToDate: Period | null; currentToDate: Period | null };
  action: {
    open: number; overdue: number; dueToday: number; dueTomorrow: number; noAppointment: number;
    unassignedKtv: number; unassignedStation: number; reportedNotClosed: number;
    aging: { key: string; label: string; assigned: number; unassigned: number }[];
    attentionTotal: number; attentionList: AttentionItem[];
    ktvLoad: { id: string; name: string; open: number; overdue: number; dueToday: number }[];
  };
  kpis: { current: Kpis; previous: Kpis; previousToDate: Kpis | null };
  trend: TrendPoint[];
  breakdown: { byWorkType: WorkTypeRow[]; byChannel: ChannelRow[] };
  dataQuality: {
    total: number;
    items: { key: string; label: string; count: number; pct: number }[];
    includesLegacyData: boolean;
    systemGoLive: string;
  };
}

// Bảng màu (dataviz reference palette, slot 1–2 + trung tính cho "Hủy")
const C_SERIES_1 = '#2a78d6'; // xanh
const C_SERIES_2 = '#eb6834'; // cam
const C_NEUTRAL = '#a3a29c';  // xám – nhóm phụ / hủy
const GRID = '#eceae6';
const AXIS_TEXT = '#6b6a66';

// ── Định dạng ──
const fmtInt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('vi-VN'));
const fmtDec = (n: number | null | undefined, digits = 1) =>
  n == null ? '—' : n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const fmtMoney = (n: number) => {
  if (Math.abs(n) >= 1e9) return `${fmtDec(n / 1e9, 2)} tỷ`;
  if (Math.abs(n) >= 1e6) return `${fmtDec(n / 1e6, 1)} tr`;
  return `${fmtInt(n)} đ`;
};
const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};
const fmtDateShort = (s?: string | null) => {
  if (!s) return '—';
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
};
const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-');
  return `T${Number(m)}/${y.slice(2)}`;
};

type Tone = 'good' | 'bad' | 'neutral';
/** So sánh với kỳ trước. kind 'rate' → chênh lệch điểm %, còn lại → % thay đổi. */
function delta(curr: number | null, prev: number | null, kind: 'count' | 'rate' | 'days' | 'money', goodWhen: 'up' | 'down') {
  if (curr == null || prev == null) return { text: 'không có kỳ trước', tone: 'neutral' as Tone, dir: 0 };
  let diff: number;
  let text: string;
  if (kind === 'rate') {
    diff = Math.round((curr - prev) * 10) / 10;
    text = `${diff > 0 ? '+' : ''}${fmtDec(diff)} điểm`;
  } else if (kind === 'days') {
    diff = Math.round((curr - prev) * 10) / 10;
    text = `${diff > 0 ? '+' : ''}${fmtDec(diff)} ngày`;
  } else {
    if (prev === 0) return { text: curr > 0 ? 'kỳ trước = 0' : 'không đổi', tone: 'neutral' as Tone, dir: curr > 0 ? 1 : 0 };
    diff = Math.round(((curr - prev) / prev) * 1000) / 10;
    text = `${diff > 0 ? '+' : ''}${fmtDec(diff)}%`;
  }
  const dir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
  const tone: Tone = dir === 0 ? 'neutral' : (dir > 0) === (goodWhen === 'up') ? 'good' : 'bad';
  return { text, tone, dir };
}

const toneClass: Record<Tone, string> = {
  good: 'text-emerald-700',
  bad: 'text-rose-700',
  neutral: 'text-gray-500'
};

function DeltaBadge({ d, base }: { d: ReturnType<typeof delta>; base: string }) {
  const Icon = d.dir > 0 ? ArrowUpRight : d.dir < 0 ? ArrowDownRight : Minus;
  return (
    <div className={`flex items-center gap-1 text-[11px] font-semibold ${toneClass[d.tone]}`}>
      <Icon size={13} aria-hidden />
      <span>{d.text}</span>
      <span className="font-normal text-gray-400">vs {base}</span>
    </div>
  );
}

function ActionTile({
  label, value, hint, icon: Icon, emphasis = 'default', onClick
}: {
  label: string; value: number; hint?: string; icon: typeof Inbox;
  emphasis?: 'default' | 'critical' | 'warning'; onClick?: () => void;
}) {
  const ring = emphasis === 'critical' && value > 0
    ? 'border-rose-300 bg-rose-50/60'
    : emphasis === 'warning' && value > 0
      ? 'border-amber-300 bg-amber-50/50'
      : 'border-gray-200 bg-white';
  const iconColor = emphasis === 'critical' && value > 0 ? 'text-rose-600' : emphasis === 'warning' && value > 0 ? 'text-amber-600' : 'text-gray-400';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left p-4 rounded-xl border shadow-sm transition-all ${ring} ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-gray-600">
        <span>{label}</span>
        <Icon size={15} className={iconColor} aria-hidden />
      </div>
      <div className="text-2xl font-bold text-gray-900 mt-1.5 tabular-nums">{fmtInt(value)}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div>}
    </button>
  );
}

function KpiTile({ label, value, sub, d, base, title }: { label: string; value: string; sub?: string; d?: ReturnType<typeof delta>; base: string; title?: string }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-1" title={title}>
      <div className="text-[11px] font-semibold uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
      {d && <DeltaBadge d={d} base={base} />}
    </div>
  );
}

const REASON_FILTERS = [
  { key: 'all', label: 'Tất cả', match: () => true },
  { key: 'overdue', label: 'Quá hẹn', match: (r: string) => r.startsWith('Quá hẹn') },
  { key: 'noKtv', label: 'Chưa gán KTV', match: (r: string) => r === 'Chưa gán KTV' },
  { key: 'noAppt', label: 'Chưa có lịch', match: (r: string) => r === 'Chưa có lịch hẹn' },
  { key: 'today', label: 'Hẹn hôm nay', match: (r: string) => r === 'Hẹn hôm nay' },
  { key: 'reported', label: 'Đã báo cáo, chưa đóng', match: (r: string) => r.startsWith('Đã có báo cáo') }
];

export default function OverviewTab({
  data,
  loading,
  onOpenOrder,
  onOpenOrders
}: {
  data: OverviewData | null;
  loading: boolean;
  onOpenOrder: (pancakeOrderId: number) => void;
  onOpenOrders: (statuses: string[]) => void;
}) {
  const [reasonFilter, setReasonFilter] = useState('all');

  const attentionRows = useMemo(() => {
    if (!data) return [];
    const f = REASON_FILTERS.find(r => r.key === reasonFilter) || REASON_FILTERS[0];
    return data.action.attentionList.filter(a => a.reasons.some(f.match));
  }, [data, reasonFilter]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-500 text-xs">Đang tổng hợp dữ liệu vận hành...</p>
      </div>
    );
  }
  if (!data) return <div className="alert alert-error">Không tải được dữ liệu tổng quan</div>;

  const { action, kpis, period, trend, breakdown, dataQuality } = data;
  const cur = kpis.current;
  const base = kpis.previousToDate || kpis.previous;
  const basePeriod = period.previousToDate || period.previous;
  const baseLabel = `${fmtDateShort(basePeriod.start)}–${fmtDateShort(basePeriod.end)}`;
  const updatedAt = new Date(data.generatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const trendChart = trend.map(t => ({ ...t, label: `${fmtMonth(t.month)}${t.isLegacy ? '*' : ''}${t.isPartial ? ' (đang chạy)' : ''}` }));
  const hasLegacyMonth = trend.some(t => t.isLegacy);

  return (
    <div className={`space-y-6 animate-fade-in ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* ═════ TẦNG 1: VIỆC CẦN XỬ LÝ ═════ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-bold text-base text-[#1B3A6B]">Việc cần xử lý ngay</h3>
            <p className="text-xs text-gray-500">
              Đơn dịch vụ đang mở (không gồm eCom) tại thời điểm hiện tại · cập nhật {updatedAt} · <b>không phụ thuộc khoảng ngày</b>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ActionTile label="Đang mở" value={action.open} icon={Inbox}
            hint={`${action.noAppointment} chưa có lịch · ${action.unassignedStation} chưa phân trạm`}
            onClick={() => onOpenOrders(['chờ xử lý', 'đang thực hiện'])} />
          <ActionTile label="Quá hẹn" value={action.overdue} icon={AlertTriangle} emphasis="critical"
            hint="Chưa có báo cáo, đã qua ngày hẹn" onClick={() => setReasonFilter('overdue')} />
          <ActionTile label="Hẹn hôm nay" value={action.dueToday} icon={CalendarClock}
            onClick={() => setReasonFilter('today')} />
          <ActionTile label="Hẹn ngày mai" value={action.dueTomorrow} icon={CalendarDays} />
          <ActionTile label="Chưa gán KTV" value={action.unassignedKtv} icon={UserX} emphasis="warning"
            onClick={() => setReasonFilter('noKtv')} />
          <ActionTile label="Đã báo cáo, chưa đóng đơn" value={action.reportedNotClosed} icon={ClipboardCheck} emphasis="warning"
            hint="KTV đã nộp nghiệm thu, cần chuyển Hoàn thành" onClick={() => setReasonFilter('reported')} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Tuổi tồn đọng */}
          <div className="lg:col-span-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-semibold text-sm text-gray-800">Tuổi đơn đang mở</h4>
            <p className="text-[11px] text-gray-500 mb-2">Số ngày kể từ lúc tạo đơn · tách theo đã/chưa gán KTV</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={action.aging} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} />
                  <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(v) => [`${v} đơn`]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="assigned" name="Đã gán KTV" stackId="a" fill={C_SERIES_1} stroke="#fff" strokeWidth={2} maxBarSize={48} />
                  <Bar dataKey="unassigned" name="Chưa gán KTV" stackId="a" fill={C_SERIES_2} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tải KTV */}
          <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <h4 className="font-semibold text-sm text-gray-800">Tải hiện tại theo KTV</h4>
            <p className="text-[11px] text-gray-500 mb-2">Đơn đang mở chưa có báo cáo nghiệm thu</p>
            <div className="overflow-y-auto max-h-[200px] custom-scrollbar">
              {action.ktvLoad.length === 0 ? (
                <div className="text-xs text-gray-400 py-6 text-center">Không có KTV nào đang giữ đơn mở</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-[11px] text-gray-500 sticky top-0 bg-white">
                    <tr className="border-b">
                      <th className="text-left font-medium py-1.5">KTV</th>
                      <th className="text-right font-medium">Đang mở</th>
                      <th className="text-right font-medium">Quá hẹn</th>
                      <th className="text-right font-medium">Hôm nay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {action.ktvLoad.map(k => (
                      <tr key={k.id}>
                        <td className="py-1.5 text-gray-800 font-medium">{k.name}</td>
                        <td className="text-right tabular-nums">{k.open}</td>
                        <td className={`text-right tabular-nums ${k.overdue > 0 ? 'text-rose-700 font-bold' : 'text-gray-400'}`}>{k.overdue}</td>
                        <td className="text-right tabular-nums text-gray-600">{k.dueToday}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Danh sách cần xử lý */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-sm text-gray-800">
              Đơn cần xử lý <span className="text-gray-400 font-normal">({attentionRows.length}{action.attentionTotal > action.attentionList.length ? ` / ${action.attentionTotal}, hiện 100 đơn đầu` : ''})</span>
            </h4>
            <div className="flex flex-wrap gap-1">
              {REASON_FILTERS.map(r => (
                <button key={r.key} type="button" onClick={() => setReasonFilter(r.key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${reasonFilter === r.key ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto max-h-[380px] custom-scrollbar">
            {attentionRows.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">Không có đơn nào trong nhóm này.</div>
            ) : (
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-600 text-[11px] uppercase sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Mã đơn</th>
                    <th className="px-3 py-2 text-left">Khách hàng</th>
                    <th className="px-3 py-2 text-left">Loại CV</th>
                    <th className="px-3 py-2 text-left">KTV</th>
                    <th className="px-3 py-2 text-left">Ngày hẹn</th>
                    <th className="px-3 py-2 text-right">Tuổi đơn</th>
                    <th className="px-3 py-2 text-right" title="Số lần dời sang ngày khác (không tính lần đặt lịch đầu thay lịch tự sinh)">Dời lịch</th>
                    <th className="px-3 py-2 text-left">Lý do</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {attentionRows.map(a => (
                    <tr key={a.id} className="hover:bg-blue-50/40">
                      <td className="px-3 py-2">
                        {a.pancakeOrderId != null ? (
                          <button type="button" className="font-bold text-blue-700 hover:underline" onClick={() => onOpenOrder(a.pancakeOrderId!)}>
                            #{Math.abs(a.pancakeOrderId)}
                          </button>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{a.customerName}</div>
                        <div className="text-[11px] text-gray-400">{a.customerPhone}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{a.workType}</td>
                      <td className="px-3 py-2 text-gray-700">{a.ktvName || <span className="text-amber-700 font-semibold">Chưa gán</span>}</td>
                      <td className="px-3 py-2 text-gray-700">{fmtDate(a.appointmentDate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{a.ageDays} ngày</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${a.rescheduleCount >= 2 ? 'text-rose-700 font-bold' : 'text-gray-600'}`}>{a.rescheduleCount}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {a.reasons.map(r => (
                            <span key={r} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${r.startsWith('Quá hẹn') ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                              {r.startsWith('Quá hẹn') && <AlertTriangle size={10} className="inline mr-0.5 -mt-0.5" aria-hidden />}
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* ═════ TẦNG 2: SỨC KHỎE KỲ NÀY ═════ */}
      <section className="space-y-3">
        <div>
          <h3 className="font-bold text-base text-[#1B3A6B]">Kết quả kỳ {fmtDate(period.current.start)} – {fmtDate(period.current.end)}</h3>
          <p className="text-xs text-gray-500">
            Tính trên đơn <b>tạo trong kỳ</b>. So sánh với {period.previousToDate
              ? <>cùng số ngày của kỳ trước (<b>{fmtDate(basePeriod.start)} – {fmtDate(basePeriod.end)}</b>) vì kỳ này đang chạy đến hôm nay</>
              : <>kỳ trước <b>{fmtDate(basePeriod.start)} – {fmtDate(basePeriod.end)}</b></>}.
            SLA & thời gian xử lý không gồm đơn eCom và đơn Giao hàng.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile label="Đơn dịch vụ mới" value={fmtInt(cur.created)} sub={`+ ${fmtInt(cur.ecomCreated)} đơn eCom`}
            d={delta(cur.created, base.created, 'count', 'up')} base={baseLabel} />
          <KpiTile label="Đã hoàn thành" value={fmtInt(cur.completed)}
            sub={`${fmtInt(cur.open)} còn mở · ${fmtInt(cur.returned)} hoàn/đổi`}
            d={delta(cur.completed, base.completed, 'count', 'up')} base={baseLabel} />
          <KpiTile label="Tỷ lệ hủy" value={cur.cancelRate == null ? '—' : `${fmtDec(cur.cancelRate)}%`} sub={`${fmtInt(cur.cancelled)} đơn hủy`}
            d={delta(cur.cancelRate, base.cancelRate, 'rate', 'down')} base={baseLabel} />
          <KpiTile label="Doanh thu thực thu" value={fmtMoney(cur.revenue)} sub={`${fmtInt(cur.completedAll)} đơn hoàn thành, mọi kênh`}
            d={delta(cur.revenue, base.revenue, 'money', 'up')} base={baseLabel}
            title="Cùng công thức tab Doanh thu (Thực thu, toàn công ty)" />
          <KpiTile label="Thời gian xử lý (trung vị)" value={cur.leadTimeP50 == null ? '—' : `${fmtDec(cur.leadTimeP50)} ngày`}
            sub={`80% đơn xong trong ${cur.leadTimeP80 == null ? '—' : `${fmtDec(cur.leadTimeP80)} ngày`} · n=${cur.leadTimeSample}`}
            d={delta(cur.leadTimeP50, base.leadTimeP50, 'days', 'down')} base={baseLabel}
            title="Từ lúc tạo đơn đến khi KTV nộp báo cáo nghiệm thu đầu tiên (không tính báo cáo bị từ chối)" />
          <KpiTile label="Đúng hẹn" value={cur.onTimeRate == null ? '—' : `${cur.onTimeRate}%`}
            sub={`${fmtInt(cur.onTime)} đúng · ${fmtInt(cur.late)} trễ (theo lịch hẹn cuối)`}
            d={delta(cur.onTimeRate, base.onTimeRate, 'rate', 'up')} base={baseLabel} />
          <KpiTile label="Tỷ lệ đơn bị dời lịch" value={cur.rescheduleRate == null ? '—' : `${fmtDec(cur.rescheduleRate)}%`}
            sub={`${fmtInt(cur.rescheduled)} / ${fmtInt(cur.slaOrders)} đơn dời sang ngày khác`}
            d={delta(cur.rescheduleRate, base.rescheduleRate, 'rate', 'down')} base={baseLabel}
            title="Đúng hẹn tính theo lịch cuối, nên cần đọc cùng tỷ lệ dời lịch" />
          <KpiTile label="Đơn giao hàng (vận chuyển)" value={fmtInt(cur.deliveryCreated)} sub={`${fmtInt(cur.deliveryCompleted)} đã hoàn thành · không tính SLA KTV`}
            d={delta(cur.deliveryCreated, base.deliveryCreated, 'count', 'up')} base={baseLabel} />
        </div>
      </section>

      {/* ═════ TẦNG 3: XU HƯỚNG 6 THÁNG ═════ */}
      <section className="space-y-3">
        <div>
          <h3 className="font-bold text-base text-[#1B3A6B]">Xu hướng 6 tháng</h3>
          <p className="text-xs text-gray-500">
            Theo tháng <b>tạo đơn</b>, đơn dịch vụ không gồm eCom.
            {hasLegacyMonth && <> <b>*</b> Tháng trước {fmtDate(dataQuality.systemGoLive)} là dữ liệu nhập lại (không loại CV, KTV, báo cáo), không so sánh được.</>}
          </p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-semibold text-sm text-gray-800">Kết cục đơn theo tháng tạo</h4>
            <p className="text-[11px] text-gray-500 mb-2">Hoàn thành / còn mở / hủy</p>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 10 }} interval={0} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} />
                  <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(v, n) => [`${v} đơn`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="completed" name="Hoàn thành" stackId="a" fill={C_SERIES_1} stroke="#fff" strokeWidth={2} maxBarSize={44} />
                  <Bar dataKey="open" name="Còn mở" stackId="a" fill={C_SERIES_2} stroke="#fff" strokeWidth={2} maxBarSize={44} />
                  <Bar dataKey="cancelled" name="Hủy" stackId="a" fill={C_NEUTRAL} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-semibold text-sm text-gray-800">Thời gian xử lý (ngày)</h4>
            <p className="text-[11px] text-gray-500 mb-2">Tạo đơn → báo cáo nghiệm thu · trung vị và mốc 80%</p>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChart} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 10 }} interval={0} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} />
                  <RechartsTooltip formatter={(v, n) => [v == null ? '—' : `${fmtDec(Number(v))} ngày`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="leadTimeP50" name="Trung vị" stroke={C_SERIES_1} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                  <Line type="monotone" dataKey="leadTimeP80" name="80% đơn" stroke={C_SERIES_2} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-semibold text-sm text-gray-800">Đúng hẹn & dời lịch (%)</h4>
            <p className="text-[11px] text-gray-500 mb-2">Đúng hẹn theo lịch cuối, đọc cùng tỷ lệ đơn bị dời</p>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChart} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 10 }} interval={0} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11 }} />
                  <RechartsTooltip formatter={(v, n) => [v == null ? '—' : `${fmtDec(Number(v))}%`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="onTimeRate" name="Đúng hẹn" stroke={C_SERIES_1} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                  <Line type="monotone" dataKey="rescheduleRate" name="Bị dời lịch" stroke={C_SERIES_2} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* ═════ PHÂN RÃ KỲ NÀY ═════ */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h4 className="font-semibold text-sm text-gray-800">Theo loại công việc</h4>
            <p className="text-[11px] text-gray-500">Đơn dịch vụ tạo trong kỳ (không eCom)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50 text-[11px] text-gray-600 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Loại CV</th>
                  <th className="px-3 py-2 text-right">Tạo</th>
                  <th className="px-3 py-2 text-right">Hoàn thành</th>
                  <th className="px-3 py-2 text-right">Còn mở</th>
                  <th className="px-3 py-2 text-right">Hủy</th>
                  <th className="px-3 py-2 text-right" title="Trung vị / mốc 80%">Xử lý (ngày)</th>
                  <th className="px-3 py-2 text-right">Đúng hẹn</th>
                  <th className="px-3 py-2 text-right">Dời lịch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {breakdown.byWorkType.map(w => (
                  <tr key={w.name}>
                    <td className="px-3 py-2 font-medium text-gray-800">{w.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(w.created)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(w.completed)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(w.open)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{w.cancelRate == null ? '—' : `${fmtDec(w.cancelRate)}%`}</td>
                    {w.excludedFromSla ? (
                      <td colSpan={3} className="px-3 py-2 text-right text-[11px] text-gray-400 italic">Đơn vị vận chuyển – không tính SLA</td>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtDec(w.leadTimeP50)} / {fmtDec(w.leadTimeP80)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.onTimeRate == null ? '—' : `${w.onTimeRate}%`}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.rescheduleRate == null ? '—' : `${fmtDec(w.rescheduleRate)}%`}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h4 className="font-semibold text-sm text-gray-800">Theo kênh bán (nguồn đơn)</h4>
            <p className="text-[11px] text-gray-500">Mọi kênh, gồm eCom · so với kỳ trước đầy đủ ({fmtDateShort(period.previous.start)}–{fmtDateShort(period.previous.end)})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50 text-[11px] text-gray-600 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Kênh</th>
                  <th className="px-3 py-2 text-right">Đơn tạo</th>
                  <th className="px-3 py-2 text-right">Kỳ trước</th>
                  <th className="px-3 py-2 text-right">Hủy</th>
                  <th className="px-3 py-2 text-right">Doanh thu</th>
                  <th className="px-3 py-2 text-right">Kỳ trước</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {breakdown.byChannel.map(c => (
                  <tr key={c.name}>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {c.name}
                      {c.isEcom && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">eCom</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(c.created)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtInt(c.prevCreated)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.cancelRate == null ? '—' : `${fmtDec(c.cancelRate)}%`}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(c.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtMoney(c.prevRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═════ CHẤT LƯỢNG DỮ LIỆU ═════ */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Database size={16} className="text-gray-500 mt-0.5" aria-hidden />
          <div>
            <h4 className="font-semibold text-sm text-gray-800">Chất lượng dữ liệu kỳ này</h4>
            <p className="text-[11px] text-gray-500">Trên {fmtInt(dataQuality.total)} đơn dịch vụ tạo trong kỳ. Tỷ lệ càng cao, các chỉ số phía trên càng kém tin cậy.</p>
          </div>
        </div>
        {dataQuality.includesLegacyData && (
          <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>Khoảng ngày (hoặc kỳ so sánh) có dữ liệu trước <b>{fmtDate(dataQuality.systemGoLive)}</b> — giai đoạn nhập lại, không có loại công việc, KTV và báo cáo nghiệm thu. Không nên dùng để so sánh hiệu suất.</span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {dataQuality.items.map(it => (
            <div key={it.key} className="p-3 rounded-lg border border-gray-100 bg-gray-50/60">
              <div className="text-[11px] text-gray-600 leading-snug min-h-[30px]">{it.label}</div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-lg font-bold text-gray-900 tabular-nums">{fmtDec(it.pct)}%</span>
                <span className="text-[11px] text-gray-500">{fmtInt(it.count)} đơn</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, it.pct)}%`, backgroundColor: it.pct >= 20 ? C_SERIES_2 : C_NEUTRAL }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
