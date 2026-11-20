// Verify (chỉ đọc): secret webhook Pancake không còn chuỗi viết cứng, và các chốt chỉ bật khi NODE_ENV=production.
// Chạy trên VPS: node scripts/verify_prod_hardening.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const http = require('http');
const jwt = require('jsonwebtoken');
const prisma = require('../dist/config/database').default;

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const req = (p, headers = {}) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, headers: { Host: 'trulivaofficial.com', ...headers } }, res => {
    res.resume();
    res.on('end', () => resolve(res));
  });
  r.on('error', reject);
  r.end();
});

(async () => {
  console.log('DB:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0], '| NODE_ENV:', process.env.NODE_ENV, '| port:', PORT);
  let fail = 0;
  const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name} → ${got}`); };

  const valid = (process.env.PANCAKE_WEBHOOK_SECRET || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const s of ['pancake_webhook_prod_secret_9872', 'dev-secret-change-me-in-production']) {
    if (valid.includes(s)) { console.log(`! secret viết cứng "${s.slice(0, 8)}…" vẫn nằm trong .env (đang chờ đổi secret)`); continue; }
    const r = await req(`/webhooks/pancake?secret=${s}`);
    check(`webhook với secret viết cứng ${s.slice(0, 8)}… bị từ chối`, r.statusCode === 401, r.statusCode);
  }
  for (const [i, s] of valid.entries()) {
    const r = await req(`/webhooks/pancake?secret=${encodeURIComponent(s)}`);
    check(`webhook với secret #${i + 1} trong .env được nhận`, r.statusCode === 200, r.statusCode);
  }
  check('webhook không có secret bị từ chối', (await req('/webhooks/pancake')).statusCode === 401, 'ok');

  const u = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, tokenVersion: true } });
  const auth = { Authorization: 'Bearer ' + jwt.sign({ id: u.id, role: u.role, tv: u.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '5m' }) };
  const me = await req('/api/auth/me', auth);
  const cookie = String(me.headers['set-cookie'] || '');
  check('/api/auth/me 200', me.statusCode === 200, me.statusCode);
  check(`cookie session ${isProd ? 'có' : 'không có'} cờ Secure`, /;\s*Secure/i.test(cookie) === isProd, /;\s*Secure/i.test(cookie) ? 'Secure' : 'không Secure');

  const dbg = await req('/api/auth/debug-users', auth);
  check(`route debug ${isProd ? 'bị tắt (404)' : 'còn mở'}`, isProd ? dbg.statusCode === 404 : dbg.statusCode !== 404, dbg.statusCode);

  const evil = await req('/api/auth/me', { ...auth, Host: 'evil.example.com' });
  check(`Host lạ ${isProd ? 'bị chặn (400)' : 'không bị chặn'}`, isProd ? evil.statusCode === 400 : evil.statusCode !== 400, evil.statusCode);
  for (const h of ['www.trulivaofficial.com', 'staging.trulivaofficial.com:8443', '127.0.0.1']) {
    const r = await req('/api/auth/me', { ...auth, Host: h });
    check(`Host hợp lệ ${h} đi qua`, r.statusCode === 200, r.statusCode);
  }

  const bot = await req('/api/orders?limit=1', { ...auth, 'User-Agent': 'python-requests/2.31' });
  check(`User-Agent bot ${isProd ? 'bị chặn (403)' : 'không bị chặn'}`, isProd ? bot.statusCode === 403 : bot.statusCode !== 403, bot.statusCode);
  const okUa = await req('/api/orders?limit=1', { ...auth, 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile' });
  check('User-Agent trình duyệt đi qua', okUa.statusCode === 200, okUa.statusCode);

  const local = await req('/api/auth/me', { ...auth, Origin: 'http://localhost:5173' });
  const allowLocal = !!local.headers['access-control-allow-origin'];
  check(`CORS origin localhost ${isProd ? 'bị từ chối' : 'được phép'}`, allowLocal === !isProd, allowLocal ? 'có ACAO' : 'không ACAO');
  const site = await req('/api/auth/me', { ...auth, Origin: 'https://trulivaofficial.com' });
  check('CORS origin trulivaofficial.com được phép', site.headers['access-control-allow-origin'] === 'https://trulivaofficial.com', site.headers['access-control-allow-origin']);

  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
