// Verify (chỉ đọc): token có `tv` lệch users.token_version bị từ chối, token đúng và token cũ chưa có `tv` vẫn dùng được.
// Chạy trên VPS trong thư mục dự án: node scripts/verify_token_revocation.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const prisma = require('../dist/config/database').default;

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}/api`;
let fail = 0;
const check = async (label, payload, expect) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
  const r = await fetch(`${BASE}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
  await r.body?.cancel();
  const ok = r.status === expect;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${r.status} (mong đợi ${expect})`);
};

(async () => {
  console.log('DB:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0]);
  const u = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, tokenVersion: true } });
  await check(`tv đúng (${u.tokenVersion})`, { id: u.id, role: u.role, tv: u.tokenVersion }, 200);
  await check('tv cũ hơn (đã thu hồi)', { id: u.id, role: u.role, tv: u.tokenVersion - 1 }, 401);
  await check('tv lớn hơn', { id: u.id, role: u.role, tv: u.tokenVersion + 1 }, 401);
  await check('không có tv (token trước bản vá)', { id: u.id, role: u.role }, u.tokenVersion === 0 ? 200 : 401);
  await prisma.$disconnect();
  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
