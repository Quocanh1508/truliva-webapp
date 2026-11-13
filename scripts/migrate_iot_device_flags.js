#!/usr/bin/env node
/**
 * Chuyển dữ liệu IoT sau khi thêm cột mới vào iot_devices (is_muted, is_archived, latest_payload, ...).
 * Chạy SAU `npx prisma db push`.
 *
 *   1. Copy configJson.isMuted / isArchived / latestLivePayload (+ thời gian, người thao tác) sang cột riêng.
 *   2. Xóa các key cũ đó khỏi configJson.
 *   3. Gộp cảnh báo trùng: mỗi (máy, loại cảnh báo) chỉ giữ 1 bản ghi đang mở (bản mới nhất),
 *      các bản cũ hơn được đánh dấu đã xử lý (không xóa — Zero Hard-Delete).
 *   4. Đánh dấu đã xử lý các cảnh báo đang mở của máy đã lưu trữ.
 *
 * Mặc định chỉ in báo cáo (dry-run). Thêm --apply để ghi DB.
 *   node scripts/vps_db_tunnel.js production -- node scripts/migrate_iot_device_flags.js
 *   node scripts/vps_db_tunnel.js production -- node scripts/migrate_iot_device_flags.js --apply
 */
// Nạp .env của CHÍNH thư mục dự án chứa script (sandbox/production) TRƯỚC khi import database.ts —
// nếu không, database.ts sẽ tự fallback sang /var/www/truliva/.env (DB production)!
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const prisma = require('../src/config/database').default;

const APPLY = process.argv.includes('--apply');
const LEGACY_KEYS = ['isMuted', 'mutedAt', 'mutedBy', 'isArchived', 'archivedAt', 'archivedBy', 'latestLivePayload', 'latestLivePayloadAt'];

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const dbName = (() => { try { return new URL(process.env.DATABASE_URL).pathname.slice(1); } catch { return '?'; } })();
  console.log(`${APPLY ? '⚙️  CHẾ ĐỘ GHI (--apply)' : '🔍 DRY-RUN (thêm --apply để ghi DB)'} — DB: ${dbName}`);

  // ── 1 & 2. Chuyển cờ từ configJson sang cột ──
  const devices = await prisma.iotDevice.findMany();
  let migrated = 0;
  for (const d of devices) {
    const cfg = (d.configJson && typeof d.configJson === 'object') ? { ...d.configJson } : null;
    if (!cfg || !LEGACY_KEYS.some(k => k in cfg)) continue;

    const data = {};
    if (cfg.isMuted === true && !d.isMuted) {
      data.isMuted = true;
      data.mutedAt = toDate(cfg.mutedAt);
      data.mutedBy = cfg.mutedBy || null;
    }
    if (cfg.isArchived === true && !d.isArchived) {
      data.isArchived = true;
      data.archivedAt = toDate(cfg.archivedAt);
      data.archivedBy = cfg.archivedBy || null;
      data.isOnline = false;
    }
    if (cfg.latestLivePayload && !d.latestPayload) {
      data.latestPayload = cfg.latestLivePayload;
      data.latestPayloadAt = toDate(cfg.latestLivePayloadAt);
    }
    for (const k of LEGACY_KEYS) delete cfg[k];
    data.configJson = cfg;

    migrated++;
    console.log(`  • ${d.serialNumber}: muted=${data.isMuted ?? d.isMuted} archived=${data.isArchived ?? d.isArchived} livePayload=${data.latestPayload ? 'có' : (d.latestPayload ? 'đã có' : 'không')}`);
    if (APPLY) await prisma.iotDevice.update({ where: { id: d.id }, data });
  }
  console.log(`→ ${migrated}/${devices.length} thiết bị cần chuyển cờ từ configJson.`);

  // ── 3. Gộp cảnh báo trùng đang mở ──
  const dupCondition = `
    a.is_resolved = false AND EXISTS (
      SELECT 1 FROM iot_alerts b
      WHERE b.device_id = a.device_id AND b.alert_type = a.alert_type AND b.is_resolved = false
        AND (b.created_at > a.created_at OR (b.created_at = a.created_at AND b.id > a.id))
    )`;
  const [{ count: dupCount }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM iot_alerts a WHERE ${dupCondition}`
  );
  const byType = await prisma.$queryRawUnsafe(
    `SELECT a.alert_type, COUNT(*)::int AS count FROM iot_alerts a WHERE ${dupCondition} GROUP BY a.alert_type ORDER BY count DESC`
  );
  console.log(`→ ${dupCount} cảnh báo trùng đang mở sẽ được đánh dấu đã xử lý.`);
  for (const r of byType) console.log(`    ${r.alert_type}: ${r.count}`);
  if (APPLY && dupCount > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE iot_alerts a SET is_resolved = true, resolved_at = NOW() WHERE ${dupCondition}`
    );
  }

  // ── 4. Đóng cảnh báo của máy đã lưu trữ ──
  // (dry-run: tính cả máy sẽ được lưu trữ ở bước 1)
  const archivedIds = APPLY
    ? (await prisma.iotDevice.findMany({ where: { isArchived: true }, select: { id: true } })).map(d => d.id)
    : devices.filter(d => d.isArchived || d.configJson?.isArchived === true).map(d => d.id);
  const archivedOpen = archivedIds.length
    ? await prisma.iotAlert.count({ where: { deviceId: { in: archivedIds }, isResolved: false } })
    : 0;
  console.log(`→ ${archivedOpen} cảnh báo đang mở thuộc ${archivedIds.length} máy đã lưu trữ sẽ được đóng.`);
  if (APPLY && archivedOpen > 0) {
    await prisma.iotAlert.updateMany({
      where: { deviceId: { in: archivedIds }, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() }
    });
  }

  console.log(APPLY ? '✅ Hoàn tất.' : 'ℹ️  Dry-run xong, chưa ghi gì.');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  });
