#!/usr/bin/env node
/**
 * Kiểm tra "Lịch sử dịch vụ cũ" (import ẩn) qua API thật trên VPS. CHỈ ĐỌC, chạy được trên production.
 *   node scripts/verify_legacy_history_api.js
 * - Lấy vài bản ghi mẫu trong legacy_service_histories, tra cứu theo SĐT / serial / mã đơn cũ
 *   qua GET /api/hotlines/search-customer, kiểm tra key JSON mà webapp (HotlineManage mục 3) dùng.
 * - Lời gọi gợi ý SĐT (?phone=) KHÔNG được trả dữ liệu cũ.
 * - Dữ liệu cũ không lọt vào bảng orders.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/database').default;

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}/api/hotlines`;
let failures = 0;
function check(cond, label) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

const KEYS = ['id', 'legacyOrderCode', 'customerName', 'customerPhone', 'address', 'provinceName', 'status', 'completedAt',
  'workType', 'serviceType', 'products', 'moneyToCollect', 'mainStation', 'techStation', 'ktvName', 'appointmentTime',
  'requestedAt', 'note', 'serialNumber', 'parts'];

async function main() {
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  console.log(`DB: ${dbName} · API: ${BASE}`);

  const total = await prisma.legacyServiceHistory.count();
  check(total > 0, `legacy_service_histories có dữ liệu (${total} bản ghi)`);
  const badPhone = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM legacy_service_histories WHERE customer_phone IS NOT NULL AND customer_phone !~ '^0[0-9]{9}$'`;
  check(badPhone[0].n === 0, `mọi SĐT chính đúng chuẩn 10 số (${badPhone[0].n} sai)`);
  if (!total) return;

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, group: true } });
  if (!admin) throw new Error('Không tìm thấy tài khoản ADMIN đang hoạt động');
  const tok = jwt.sign({ id: admin.id, role: admin.role, group: admin.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const api = async (qs) => {
    const t0 = Date.now();
    const r = await fetch(`${BASE}/search-customer?${qs}`, { headers: { Authorization: `Bearer ${tok}` } });
    return { status: r.status, body: await r.json().catch(() => null), ms: Date.now() - t0 };
  };

  // 1. Theo SĐT
  const withPhone = await prisma.legacyServiceHistory.findFirst({ where: { customerPhone: { not: null } }, orderBy: { completedAt: 'desc' } });
  const byPhone = await api(`q=${withPhone.customerPhone}`);
  const list = byPhone.body?.legacyServiceHistory;
  check(byPhone.status === 200 && Array.isArray(list), `q=<SĐT> → 200, legacyServiceHistory[] (${list?.length ?? '?'} dòng, ${byPhone.ms}ms)`);
  check(list?.some(h => h.id === withPhone.id), '  có bản ghi mẫu');
  if (list?.[0]) for (const k of KEYS) check(k in list[0], `  có key "${k}"`);
  check(list?.every((h, i) => i === 0 || !h.completedAt || !list[i - 1].completedAt || h.completedAt <= list[i - 1].completedAt), '  sắp xếp ngày hoàn thành mới → cũ');
  check(Array.isArray(byPhone.body?.serviceOrders), '  vẫn trả serviceOrders[] như cũ');

  // 2. Gợi ý SĐT (?phone=) không trả dữ liệu cũ
  const sugg = await api(`phone=${withPhone.customerPhone}`);
  check(sugg.status === 200 && !(sugg.body?.legacyServiceHistory?.length), '?phone= (gợi ý form) → không có dữ liệu cũ');

  // 3. Theo serial
  const withSerial = await prisma.legacyServiceHistory.findFirst({ where: { serialNumber: { not: null } }, orderBy: { completedAt: 'desc' } });
  if (withSerial) {
    const r = await api(`q=${encodeURIComponent(withSerial.serialNumber.split(/[\s,;]+/)[0])}`);
    check(r.body?.legacyServiceHistory?.some(h => h.id === withSerial.id), `q=<serial> → có bản ghi mẫu (${r.ms}ms)`);
  }

  // 4. Theo mã đơn cũ
  const withCode = await prisma.legacyServiceHistory.findFirst({ where: { legacyOrderCode: { not: null } } });
  if (withCode) {
    const r = await api(`q=${encodeURIComponent(withCode.legacyOrderCode)}`);
    check(r.body?.legacyServiceHistory?.some(h => h.legacyOrderCode === withCode.legacyOrderCode), `q=<mã đơn cũ> → có kết quả (${r.ms}ms)`);
  }

  // 5. Theo tên (đo thời gian, ILIKE trên toàn bảng)
  const byName = await api(`q=${encodeURIComponent('Nguyễn')}`);
  check(byName.status === 200, `q=Nguyễn → 200 (${byName.body?.legacyServiceHistory?.length} dòng cũ, ${byName.ms}ms)`);

  // 6. User KHÔNG có quyền HOTLINE_SEARCH_CUSTOMER tra theo SĐT (nhánh được miễn quyền) → không thấy dữ liệu cũ
  const { checkDynamicPermission } = require('../src/middleware/authSession');
  const candidates = await prisma.user.findMany({ where: { isActive: true, role: { notIn: ['ADMIN', 'DEV'] } }, select: { id: true, role: true, group: true }, take: 200 });
  let noPerm = null;
  for (const u of candidates) {
    if (!(await checkDynamicPermission(u.role, 'HOTLINE_SEARCH_CUSTOMER', u.group, u.id))) { noPerm = u; break; }
  }
  if (noPerm) {
    const t2 = jwt.sign({ id: noPerm.id, role: noPerm.role, group: noPerm.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const r = await fetch(`${BASE}/search-customer?q=${withPhone.customerPhone}`, { headers: { Authorization: `Bearer ${t2}` } });
    const b = await r.json().catch(() => null);
    check(r.status !== 200 || !(b?.legacyServiceHistory?.length), `user không có quyền (${noPerm.role}) tra SĐT → không thấy dữ liệu cũ (HTTP ${r.status})`);
  } else {
    console.log('   (không tìm thấy user nào thiếu quyền HOTLINE_SEARCH_CUSTOMER để test)');
  }

  // 7. Tài khoản khách hàng (group CUSTOMER) bị chặn 403 ở tra cứu và danh sách phiếu Hotline
  const cust = await prisma.user.findFirst({ where: { isActive: true, group: 'CUSTOMER' }, select: { id: true, role: true, group: true } });
  if (cust) {
    const t3 = jwt.sign({ id: cust.id, role: cust.role, group: cust.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
    for (const p of [`/search-customer?q=${withPhone.customerPhone}`, '/']) {
      const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${t3}` } });
      check(r.status === 403, `tài khoản CUSTOMER gọi ${p.split('?')[0]} → 403 (HTTP ${r.status})`);
    }
  } else {
    console.log('   (không có tài khoản group CUSTOMER đang hoạt động để test chặn 403)');
  }

  // 8. Không lọt vào orders
  const leaked = await prisma.order.count({ where: { note: { contains: 'Ghi chú KTV:' } } });
  console.log(`   (orders có "Ghi chú KTV:" trong note: ${leaked}, kỳ vọng 0 nếu không ai nhập tay)`);
}

main()
  .catch(e => { console.error('❌', e.message); failures++; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures ? `\n❌ ${failures} lỗi` : '\n✅ Tất cả OK');
    process.exit(failures ? 1 : 0);
  });
