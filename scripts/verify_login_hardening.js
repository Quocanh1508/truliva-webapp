// Verify (không ghi dữ liệu): login không lộ username có tồn tại hay không, khoá tạm theo tài khoản,
// và mật khẩu mới phải có ít nhất 8 ký tự.
// Chạy trên VPS: node scripts/verify_login_hardening.js
// Ghi chú: chỉ khoá username giả. Với 1 tài khoản thật, script chỉ thử sai 1 lần (tài khoản bị khoá sau 10 lần sai).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const http = require('http');
const prisma = require('../dist/config/database').default;

const PORT = Number(process.env.PORT || 3000);
const post = (p, body) => new Promise((resolve, reject) => {
  const t = Date.now();
  const r = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: p, headers: { Host: 'trulivaofficial.com', 'Content-Type': 'application/json' } }, res => {
    let d = '';
    res.on('data', c => (d += c));
    res.on('end', () => { let j = {}; try { j = JSON.parse(d); } catch {} resolve({ status: res.statusCode, error: j.error, ms: Date.now() - t }); });
  });
  r.on('error', reject);
  r.end(JSON.stringify(body));
});

(async () => {
  console.log('DB:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0], '| port:', PORT);
  let fail = 0;
  const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name} → ${got}`); };
  const wrong = 'sai-mat-khau-verify-' + Date.now();

  const real = await prisma.user.findFirst({ where: { isActive: true }, select: { username: true }, orderBy: { createdAt: 'asc' } });
  const a = await post('/api/auth/login', { username: real.username, password: wrong });
  const b = await post('/api/auth/login', { username: '__verify_nobody_' + Date.now(), password: wrong });
  check('user có thật + sai mật khẩu và user không tồn tại trả cùng status/thông báo', a.status === b.status && a.error === b.error && a.status === 401, `${a.status} "${a.error}" | ${b.status} "${b.error}"`);
  // Cả 2 nhánh đều chạy bcrypt nên thời gian phải xấp xỉ nhau (nhánh không có user không được nhanh hơn hẳn)
  check('thời gian phản hồi 2 nhánh xấp xỉ nhau', b.ms > a.ms * 0.4, `${a.ms}ms | ${b.ms}ms`);

  const lockUser = '__verify_lock_' + Date.now();
  let passed = 0, last;
  for (let i = 0; i < 11; i++) {
    last = await post('/api/auth/login', { username: lockUser, password: wrong });
    if (last.status === 429) break;
    passed++;
  }
  check('1 username bị khoá tạm sau 10 lần sai', passed === 10 && last.status === 429, `${passed} lần 401, sau đó ${last.status}`);
  const other = await post('/api/auth/login', { username: '__verify_other_' + Date.now(), password: wrong });
  check('username khác (cùng IP) không bị khoá theo', other.status === 401, other.status);

  // Kiểm tra độ dài chạy trước kiểm tra token nên không cần token thật
  const r = await post('/api/auth/reset-password', { token: 'x', newPassword: '1234567' });
  check('mật khẩu mới 7 ký tự bị từ chối', r.status === 400 && /8 ký tự/.test(r.error || ''), `${r.status} "${r.error}"`);

  await prisma.$disconnect();
  console.log(fail ? `\n${fail} kiểm tra lỗi` : '\nTất cả OK');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
