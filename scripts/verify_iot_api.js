#!/usr/bin/env node
/**
 * Kiểm tra API IoT trực tiếp trên VPS (gọi http://127.0.0.1:<PORT>/api/iot/...).
 * Ký 1 JWT ngắn hạn (5 phút) cho 1 tài khoản ADMIN đang hoạt động, rồi kiểm tra cấu trúc JSON mà webapp đang dùng.
 *
 *   node scripts/verify_iot_api.js                 → chỉ đọc (an toàn cho production)
 *   node scripts/verify_iot_api.js --write <SERIAL> → thêm test ghi: mute/unmute, lưu trữ/khôi phục máy <SERIAL>
 *                                                     (CHỈ dùng trên sandbox / máy test)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/database').default;

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}/api/iot`;
const wIdx = process.argv.indexOf('--write');
const WRITE_SERIAL = wIdx > 0 ? process.argv[wIdx + 1] : null;

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

async function main() {
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  console.log(`DB: ${dbName} · API: ${BASE}`);

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, username: true, role: true, group: true } });
  if (!admin) throw new Error('Không tìm thấy tài khoản ADMIN đang hoạt động');
  const signFor = (u) => jwt.sign({ id: u.id, role: u.role, group: u.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const callAs = (tok) => async (p, opts = {}) => {
    const r = await fetch(BASE + p, { ...opts, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const api = callAs(signFor(admin));

  // ── Đọc ──
  const list = await api('/devices');
  check(list.status === 200 && Array.isArray(list.body?.devices), `GET /devices → 200, devices[] (${list.body?.devices?.length ?? '?'} máy)`);
  const d0 = list.body?.devices?.[0];
  if (d0) {
    for (const k of ['serialNumber', 'isOnline', 'isMuted', 'unresolvedAlerts', 'totalReadings', 'latestTelemetry', 'serialInfo']) {
      check(k in d0, `  device có key "${k}"`);
    }
    check(typeof d0.isMuted === 'boolean', '  isMuted là boolean');
    check(!('latestPayload' in d0), '  không lộ latestPayload thô trong list');
    check(!list.body.devices.some(d => d.isArchived), '  không có máy đã lưu trữ trong list mặc định');
    const withLive = list.body.devices.find(d => d.latestTelemetry?.rawPayload);
    if (withLive) check(withLive.latestTelemetry.recordedAt != null, `  latestTelemetry live có recordedAt (${withLive.serialNumber})`);

    const detail = await api(`/devices/${encodeURIComponent(d0.serialNumber)}`);
    check(detail.status === 200 && detail.body?.device && Array.isArray(detail.body?.recentTelemetry), `GET /devices/${d0.serialNumber} → device + recentTelemetry[]`);
    check([2, 3].includes(detail.body?.device?.modelConfig?.filterCount), `  detail có modelConfig (${JSON.stringify(detail.body?.device?.modelConfig)})`);

    // Mục 4: mọi thiết bị đều có modelConfig
    check(list.body.devices.every(d => [2, 3].includes(d.modelConfig?.filterCount)), '  mọi device có modelConfig.filterCount 2|3');
    for (const d of list.body.devices) console.log(`     · ${d.serialNumber}: ${d.modelConfig?.model} (${d.modelConfig?.filterCount} lõi, nguồn: ${d.modelConfig?.source})`);

    // Mục 8: kiểm tra tham số lệnh (bị chặn TRƯỚC khi gửi MQTT → an toàn cho production)
    const sn0 = encodeURIComponent(d0.serialNumber);
    const bad = [
      [{ command: 'open_valve' }, 'lệnh không hỗ trợ'],
      [{ command: 'set_interval', params: { interval: 0 } }, 'interval = 0'],
      [{ command: 'set_interval', params: { interval: 5000 } }, 'interval = 5000'],
      [{ command: 'set_interval', params: { interval: 'abc' } }, 'interval = "abc"'],
      [{ command: 'set_interval', params: { interval: 12.5 } }, 'interval = 12.5'],
      [{ command: 'set_interval' }, 'thiếu interval'],
      [{ command: 'ota', params: { url: 'https://x/fw.bin', version: '1.3.0' } }, 'OTA thiếu sha256'],
      [{ command: 'ota', params: { url: 'ftp://x/fw.bin', version: '1.3.0', sha256: 'a'.repeat(64) } }, 'OTA url ftp://'],
    ];
    for (const [body, label] of bad) {
      const r = await api(`/devices/${sn0}/command`, { method: 'POST', body: JSON.stringify(body) });
      check(r.status === 400, `  lệnh sai (${label}) → 400 (${r.status}: ${r.body?.error})`);
    }
  }

  // Mục 5: phân quyền theo feature key
  const noPermUser = await prisma.user.findFirst({ where: { role: { in: ['KTV', 'SALER', 'STAFF'] }, isActive: true, NOT: { group: 'CUSTOMER' } }, select: { id: true, role: true, group: true } });
  if (noPermUser) {
    const as = callAs(signFor(noPermUser));
    const r1 = await as('/devices');
    check(r1.status === 403, `  ${noPermUser.role} xem /devices → 403 (${r1.status})`);
    const r2 = await as(`/devices/${encodeURIComponent(d0?.serialNumber || 'X')}/command`, { method: 'POST', body: JSON.stringify({ command: 'ping' }) });
    check(r2.status === 403, `  ${noPermUser.role} gửi lệnh → 403 (${r2.status})`);
  }
  const devUser = await prisma.user.findFirst({ where: { role: 'DEV', isActive: true }, select: { id: true, role: true, group: true } });
  if (devUser) {
    const r = await callAs(signFor(devUser))('/devices');
    check(r.status === 200, `  DEV xem /devices → 200 (${r.status})`);
  } else {
    console.log('ℹ️  Không có tài khoản DEV đang hoạt động — bỏ qua test DEV');
  }

  const alerts = await api('/alerts?resolved=false');
  check(alerts.status === 200 && Array.isArray(alerts.body?.alerts) && typeof alerts.body?.unresolvedCount === 'number',
    `GET /alerts → alerts[] (${alerts.body?.alerts?.length ?? '?'}), unresolvedCount=${alerts.body?.unresolvedCount}`);
  const a0 = alerts.body?.alerts?.[0];
  if (a0) check(a0.device && typeof a0.device.isMuted === 'boolean' && a0.device.serialNumber, '  alert.device có serialNumber + isMuted(boolean)');

  // Bất biến: mỗi (máy, loại) tối đa 1 cảnh báo đang mở
  const dup = await prisma.$queryRawUnsafe(
    `SELECT device_id, alert_type, COUNT(*)::int c FROM iot_alerts WHERE is_resolved = false GROUP BY 1,2 HAVING COUNT(*) > 1`
  );
  check(dup.length === 0, `DB: không có cảnh báo đang mở bị trùng (${dup.length} nhóm trùng)`);
  const legacy = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int c FROM iot_devices WHERE config_json ?| array['isMuted','isArchived']`
  );
  check(legacy[0].c === 0, `DB: configJson không còn cờ isMuted/isArchived cũ (${legacy[0].c})`);

  // ── Ghi (chỉ sandbox) ──
  if (WRITE_SERIAL) {
    const sn = encodeURIComponent(WRITE_SERIAL);
    const before = await prisma.iotDevice.findUnique({ where: { serialNumber: WRITE_SERIAL } });
    if (!before) throw new Error(`Không có máy ${WRITE_SERIAL}`);

    let r = await api(`/devices/${sn}/mute`, { method: 'PATCH', body: JSON.stringify({ muted: !before.isMuted, resolveExisting: false }) });
    let now = await prisma.iotDevice.findUnique({ where: { id: before.id } });
    check(r.status === 200 && now.isMuted === !before.isMuted, `PATCH mute → cột is_muted = ${now.isMuted}`);
    r = await api(`/devices/${sn}/mute`, { method: 'PATCH', body: JSON.stringify({ muted: before.isMuted, resolveExisting: false }) });
    now = await prisma.iotDevice.findUnique({ where: { id: before.id } });
    check(r.status === 200 && now.isMuted === before.isMuted, `PATCH mute (khôi phục) → is_muted = ${now.isMuted}`);

    r = await api(`/devices/${sn}`, { method: 'DELETE' });
    now = await prisma.iotDevice.findUnique({ where: { id: before.id } });
    const openAfterArchive = await prisma.iotAlert.count({ where: { deviceId: before.id, isResolved: false } });
    check(r.status === 200 && now.isArchived && openAfterArchive === 0, `DELETE (lưu trữ) → is_archived=${now.isArchived}, cảnh báo mở=${openAfterArchive}`);
    const listArch = await api('/devices');
    check(!listArch.body.devices.some(d => d.serialNumber === WRITE_SERIAL), '  máy đã lưu trữ bị ẩn khỏi GET /devices');
    const listAll = await api('/devices?includeArchived=true');
    check(listAll.body.devices.some(d => d.serialNumber === WRITE_SERIAL), '  ?includeArchived=true vẫn thấy máy');
    r = await api(`/devices/${sn}/command`, { method: 'POST', body: JSON.stringify({ command: 'ping' }) });
    check(r.status === 409, `  gửi lệnh tới máy đã lưu trữ → 409 (${r.status})`);

    r = await api('/devices', { method: 'POST', body: JSON.stringify({ serialNumber: WRITE_SERIAL }) });
    now = await prisma.iotDevice.findUnique({ where: { id: before.id } });
    check(r.status === 200 && r.body?.restored === true && !now.isArchived, `POST /devices (đăng ký lại) → khôi phục, is_archived=${now.isArchived}`);
    r = await api('/devices', { method: 'POST', body: JSON.stringify({ serialNumber: WRITE_SERIAL }) });
    check(r.status === 409, `  đăng ký lại máy đang hoạt động → 409 (${r.status})`);
  }

  // Mục 8: gửi ping thật (vô hại: máy chỉ gửi lại 1 gói telemetry) và chờ phản hồi
  const pIdx = process.argv.indexOf('--ping');
  const PING_SERIAL = pIdx > 0 ? process.argv[pIdx + 1] : null;
  if (PING_SERIAL) {
    const dev = await prisma.iotDevice.findUnique({ where: { serialNumber: PING_SERIAL } });
    const r = await api(`/devices/${encodeURIComponent(PING_SERIAL)}/command`, { method: 'POST', body: JSON.stringify({ command: 'ping', junk: 'x' }) });
    check(r.status === 200 && /^req-\d+$/.test(r.body?.requestId || '') && r.body?.deviceOnline === dev.isOnline,
      `POST ping ${PING_SERIAL} → 200, requestId=${r.body?.requestId}, deviceOnline=${r.body?.deviceOnline}`);
    check(r.body?.params && Object.keys(r.body.params).length === 0, '  field lạ ("junk") không được chuyển xuống thiết bị');
    let lc = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(res => setTimeout(res, 1000));
      const d = await prisma.iotDevice.findUnique({ where: { id: dev.id } });
      lc = d.configJson?.lastCommand;
      if (lc?.status && lc.status !== 'sent') break;
    }
    check(lc?.id === r.body?.requestId, `  configJson.lastCommand.id khớp requestId`);
    if (dev.isOnline) {
      check(lc?.status === 'acknowledged', `  máy online đã xác nhận lệnh (status=${lc?.status})`);
      // Chờ telemetry sau lệnh để backend xác minh tác động thật lên chip
      for (let i = 0; i < 20 && !lc?.verified; i++) {
        await new Promise(res => setTimeout(res, 1000));
        lc = (await prisma.iotDevice.findUnique({ where: { id: dev.id } })).configJson?.lastCommand;
      }
      check(lc?.verified === true, `  backend xác minh chip đã phản ứng (evidence=${JSON.stringify(lc?.evidence)})`);
    }
    else console.log(`ℹ️  Máy offline — trạng thái lệnh: ${lc?.status}`);
  }

  console.log(failures === 0 ? '\n🎉 Tất cả kiểm tra đạt' : `\n⚠️  ${failures} kiểm tra KHÔNG đạt`);
  return failures === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch(err => { console.error('❌ Lỗi:', err.message); process.exit(1); });
