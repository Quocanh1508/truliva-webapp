// Chỉ đọc: kiểm tra tìm báo cáo theo mã đơn (#/M) chỉ trả đúng đơn đó
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const jwt = require('jsonwebtoken');
const prisma = require(path.resolve(process.cwd(), 'dist/config/database')).default;
(async () => {
  console.log('DB:', process.env.DATABASE_URL.split('/').pop().split('?')[0]);
  const u = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, group: true } });
  const H = { Authorization: 'Bearer ' + jwt.sign({ id: u.id, role: u.role, group: u.group }, process.env.JWT_SECRET, { expiresIn: '5m' }) };
  const B = `http://127.0.0.1:${process.env.PORT || 3000}/api/reports?limit=100&search=`;
  const neg = await prisma.serviceReport.findFirst({ where: { order: { pancakeOrderId: { lt: 0 } } }, select: { order: { select: { pancakeOrderId: true } } } });
  const pos = await prisma.serviceReport.findFirst({ where: { order: { pancakeOrderId: { gt: 0 } } }, orderBy: { createdAt: 'desc' }, select: { order: { select: { pancakeOrderId: true } } } });
  const has6706 = await prisma.serviceReport.count({ where: { order: { pancakeOrderId: 6706 } } });
  const ids = [has6706 ? 6706 : null, pos?.order?.pancakeOrderId, neg?.order?.pancakeOrderId].filter(v => v != null);
  let fail = 0;
  for (const id of ids) {
    const code = id < 0 ? `M${-id}` : `#${id}`;
    const exact = await (await fetch(B + encodeURIComponent(code), { headers: H })).json();
    const broad = await (await fetch(B + encodeURIComponent(String(Math.abs(id))), { headers: H })).json();
    const got = exact.reports.map(r => r.order?.pancakeOrderId);
    const ok = got.length > 0 && got.every(v => v === id);
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${code}: ${got.length} báo cáo [${[...new Set(got)].join(',')}] | số trần "${Math.abs(id)}": ${broad.reports.length} báo cáo [${[...new Set(broad.reports.map(r => r.order?.pancakeOrderId))].join(',')}]`);
  }
  console.log(fail ? 'FAIL' : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
