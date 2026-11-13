#!/usr/bin/env node
/**
 * Kiểm tra dữ liệu IoT trả cho Zalo Mini App (GET /api/zalo-miniapp/my-serials) trực tiếp trên VPS.
 * Chỉ đọc. Tìm các tài khoản khách có máy gắn IoT, ký JWT Mini App ngắn hạn (5 phút) rồi kiểm tra:
 *   - không còn giá trị giả (IP 192.168.1.135, SSID Truliva_Smart_WiFi, MAC TL-xxxx, band cố định)
 *   - có recordedAt (thời điểm số liệu) và iot.model (dòng máy dùng chung logic backend)
 *   - số liệu khớp payload live mới nhất của thiết bị
 *
 *   node scripts/verify_miniapp_iot.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/database').default;
const { buildPhoneVariants } = require('../src/routes/zaloMiniApp');

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}/api/zalo-miniapp`;
const FAKE = { ip: '192.168.1.135', ssid: 'Truliva_Smart_WiFi' };

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

async function main() {
  console.log(`DB: ${new URL(process.env.DATABASE_URL).pathname.slice(1)} · API: ${BASE}`);
  const secret = process.env.ZALO_MINIAPP_JWT_SECRET || process.env.JWT_SECRET;

  const devices = await prisma.iotDevice.findMany({ where: { isArchived: false } });
  const serials = await prisma.serial.findMany({
    where: { serialNumber: { in: devices.map(d => d.serialNumber) }, customerPhone: { not: null } },
    select: { serialNumber: true, customerPhone: true }
  });

  let tested = 0;
  for (const s of serials) {
    const user = await prisma.user.findFirst({
      where: { phoneNumber: { in: buildPhoneVariants(s.customerPhone) }, isActive: true },
      select: { id: true, role: true, group: true }
    });
    if (!user) { console.log(`ℹ️  ${s.serialNumber}: chưa có tài khoản khách cho SĐT này — bỏ qua`); continue; }

    const token = jwt.sign({ id: user.id, role: user.role, group: user.group }, secret, { audience: 'truliva-miniapp', expiresIn: '5m' });
    const r = await fetch(`${BASE}/my-serials`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await r.json().catch(() => null);
    check(r.status === 200 && Array.isArray(body?.serials), `GET /my-serials (khách có máy ${s.serialNumber}) → 200`);
    tested++;

    for (const item of body?.serials || []) {
      if (!item.iot) continue;
      const t = item.iot.telemetry;
      const dev = devices.find(d => d.serialNumber === item.serialNumber);
      const tag = `  ${item.serialNumber}`;
      check([2, 3].includes(item.iot.model?.filterCount), `${tag}: iot.model = ${item.iot.model?.model} (${item.iot.model?.filterCount} lõi, ${item.iot.model?.source})`);
      if (!t) { console.log(`${tag}: chưa có telemetry (UI sẽ báo "chưa gửi dữ liệu")`); continue; }
      // Mạng: phải đúng giá trị thiết bị gửi (payload/configJson) hoặc null — không được tự điền giá trị mặc định
      // Nguồn giống API: payload live, nếu chưa có thì bản ghi telemetry gần nhất
      const lastStored = dev && !dev.latestPayload
        ? (await prisma.iotTelemetry.findFirst({ where: { deviceId: dev.id }, orderBy: { recordedAt: 'desc' }, select: { rawPayload: true } }))?.rawPayload
        : null;
      const src = { ...(dev?.configJson || {}), ...(dev?.latestPayload || lastStored || {}) };
      const same = (k) => (t[k] ?? null) === (src[k] || null);
      check(same('ip') && same('ssid') && same('mac') && !('band' in t),
        `${tag}: IP/SSID/MAC đúng theo dữ liệu thiết bị, không tự điền (ip=${t.ip}, ssid=${t.ssid}, mac=${t.mac})`);
      check(!(t.ip === FAKE.ip && src.ip !== FAKE.ip) && !(t.ssid === FAKE.ssid && src.ssid !== FAKE.ssid), `${tag}: không còn giá trị mặc định giả cũ`);
      check(t.recordedAt != null, `${tag}: có recordedAt = ${t.recordedAt}`);
      const live = dev?.latestPayload;
      if (live) {
        const exp = live.tdsOut ?? live.tds_out ?? null;
        check(t.tdsOut === (exp == null ? null : Number(exp)), `${tag}: tdsOut khớp payload live (${t.tdsOut} = ${exp})`);
        check(t.ro === (live.ro == null ? null : Number(live.ro)), `${tag}: ro khớp payload live (${t.ro} = ${live.ro})`);
      }
    }
  }
  if (tested === 0) console.log('⚠️  Không tìm thấy tài khoản khách nào có máy gắn IoT để test');

  console.log(failures === 0 ? '\n🎉 Tất cả kiểm tra đạt' : `\n⚠️  ${failures} kiểm tra KHÔNG đạt`);
  return failures === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch(err => { console.error('❌ Lỗi:', err.message); process.exit(1); });
