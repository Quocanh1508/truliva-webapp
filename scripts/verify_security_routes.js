// Verify (chỉ đọc): route debug cần đăng nhập + ADMIN, /serials/export theo quyền SERIAL_VIEW.
// Chạy trên VPS trong thư mục dự án: node scripts/verify_security_routes.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const prisma = require('../dist/config/database').default;
const { checkDynamicPermission } = require('../dist/middleware/authSession');

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;
let fail = 0;
const check = async (label, url, token, expect) => {
  const r = await fetch(BASE + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  await r.body?.cancel();
  const ok = expect.includes(r.status);
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label} ${url}: ${r.status} (mong đợi ${expect.join('/')})`);
};
const sign = (u) => jwt.sign({ id: u.id, role: u.role, group: u.group }, process.env.JWT_SECRET, { expiresIn: '5m' });

(async () => {
  console.log('DB:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0], '| NODE_ENV', process.env.NODE_ENV);
  // Không token: phải bị chặn trước khi chạy handler (kể cả sync-products)
  for (const p of ['/webhooks/test-notes', '/webhooks/test-status', '/webhooks/check-nga', '/webhooks/sync-products', '/api/dev/check-nga', '/api/serials/export']) {
    await check('không token', p, null, [401]);
  }
  // Webhook thật vẫn mở, không bị authenticate chặn: Facebook sai verify token → 403 (không phải 401)
  await check('facebook sai token', '/webhooks/facebook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1', null, [403]);

  const ktv = await prisma.user.findFirst({ where: { role: 'KTV', isActive: true }, select: { id: true, role: true, group: true } });
  if (ktv) {
    const allowed = await checkDynamicPermission(ktv.role, 'SERIAL_VIEW', ktv.group, ktv.id);
    await check(`KTV (SERIAL_VIEW=${allowed})`, '/api/serials/export', sign(ktv), [allowed ? 200 : 403]);
    await check('KTV', '/webhooks/test-status', sign(ktv), [403]);
    await check('KTV', '/api/dev/check-nga', sign(ktv), [403]);
  }
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, group: true } });
  await check('ADMIN', '/api/serials/export', sign(admin), [200]);

  await prisma.$disconnect();
  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
