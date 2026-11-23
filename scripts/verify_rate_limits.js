// Verify (không tạo dữ liệu): rate limit cho endpoint public, và backend chỉ nghe 127.0.0.1.
// Chạy trên VPS: node scripts/verify_rate_limits.js
// Lưu ý: script dùng hết quota của IP 127.0.0.1 (forgot-password 1 giờ, write 1 giờ, read 1 phút). Người dùng thật
// đi qua nginx nên mang IP riêng, không bị ảnh hưởng.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const http = require('http');
const os = require('os');

const PORT = Number(process.env.PORT || 3000);
const send = (method, p, body, host = '127.0.0.1') => new Promise((resolve) => {
  const r = http.request({ host, port: PORT, method, path: p, timeout: 5000, headers: { Host: 'trulivaofficial.com', 'Content-Type': 'application/json' } }, res => {
    res.resume();
    res.on('end', () => resolve(res.statusCode));
  });
  r.on('error', e => resolve(e.code));
  r.on('timeout', () => r.destroy(new Error('timeout')));
  r.end(body);
});

// Gọi tới khi bị 429, trả về số request đã được cho qua
async function countUntil429(method, p, body, max) {
  for (let i = 1; i <= max + 1; i++) {
    const s = await send(method, p, body);
    if (s === 429) return i - 1;
    if (typeof s !== 'number') return `lỗi ${s}`;
  }
  return `>${max}`;
}

(async () => {
  console.log('NODE_ENV:', process.env.NODE_ENV, '| port:', PORT);
  let fail = 0;
  const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name} → ${got}`); };

  // Phải trả ECONNREFUSED trên mọi IP không phải loopback của máy
  const extIps = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
  for (const ip of extIps) {
    const s = await send('GET', '/health', undefined, ip);
    check(`không truy cập trực tiếp được ${ip}:${PORT}`, s === 'ECONNREFUSED', s);
  }
  check('127.0.0.1 vẫn phục vụ /health', (await send('GET', '/health')) === 200, 'ok');

  // username không tồn tại → 404, không gửi email
  let n = await countUntil429('POST', '/api/auth/forgot-password', JSON.stringify({ usernameOrEmail: '__verify_rate_limit_nobody__' }), 5);
  check('forgot-password bị chặn sau 5 lần/giờ', n === 5, n);
  // không kèm file → 400, không upload Cloudinary
  n = await countUntil429('POST', '/api/serials/public/upload-invoice', undefined, 30);
  check('nhóm public write bị chặn sau 30 lần/giờ', n === 30, n);
  n = await countUntil429('GET', '/api/serials/public/check/__VERIFY_NOPE__', undefined, 30);
  check('nhóm public read bị chặn sau 30 lần/phút', n === 30, n);
  // Cùng bộ đếm nhóm read nên phải bị chặn ngay
  check('promos/validate dùng chung bộ đếm nhóm read', (await send('POST', '/api/promos/validate', '{}')) === 429, 'ok');

  console.log(fail ? `\n${fail} kiểm tra lỗi` : '\nTất cả OK');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
