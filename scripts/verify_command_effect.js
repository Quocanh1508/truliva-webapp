#!/usr/bin/env node
/**
 * Gửi 1 lệnh tới thiết bị THẬT qua API (đúng luồng admin dùng) rồi theo dõi tới khi backend xác minh tác động.
 * ⚠️ Lệnh tác động lên máy của khách — chỉ chạy khi user đã đồng ý (sandbox & production dùng chung thiết bị).
 *
 *   node scripts/verify_command_effect.js <serial> <reboot|ping|set_interval> [interval] [--timeout-min 30]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/database').default;

const [serial, command, arg] = process.argv.slice(2);
const tIdx = process.argv.indexOf('--timeout-min');
const TIMEOUT_MS = (tIdx > 0 ? Number(process.argv[tIdx + 1]) : 30) * 60e3;
const BASE = `http://127.0.0.1:${process.env.PORT || 3000}/api/iot`;
const ts = () => new Date().toLocaleTimeString('vi-VN', { hour12: false });

async function main() {
  if (!serial || !['reboot', 'ping', 'set_interval'].includes(command)) throw new Error('Usage: <serial> <reboot|ping|set_interval> [interval]');
  console.log(`DB: ${new URL(process.env.DATABASE_URL).pathname.slice(1)} · API: ${BASE}`);

  const before = await prisma.iotDevice.findUnique({ where: { serialNumber: serial } });
  if (!before) throw new Error(`Không có máy ${serial}`);
  const lp = before.latestPayload || {};
  console.log(`[${ts()}] Trước lệnh: online=${before.isOnline}, uptime=${lp.uptime}s, reset_reason=${lp.reset_reason}, reconnects=${lp.reconnects}, payload lúc ${before.latestPayloadAt?.toISOString()}`);
  if (!before.isOnline) throw new Error('Máy đang offline — dừng, không gửi lệnh');

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, group: true } });
  const token = jwt.sign({ id: admin.id, role: admin.role, group: admin.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const params = command === 'set_interval' ? { interval: Number(arg) } : {};
  const r = await fetch(`${BASE}/devices/${encodeURIComponent(serial)}/command`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, params })
  });
  const body = await r.json();
  console.log(`[${ts()}] POST ${command} → ${r.status}: ${body.message || body.error} (requestId=${body.requestId})`);
  if (r.status !== 200) return 1;
  const sentAt = Date.now();

  let last = '';
  while (Date.now() - sentAt < TIMEOUT_MS) {
    await new Promise(res => setTimeout(res, 2000));
    const d = await prisma.iotDevice.findUnique({ where: { id: before.id } });
    const lc = d.configJson?.lastCommand || {};
    const p = d.latestPayload || {};
    const state = `online=${d.isOnline} | lệnh: status=${lc.status}${lc.verified ? ', verified' : ''} | payload lúc ${d.latestPayloadAt?.toISOString()} uptime=${p.uptime}s reset_reason=${p.reset_reason}`;
    if (state !== last) { console.log(`[${ts()}] +${Math.round((Date.now() - sentAt) / 1000)}s  ${state}`); last = state; }
    if (lc.id !== body.requestId) { console.log('⚠️  lastCommand đã bị lệnh khác thay thế'); return 1; }
    if (lc.verified) {
      console.log(`\n✅ ĐÃ XÁC MINH tác động lên chip: ${JSON.stringify(lc.evidence)}`);
      return 0;
    }
    if (['failed', 'publish_failed'].includes(lc.status)) { console.log(`\n❌ Lệnh lỗi: ${lc.error}`); return 1; }
  }
  console.log(`\n⚠️  Hết ${TIMEOUT_MS / 60e3} phút mà chưa xác minh được`);
  return 1;
}

main().then(c => process.exit(c)).catch(e => { console.error('❌', e.message); process.exit(1); });
