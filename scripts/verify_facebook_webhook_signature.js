// Verify (không ghi dữ liệu): POST /webhooks/facebook chỉ nhận request có chữ ký X-Hub-Signature-256 đúng (FB_APP_SECRET),
// và GET verify không còn nhận token mặc định từng viết cứng trong code.
// Chạy trên VPS: node scripts/verify_facebook_webhook_signature.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.FB_APP_SECRET;
const req = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { Host: 'trulivaofficial.com', 'Content-Type': 'application/json', ...headers } }, res => {
    res.resume();
    res.on('end', () => resolve(res.statusCode));
  });
  r.on('error', reject);
  r.end(body);
});
const sign = (body, secret) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

(async () => {
  console.log('NODE_ENV:', process.env.NODE_ENV, '| port:', PORT, '| FB_APP_SECRET:', SECRET ? 'có' : 'THIẾU (mọi POST sẽ bị 403)');
  let fail = 0;
  const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name} → ${got}`); };

  // Payload giả giống lần bị khai thác 21/11/2026. Nếu lọt qua, nó sẽ gọi Gemini nên kết quả phải là 403.
  const fake = JSON.stringify({ object: 'page', entry: [{ messaging: [{ sender: { id: '1337133713371337' }, message: { text: 'verify script' } }] }] });
  let s = await req('POST', '/webhooks/facebook', fake);
  check('POST không có chữ ký bị từ chối', s === 403, s);
  s = await req('POST', '/webhooks/facebook', fake, { 'X-Hub-Signature-256': sign(fake, 'wrong-secret') });
  check('POST chữ ký sai bị từ chối', s === 403, s);

  if (SECRET) {
    // entry rỗng: không có tin nào được xử lý, không gọi Gemini/Graph API
    const empty = JSON.stringify({ object: 'page', entry: [] });
    s = await req('POST', '/webhooks/facebook', empty, { 'X-Hub-Signature-256': sign(empty, SECRET) });
    check('POST chữ ký đúng được nhận', s === 200, s);
    s = await req('POST', '/webhooks/facebook', empty + ' ', { 'X-Hub-Signature-256': sign(empty, SECRET) });
    check('POST body bị sửa sau khi ký bị từ chối', s === 403, s);
  }

  if (process.env.FB_VERIFY_TOKEN !== 'truliva_fb_token_2026') {
    s = await req('GET', '/webhooks/facebook?hub.mode=subscribe&hub.verify_token=truliva_fb_token_2026&hub.challenge=x');
    check('GET với verify token mặc định cũ bị từ chối', s === 403, s);
  }

  console.log(fail ? `\n${fail} kiểm tra lỗi` : '\nTất cả OK');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
