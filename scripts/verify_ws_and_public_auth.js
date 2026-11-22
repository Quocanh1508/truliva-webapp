#!/usr/bin/env node
/**
 * Kiểm tra các bản vá ngày 23/11/2026 (chỉ đọc, chạy được trên production):
 *  - WebSocket /ws: từ chối khi không có / sai session, từ chối token khách Mini App, nhận session nhân viên hợp lệ
 *  - POST /api/serials/public/confirm đã bị xoá
 *  - forgot-password: username không tồn tại vẫn trả 200 + câu chung (dùng 1/5 quota forgot-password của 127.0.0.1)
 *  - Zalo OAuth: authorize/callback bắt đăng nhập ADMIN/DEV, state là JWT, callback từ chối state giả (không gọi Zalo)
 *
 *   node scripts/verify_ws_and_public_auth.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const prisma = require('../src/config/database').default;

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

// Trả 'open' hoặc mã HTTP bị từ chối
function tryWs(cookie) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: cookie ? { Cookie: cookie } : {} });
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (_q, r) => resolve(r.statusCode));
    ws.on('error', (e) => resolve(`error: ${e.message}`));
  });
}

async function main() {
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  console.log(`DB: ${dbName} · API: ${BASE}`);

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, tokenVersion: true } });
  if (!admin) throw new Error('Không tìm thấy tài khoản ADMIN đang hoạt động');
  const adminToken = jwt.sign({ id: admin.id, role: admin.role, tv: admin.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const customerToken = jwt.sign({ id: admin.id, role: 'CUSTOMER', aud: 'truliva-miniapp' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const staleToken = jwt.sign({ id: admin.id, role: admin.role, tv: admin.tokenVersion + 1 }, process.env.JWT_SECRET, { expiresIn: '5m' });

  // ── WebSocket ──
  check(await tryWs(null) === 401, 'WS không cookie → 401');
  check(await tryWs('session_token=garbage') === 401, 'WS cookie rác → 401');
  check(await tryWs(`session_token=${customerToken}`) === 401, 'WS token khách Mini App → 401');
  check(await tryWs(`session_token=${staleToken}`) === 401, 'WS token đã thu hồi (tv lệch) → 401');
  check(await tryWs(`other=1; session_token=${adminToken}`) === 'open', 'WS session ADMIN hợp lệ → kết nối được');

  // ── public/confirm đã xoá ──
  const confirm = await fetch(`${BASE}/api/serials/public/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serialNumber: 'TRL0001' }) });
  check([401, 404].includes(confirm.status), `POST /api/serials/public/confirm không còn chạy được (nhận ${confirm.status}: route đã xoá, rơi vào requireAuth)`);

  // ── forgot-password ──
  const fp = await fetch(`${BASE}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernameOrEmail: `khong-ton-tai-${Date.now()}` }) });
  const fpBody = await fp.json().catch(() => null);
  check(fp.status === 200 && /Nếu tài khoản tồn tại/.test(fpBody?.message || ''), `forgot-password user không tồn tại → 200 + câu chung (nhận ${fp.status})`);

  // ── Zalo OAuth ──
  const noAuth = await fetch(`${BASE}/api/serials/zalo/authorize`, { redirect: 'manual' });
  check(noAuth.status === 401, `GET /zalo/authorize không đăng nhập → 401 (nhận ${noAuth.status})`);
  const cbNoAuth = await fetch(`${BASE}/api/serials/zalo/callback?code=x&state=truliva`, { redirect: 'manual' });
  check(cbNoAuth.status === 401, `GET /zalo/callback không đăng nhập → 401 (nhận ${cbNoAuth.status})`);

  const auth = await fetch(`${BASE}/api/serials/zalo/authorize`, { redirect: 'manual', headers: { Authorization: `Bearer ${adminToken}` } });
  const loc = auth.headers.get('location') || '';
  if (auth.status === 400) console.log('   (Zalo OA chưa cấu hình App ID trên môi trường này, bỏ qua kiểm tra state)');
  else {
    const state = new URL(loc).searchParams.get('state') || '';
    let ok = false;
    try { const d = jwt.verify(state, process.env.JWT_SECRET); ok = d.purpose === 'zalo_oa_oauth' && d.uid === admin.id; } catch { /* sai */ }
    check(auth.status === 302 && ok, `GET /zalo/authorize ADMIN → 302, state là JWT ký đúng (${auth.status})`);
  }
  const cbFake = await fetch(`${BASE}/api/serials/zalo/callback?code=fake&state=truliva`, { redirect: 'manual', headers: { Authorization: `Bearer ${adminToken}` } });
  check(cbFake.status === 400, `GET /zalo/callback ADMIN + state giả → 400, không đổi code (nhận ${cbFake.status})`);

  console.log(failures ? `\n❌ ${failures} kiểm tra lỗi` : '\n✅ Tất cả đạt');
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
