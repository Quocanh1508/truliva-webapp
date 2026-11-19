// Verify (chỉ đọc): /api/hotlines/export trả 200/403 khớp với quyền HOTLINE_EXPORT_EXCEL của từng role.
// Chạy trên VPS trong thư mục dự án (sau khi build): node scripts/verify_hotline_export_perm.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const prisma = require('../dist/config/database').default;
const { checkDynamicPermission } = require('../dist/middleware/authSession');

const PORT = process.env.PORT || 3000;
const ROLES = ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'STAFF', 'KTV', 'SALER'];

(async () => {
  console.log('DB:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0], '| port', PORT);
  let fail = 0;
  for (const role of ROLES) {
    const u = await prisma.user.findFirst({ where: { role, isActive: true, NOT: { group: 'CUSTOMER' } }, select: { id: true, role: true, group: true } });
    if (!u) { console.log(`- ${role}: không có user, bỏ qua`); continue; }
    const expected = (await checkDynamicPermission(u.role, 'HOTLINE_EXPORT_EXCEL', u.group, u.id)) ? 200 : 403;
    const token = jwt.sign({ id: u.id, role: u.role, group: u.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const r = await fetch(`http://127.0.0.1:${PORT}/api/hotlines/export`, { headers: { Authorization: `Bearer ${token}` } });
    await r.body?.cancel();
    const ok = r.status === expected;
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${role}: nhận ${r.status}, mong đợi ${expected}`);
  }
  const anon = await fetch(`http://127.0.0.1:${PORT}/api/hotlines/export`);
  if (anon.status !== 401) fail++;
  console.log(`${anon.status === 401 ? '✓' : '✗'} không token: nhận ${anon.status}, mong đợi 401`);
  await prisma.$disconnect();
  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
