import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import { Compass, MapPin, Filter, X, ArrowDownWideNarrow } from 'lucide-react';

const GEO_URL = '/vn-provinces.json';

// ── Thang màu (dataviz reference palette) ──
// Số đơn: tuần tự 1 hue (xanh), nhạt → đậm
const SEQ_BLUE = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'];
// Đúng hẹn so với trung bình: phân kỳ đỏ ↔ xanh, giữa là xám trung tính
const DIV = { worse2: '#b8302f', worse1: '#ee9796', mid: '#d9d8d2', better1: '#86b6ef', better2: '#1c5cab' };
const NO_DATA = '#f4f3f0';
const STROKE = '#ffffff';
const MIN_SLA_SAMPLE = 10; // dưới ngưỡng này tỷ lệ đúng hẹn không đáng tin → không tô

const REGIONS = [
  { id: 'all', label: 'Toàn quốc', center: [106.3, 16.2] as [number, number], zoom: 1 },
  { id: 'north', label: 'Miền Bắc', center: [105.85, 21.2] as [number, number], zoom: 2.6 },
  { id: 'central', label: 'Miền Trung', center: [107.6, 14.8] as [number, number], zoom: 2.2 },
  { id: 'south', label: 'Miền Nam', center: [106.2, 10.6] as [number, number], zoom: 2.8 }
];

export interface ProvinceStat {
  name: string; total: number; onTime: number; late: number; open?: number; cancelled?: number; onTimeRate: number | null;
}

type Metric = 'orders' | 'onTime';
type SortKey = 'total' | 'onTimeRate' | 'late' | 'open';

