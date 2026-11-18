#!/usr/bin/env node
/**
 * Kiểm tra API Dashboard trực tiếp trên VPS (gọi http://127.0.0.1:<PORT>/api/dashboard/...).
 * CHỈ ĐỌC — an toàn cho production.
 *
 *   node scripts/verify_dashboard_api.js [startDate] [endDate]   (mặc định: đầu năm → cuối tháng hiện tại, giờ VN)
 *
 * Kiểm tra: key JSON frontend dùng, tính nhất quán giữa các con số (bản đồ/trạm theo bộ lọc,
 * mẫu số tỷ lệ đúng hẹn), và đối chiếu doanh thu đơn POS chuyển khoản trước với DB.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/database').default;

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}/api/dashboard`;

const vnToday = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const [Y, M] = vnToday.split('-').map(Number);
const START = process.argv[2] || `${Y}-01-01`;
const END = process.argv[3] || new Date(Date.UTC(Y, M, 0)).toISOString().slice(0, 10);
const MONTH_START = `${vnToday.slice(0, 7)}-01`;

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}
const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');

async function main() {
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  console.log(`DB: ${dbName} · API: ${BASE} · Kỳ: ${START} → ${END}`);

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, group: true } });
  if (!admin) throw new Error('Không tìm thấy tài khoản ADMIN đang hoạt động');
  const token = jwt.sign({ id: admin.id, role: admin.role, group: admin.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const api = async (p) => {
    const r = await fetch(BASE + p, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  // ── /stats ──
  const st = await api(`/stats?startDate=${START}&endDate=${END}`);
  check(st.status === 200, `GET /stats → ${st.status}`);
  const os = st.body?.orderStats || {};
  for (const k of ['stationStats', 'mapDensity', 'statusCounts', 'orderStats']) check(k in (st.body || {}), `  có key "${k}"`);
  const densitySum = sum(Object.values(st.body?.mapDensity || {}));
  const mainSum = sum((st.body?.stationStats || []).map(s => s.totalOrders));
  console.log(`     orderStats.total=${os.total} · Σ mapDensity=${densitySum} · Σ trạm chính=${mainSum}`);
  check(densitySum <= os.total, '  Σ mật độ bản đồ ≤ tổng đơn (cùng tập đơn đã lọc)');
  check(mainSum <= os.total, '  Σ tải trọng trạm chính ≤ tổng đơn');
  const stMonth = await api(`/stats?startDate=${MONTH_START}&endDate=${END}`);
  const densityMonth = sum(Object.values(stMonth.body?.mapDensity || {}));
  console.log(`     Tháng này: total=${stMonth.body?.orderStats?.total} · Σ mapDensity=${densityMonth}`);
  check(densityMonth <= densitySum, '  Bản đồ thay đổi theo khoảng ngày (tháng ≤ cả kỳ)');

  // ── /dispatch-analysis ──
  const da = await api(`/dispatch-analysis?startDate=${START}&endDate=${END}`);
  check(da.status === 200, `GET /dispatch-analysis → ${da.status}`);
  const s = da.body?.summary || {};
  for (const k of ['totalWithAppointments', 'totalOnTime', 'totalLate', 'totalEvaluated', 'totalNotDue', 'totalCancelled', 'totalCompletedNoReport', 'onTimeRate']) {
    check(k in s, `  summary có key "${k}"`);
  }
  console.log(`     ${JSON.stringify(s)}`);
  check(s.totalEvaluated === s.totalOnTime + s.totalLate, '  totalEvaluated = đúng + trễ');
  if (s.totalEvaluated > 0) check(s.onTimeRate === Math.round(s.totalOnTime / s.totalEvaluated * 100), '  onTimeRate = đúng / (đúng + trễ)');
  check((da.body?.provinceStats || []).every(p => 'onTimeRate' in p && 'open' in p && 'cancelled' in p), '  provinceStats[] có onTimeRate, open, cancelled');
  const ps = da.body?.provinceStats || [];
  check(sum(ps.map(p => p.onTime)) === s.totalOnTime && sum(ps.map(p => p.late)) === s.totalLate, '  Σ đúng/trễ theo tỉnh = summary (cùng loại trừ Giao hàng)');
  check(ps.every(p => p.open + p.cancelled <= p.total), '  mỗi tỉnh: mở + hủy ≤ tổng');
  check((da.body?.stationPerformanceStats || []).every(p => p.onTimeRate === null || (p.onTimeRate >= 0 && p.onTimeRate <= 100)), '  stationPerformanceStats onTimeRate ∈ [0,100] | null');
  const late = da.body?.lateOrders || [];
  check(late.every(o => o.id && 'pancakeOrderId' in o), `  lateOrders (${late.length}) có id + pancakeOrderId`);
  check(late.every(o => o.adminStatus !== 'hoàn thành'), '  lateOrders không chứa đơn hoàn thành');

  // ── /product-quality ──
  const pq = await api(`/product-quality?startDate=${START}&endDate=${END}`);
  check(pq.status === 200, `GET /product-quality → ${pq.status}`);
  for (const k of ['summary', 'cases', 'productIssues', 'provinceIssues', 'monthlyIssuesTrend', 'lifecycleList', 'durationDist', 'allProducts']) check(k in (pq.body || {}), `  có key "${k}"`);
  const groups = {};
  for (const m of pq.body?.monthlyIssuesTrend || []) for (const [g, n] of Object.entries(m.issues)) groups[g] = (groups[g] || 0) + n;
  console.log('     Phân nhóm sự cố:', JSON.stringify(groups));
  const rejected = await prisma.serviceReport.count({ where: { approvalStatus: 'REJECTED' } });
  console.log(`     (DB có ${rejected} báo cáo REJECTED — đã bị loại khỏi phân tích)`);

  // ── /revenue ──
  const rv = await api(`/revenue?startDate=${START}&endDate=${END}&revenueScope=all&metricType=moneyToCollect`);
  check(rv.status === 200, `GET /revenue → ${rv.status}`);
  const rs = rv.body?.summary || {};
  for (const k of ['totalRevenue', 'prevRevenue', 'percentChange', 'ordersCount', 'avgOrderValue']) check(k in rs, `  summary có key "${k}"`);
  check(rv.body?.periodInfo?.current?.start === START && rv.body?.periodInfo?.current?.end === END, `  periodInfo.current = ${START} → ${END}`);
  check((rv.body?.timeTrend || []).length === Math.round((Date.parse(END) - Date.parse(START)) / 864e5) + 1, `  timeTrend đủ ${rv.body?.timeTrend?.length} ngày`);
  console.log(`     Thực thu=${fmt(rs.totalRevenue)}đ · ${rs.ordersCount} đơn · kỳ trước ${rv.body?.periodInfo?.previous?.start}→${rv.body?.periodInfo?.previous?.end}`);

  // Đối chiếu độc lập: phần doanh thu từ đơn POS chuyển khoản trước (COD = 0) — trước bản sửa bị tính 0đ
  const from = new Date(`${START}T00:00:00.000+07:00`);
  const to = new Date(`${END}T23:59:59.999+07:00`);
  const prepaid = await prisma.order.aggregate({
    where: {
      adminStatus: 'hoàn thành',
      pancakeCreatedAt: { gte: from, lte: to },
      pancakeOrderId: { gt: 100 },
      NOT: { orderSource: 'unknown' },
      OR: [{ moneyToCollect: null }, { moneyToCollect: { lte: 0 } }]
    },
    _sum: { totalPrice: true },
    _count: { id: true }
  });
  console.log(`     Đơn POS chuyển khoản trước trong kỳ: ${prepaid._count.id} đơn · ${fmt(prepaid._sum.totalPrice || 0)}đ (trước đây bị tính 0đ)`);

  // ── /overview (Tổng quan vận hành, mặc định tháng hiện tại) ──
  const t0 = Date.now();
  const ov = await api('/overview');
  const ovMs = Date.now() - t0;
  check(ov.status === 200, `GET /overview → ${ov.status} (${ovMs} ms)`);
  const b = ov.body || {};
  for (const k of ['period', 'action', 'kpis', 'trend', 'breakdown', 'dataQuality']) check(k in b, `  có key "${k}"`);
  const a = b.action || {};
  for (const k of ['open', 'overdue', 'dueToday', 'dueTomorrow', 'noAppointment', 'unassignedKtv', 'unassignedStation', 'reportedNotClosed', 'aging', 'attentionList', 'ktvLoad']) {
    check(k in a, `  action có key "${k}"`);
  }
  console.log(`     action: mở=${a.open} quá hẹn=${a.overdue} hôm nay=${a.dueToday} mai=${a.dueTomorrow} chưa KTV=${a.unassignedKtv} đã BC chưa đóng=${a.reportedNotClosed} cần xử lý=${a.attentionTotal}`);
  const agingSum = sum((a.aging || []).map(x => x.assigned + x.unassigned));
  check(agingSum === a.open, `  Σ tuổi tồn đọng (${agingSum}) = số đơn mở (${a.open})`);
  check(a.overdue + a.dueToday + a.dueTomorrow + a.noAppointment + a.reportedNotClosed <= a.open, '  các nhóm con ≤ số đơn mở');
  check((a.attentionList || []).every(x => x.id && Array.isArray(x.reasons) && x.reasons.length > 0), '  attentionList: mỗi đơn có id + lý do');
  const kc = b.kpis?.current || {};
  for (const k of ['created', 'completed', 'cancelRate', 'onTimeRate', 'leadTimeP50', 'leadTimeP80', 'rescheduleRate', 'revenue', 'deliveryCreated']) check(k in kc, `  kpis.current có key "${k}"`);
  console.log(`     kỳ ${b.period?.current?.start}→${b.period?.current?.end} · so với ${JSON.stringify(b.period?.previousToDate || b.period?.previous)}`);
  console.log(`     current: ${JSON.stringify(kc)}`);
  check(kc.completed + kc.cancelled + kc.returned + kc.open <= kc.created, '  hoàn thành + hủy + hoàn/đổi + mở ≤ đơn tạo');
  check(b.trend?.length === 6, `  trend có 6 tháng (${(b.trend || []).map(t => t.month).join(', ')})`);
  check(sum((b.breakdown?.byWorkType || []).map(w => w.created)) === kc.created, '  Σ theo loại CV = đơn dịch vụ mới');
  check(sum((b.breakdown?.byChannel || []).map(c => c.created)) === kc.createdAll, '  Σ theo kênh = tổng đơn mọi kênh');
  // Doanh thu Tổng quan phải khớp tab Doanh thu cùng kỳ
  const rvMonth = await api(`/revenue?startDate=${b.period?.current?.start}&endDate=${b.period?.current?.end}&revenueScope=all&metricType=moneyToCollect`);
  console.log(`     doanh thu: overview=${fmt(kc.revenue)} · tab Doanh thu=${fmt(rvMonth.body?.summary?.totalRevenue || 0)}`);
  check(Math.abs((rvMonth.body?.summary?.totalRevenue || 0) - kc.revenue) <= Math.max(1, kc.revenue * 0.005), '  Doanh thu Tổng quan ≈ tab Doanh thu (lệch ≤ 0,5%)');
  console.log('     dataQuality:', JSON.stringify(b.dataQuality?.items?.map(i => `${i.key}=${i.pct}%`)));

  console.log(failures === 0 ? '\nTẤT CẢ KIỂM TRA ĐẠT' : `\n${failures} KIỂM TRA THẤT BẠI`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