/** Khóa so khớp tên tỉnh: bỏ tiền tố, bỏ dấu, bỏ ký tự không phải chữ/số ("Bà Rịa - Vũng Tàu" = "Bà Rịa-Vũng Tàu"). */
function provinceKey(name: string): string {
  return (name || '')
    .replace(/^(Tỉnh|Thành phố|TP\.?)\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Làm tròn lên số "đẹp" 1-2-5 × 10^k */
function niceCeil(v: number): number {
  if (v <= 1) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** Ngưỡng phân lớp từ phân vị của các giá trị > 0 (tối đa 5 lớp), làm tròn số đẹp. */
function countBreaks(values: number[]): number[] {
  const v = values.filter(x => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const qs = [0.2, 0.4, 0.6, 0.8].map(q => v[Math.min(v.length - 1, Math.floor(q * v.length))]);
  const out: number[] = [];
  for (const q of qs) {
    const n = niceCeil(q);
    if (n < v[v.length - 1] && !out.includes(n)) out.push(n);
  }
  return out;
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

export default function ProvinceMapTab({
  provinceStats,
  overallOnTimeRate,
  loading,
  onFilterProvince
}: {
  provinceStats: ProvinceStat[];
  overallOnTimeRate: number | null;
  loading: boolean;
  onFilterProvince: (name: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>('orders');
  const [region, setRegion] = useState('all');
  const [center, setCenter] = useState<[number, number]>(REGIONS[0].center);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('total');

  // Tách "chưa rõ tỉnh" khỏi dữ liệu bản đồ
  const { known, unknownTotal, byKey, grandTotal } = useMemo(() => {
    const known: ProvinceStat[] = [];
    let unknownTotal = 0;
    for (const p of provinceStats || []) {
      if (!p.name || p.name === 'Khác') unknownTotal += p.total;
      else known.push(p);
    }
    const byKey = new Map(known.map(p => [provinceKey(p.name), p]));
    const grandTotal = known.reduce((s, p) => s + p.total, 0) + unknownTotal;
    return { known, unknownTotal, byKey, grandTotal };
  }, [provinceStats]);

  const breaks = useMemo(() => countBreaks(known.map(p => p.total)), [known]);
  const countColors = useMemo(() => {
    const n = breaks.length + 1;
    // trải đều trên ramp 5 bậc để lớp đầu/cuối luôn là nhạt nhất/đậm nhất
    return Array.from({ length: n }, (_, i) => SEQ_BLUE[n === 1 ? 2 : Math.round((i * (SEQ_BLUE.length - 1)) / (n - 1))]);
  }, [breaks]);

  const avg = overallOnTimeRate;
  const slaSample = (p: ProvinceStat) => p.onTime + p.late;

  const colorFor = (p: ProvinceStat | undefined): string => {
    if (!p || p.total === 0) return NO_DATA;
    if (metric === 'orders') {
      const idx = breaks.findIndex(b => p.total <= b);
      return countColors[idx === -1 ? breaks.length : idx];
    }
    if (p.onTimeRate == null || slaSample(p) < MIN_SLA_SAMPLE || avg == null) return NO_DATA;
    const d = p.onTimeRate - avg;
    if (d <= -15) return DIV.worse2;
    if (d <= -5) return DIV.worse1;
    if (d < 5) return DIV.mid;
    if (d < 15) return DIV.better1;
    return DIV.better2;
  };

  const legend = useMemo(() => {
    if (metric === 'orders') {
      const items: { color: string; label: string }[] = [];
      let lo = 1;
      breaks.forEach((b, i) => {
        items.push({ color: countColors[i], label: lo === b ? `${fmt(b)}` : `${fmt(lo)}–${fmt(b)}` });
        lo = b + 1;
      });
      if (known.length > 0) items.push({ color: countColors[breaks.length], label: `> ${fmt(lo - 1)}` });
      return items;
    }
    if (avg == null) return [];
    const c = (v: number) => Math.min(100, Math.max(0, v));
    return [
      { color: DIV.worse2, label: `≤ ${c(avg - 15)}%` },
      { color: DIV.worse1, label: `${c(avg - 14)}–${c(avg - 5)}%` },
      { color: DIV.mid, label: `${c(avg - 4)}–${c(avg + 4)}% (≈ TB)` },
      { color: DIV.better1, label: `${c(avg + 5)}–${c(avg + 14)}%` },
      { color: DIV.better2, label: `≥ ${c(avg + 15)}%` }
    ].filter(l => !l.label.startsWith('≤ 0%') && !l.label.startsWith('≥ 100%'));
  }, [metric, breaks, countColors, known.length, avg]);

  // Nhãn trực tiếp trên bản đồ: 6 tỉnh nhiều đơn nhất
  const labelKeys = useMemo(
    () => new Set([...known].sort((a, b) => b.total - a.total).slice(0, 6).map(p => provinceKey(p.name))),
    [known]
  );

  const sorted = useMemo(() => {
    const arr = [...known];
    const val = (p: ProvinceStat) => {
      if (sortKey === 'onTimeRate') return slaSample(p) >= MIN_SLA_SAMPLE && p.onTimeRate != null ? p.onTimeRate : -1;
      if (sortKey === 'late') return p.late;
      if (sortKey === 'open') return p.open ?? 0;
      return p.total;
    };
    return arr.sort((a, b) => val(b) - val(a) || b.total - a.total);
  }, [known, sortKey]);
  const maxTotal = Math.max(1, ...known.map(p => p.total));

  const [centroids, setCentroids] = useState<Map<string, { c: [number, number]; name: string }>>(new Map());

  const focusKey = hovered || selected;
  const focus = focusKey ? byKey.get(focusKey) : undefined;
  const focusName = focus?.name || (focusKey ? centroids.get(focusKey)?.name : undefined);

  const goRegion = (id: string) => {
    const r = REGIONS.find(x => x.id === id) || REGIONS[0];
    setRegion(r.id);
    setCenter(r.center);
    setZoom(r.zoom);
  };

  const selectProvince = (key: string | null) => {
    if (!key || key === selected) {
      setSelected(null);
      return;
    }
    setSelected(key);
    const c = centroids.get(key)?.c;
    if (c) {
      setCenter(c);
      setZoom(z => Math.max(z, 3));
      setRegion('');
    }
  };

  if (loading && provinceStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-500 text-xs">Đang tải dữ liệu khu vực...</p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in ${loading ? 'opacity-60' : ''}`}>
      {/* ── BẢN ĐỒ ── */}
      <div className="xl:col-span-7 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-base text-gray-800 flex items-center gap-2"><MapPin size={16} className="text-[#1B3A6B]" /> Bản đồ theo Tỉnh/Thành</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Đơn dịch vụ (không gồm eCom) tạo trong kỳ lọc · {fmt(known.length)} tỉnh có đơn
              {unknownTotal > 0 && <> · {fmt(unknownTotal)} đơn chưa rõ tỉnh</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs" role="tablist" aria-label="Chỉ số tô màu">
              {([['orders', 'Số đơn'], ['onTime', 'Đúng hẹn so với TB']] as [Metric, string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={metric === k} onClick={() => setMetric(k)}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${metric === k ? 'bg-[#1B3A6B] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              {REGIONS.map(r => (
                <button key={r.id} type="button" onClick={() => goRegion(r.id)}
                  className={`px-2 py-1 rounded-md font-semibold transition-all ${region === r.id ? 'bg-white text-[#1B3A6B] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative flex-1 min-h-[520px] rounded-xl border border-slate-200 bg-[#fcfcfb] overflow-hidden">
          <ComposableMap projection="geoMercator" projectionConfig={{ scale: 2200, center: [106.3, 16.2] }} style={{ width: '100%', height: '100%' }}>
            <ZoomableGroup center={center} zoom={zoom} minZoom={0.9} maxZoom={8}
              onMoveEnd={({ coordinates, zoom: z }) => { setCenter(coordinates as [number, number]); setZoom(z); }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) => {
                  // Lưu tâm từng tỉnh một lần (để zoom khi chọn từ bảng)
                  if (centroids.size === 0 && geographies.length > 0) {
                    const m = new Map<string, { c: [number, number]; name: string }>();
                    geographies.forEach(g => m.set(provinceKey(g.properties.Ten || g.properties.Name), {
                      c: geoCentroid(g) as [number, number],
                      name: String(g.properties.Ten || g.properties.Name).replace(/^(Tỉnh|Thành phố)\s+/, '')
                    }));
                    queueMicrotask(() => setCentroids(m));
                  }
                  const paths = geographies.map(geo => {
                    const key = provinceKey(geo.properties.Ten || geo.properties.Name);
                    const p = byKey.get(key);
                    const isSel = selected === key;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={colorFor(p)}
                        stroke={isSel ? '#0b0b0b' : STROKE}
                        strokeWidth={isSel ? 1.6 / zoom : 0.6 / zoom}
                        onMouseEnter={() => setHovered(key)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => selectProvince(key)}
                        style={{
                          default: { outline: 'none' },
                          hover: { outline: 'none', cursor: 'pointer', filter: 'brightness(0.92)', stroke: '#0b0b0b', strokeWidth: 1.2 / zoom },
                          pressed: { outline: 'none' }
                        }}
                      />
                    );
                  });
                  const labels = geographies
                    .filter(geo => labelKeys.has(provinceKey(geo.properties.Ten || geo.properties.Name)))
                    .map(geo => {
                      const key = provinceKey(geo.properties.Ten || geo.properties.Name);
                      const p = byKey.get(key);
                      if (!p) return null;
                      const text = metric === 'orders'
                        ? fmt(p.total)
                        : (p.onTimeRate != null && slaSample(p) >= MIN_SLA_SAMPLE ? `${p.onTimeRate}%` : '—');
                      return (
                        <Marker key={`lbl-${geo.rsmKey}`} coordinates={geoCentroid(geo) as [number, number]}>
                          <text textAnchor="middle" y={4 / zoom} fontSize={11 / zoom} fontWeight={700} fill="#0b0b0b"
                            stroke="#ffffff" strokeWidth={3 / zoom} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                            {text}
                          </text>
                        </Marker>
                      );
                    });
                  return <>{paths}{labels}</>;
                }}
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>

          {/* Thẻ thông tin tỉnh đang trỏ / đã chọn */}
          {focusKey && (
            <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg p-3 text-xs w-[220px] z-10">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm text-gray-900">{focusName || '—'}</div>
                {selected && !hovered && (
                  <button type="button" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700" aria-label="Bỏ chọn"><X size={14} /></button>
                )}
              </div>
              {focus ? (
                <dl className="mt-1.5 grid grid-cols-2 gap-y-1 text-gray-600">
                  <dt>Số đơn</dt><dd className="text-right font-semibold text-gray-900 tabular-nums">{fmt(focus.total)}</dd>
                  <dt>Tỷ trọng</dt><dd className="text-right tabular-nums">{grandTotal > 0 ? ((focus.total / grandTotal) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : 0}%</dd>
                  <dt>Đúng hẹn</dt>
                  <dd className="text-right tabular-nums">
                    {focus.onTimeRate != null && slaSample(focus) >= MIN_SLA_SAMPLE
                      ? <span className="font-semibold text-gray-900">{focus.onTimeRate}%</span>
                      : <span className="text-gray-400" title={`Cần ≥ ${MIN_SLA_SAMPLE} ca đã đến hạn`}>ít dữ liệu</span>}
                  </dd>
                  <dt>Đúng / trễ</dt><dd className="text-right tabular-nums">{fmt(focus.onTime)} / {fmt(focus.late)}</dd>
                  <dt>Đang mở</dt><dd className="text-right tabular-nums">{fmt(focus.open ?? 0)}</dd>
                  <dt>Hủy</dt><dd className="text-right tabular-nums">{fmt(focus.cancelled ?? 0)}</dd>
                </dl>
              ) : (
                <p className="text-gray-500 mt-1">Không có đơn dịch vụ trong kỳ lọc.</p>
              )}
              {selected && !hovered && focus && (
                <button type="button" onClick={() => onFilterProvince(focus.name)}
                  className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-[#1B3A6B] border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5">
                  <Filter size={12} /> Lọc toàn dashboard theo tỉnh này
                </button>
              )}
            </div>
          )}

          {/* Chú thích — sinh từ đúng các ngưỡng đang dùng để tô màu */}
          <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-xl border border-slate-200 shadow-sm text-[11px] z-10 max-w-[calc(100%-140px)]">
            <div className="font-semibold text-slate-700 mb-1">
              {metric === 'orders' ? 'Số đơn' : `Đúng hẹn so với TB toàn quốc${avg != null ? ` (${avg}%)` : ''}`}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {legend.map(l => (
                <span key={l.label} className="flex items-center gap-1 text-slate-600">
                  <span className="w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: l.color }} />{l.label}
                </span>
              ))}
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: NO_DATA }} />
                {metric === 'orders' ? 'Không có đơn' : `Không có / < ${MIN_SLA_SAMPLE} ca`}
              </span>
            </div>
          </div>

          <button type="button" onClick={() => { goRegion('all'); setSelected(null); }}
            className="absolute bottom-3 right-3 text-[11px] text-slate-600 bg-white/95 hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm flex items-center gap-1 font-medium z-10">
            <Compass size={13} /> Toàn quốc
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Kéo để di chuyển, cuộn để phóng to. Bấm vào tỉnh để xem chi tiết. Tỉnh theo địa chỉ khách hàng (hoặc địa chỉ giao hàng), ranh giới 63 tỉnh cũ.
          Đúng hẹn không tính đơn Giao hàng.
        </p>
      </div>

      {/* ── BẢNG XẾP HẠNG ── */}
      <div className="xl:col-span-5 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Xếp hạng Tỉnh/Thành</h3>
            <p className="text-[11px] text-gray-500">Bấm tiêu đề cột để sắp xếp · bấm dòng để định vị trên bản đồ</p>
          </div>
          <ArrowDownWideNarrow size={16} className="text-gray-400" aria-hidden />
        </div>
        <div className="overflow-y-auto max-h-[640px] custom-scrollbar">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] text-gray-600 sticky top-0 z-[1]">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Tỉnh / Thành</th>
                {([['total', 'Số đơn'], ['onTimeRate', 'Đúng hẹn'], ['late', 'Trễ'], ['open', 'Mở']] as [SortKey, string][]).map(([k, l]) => (
                  <th key={k} className="text-right font-semibold px-2 py-2">
                    <button type="button" onClick={() => setSortKey(k)} className={`hover:text-gray-900 ${sortKey === k ? 'text-[#1B3A6B] underline underline-offset-2' : ''}`}>
                      {l}{sortKey === k ? ' ↓' : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((p, i) => {
                const key = provinceKey(p.name);
                const isSel = selected === key;
                const reliable = p.onTimeRate != null && slaSample(p) >= MIN_SLA_SAMPLE;
                return (
                  <tr key={p.name} onClick={() => selectProvince(key)} onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}
                    className={`cursor-pointer ${isSel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-right text-[10px] text-gray-400 tabular-nums">{i + 1}</span>
                        <span className="font-medium text-gray-800">{p.name}</span>
                      </div>
                      <div className="ml-7 mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(p.total / maxTotal) * 100}%`, backgroundColor: '#2a78d6' }} />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">{fmt(p.total)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {reliable
                        ? <span className={avg != null && p.onTimeRate! <= avg - 15 ? 'text-rose-700 font-semibold' : 'text-gray-800'}>{p.onTimeRate}%</span>
                        : <span className="text-gray-300" title={`Cần ≥ ${MIN_SLA_SAMPLE} ca đã đến hạn`}>—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{fmt(p.late)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{fmt(p.open ?? 0)}</td>
                  </tr>
                );
              })}
              {unknownTotal > 0 && (
                <tr className="text-gray-400 italic">
                  <td className="px-3 py-1.5 pl-10">Chưa rõ tỉnh</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(unknownTotal)}</td>
                  <td colSpan={3}></td>
                </tr>
              )}
              {sorted.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">Không có đơn trong kỳ lọc</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-500 flex justify-between">
          <span>Tổng: <b className="text-gray-800">{fmt(grandTotal)}</b> đơn</span>
          <span>Đúng hẹn TB: <b className="text-gray-800">{avg == null ? '—' : `${avg}%`}</b></span>
        </div>
      </div>
    </div>
  );
}
