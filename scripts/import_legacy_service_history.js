#!/usr/bin/env node
/**
 * Nạp "Lịch sử dịch vụ cũ" (import ẩn) vào bảng legacy_service_histories.
 * Dữ liệu này KHÔNG phải đơn hàng: chỉ tra cứu được ở Quản lý Hotline → Tra cứu lịch sử KH → mục 3.
 *
 * File nguồn: JSONL nén gzip, mỗi dòng 1 bản ghi đã chuẩn hóa (SĐT 10 số, Tỉnh/TP theo danh sách Pancake,
 * ngày dạng ISO kèm +07:00). Mặc định: backup_data/legacy_service_history.jsonl.gz (không đưa lên git vì chứa dữ liệu KH).
 *
 *   node scripts/import_legacy_service_history.js [file] [--batch <tên>]            → dry-run: đọc + kiểm tra, không ghi
 *   node scripts/import_legacy_service_history.js [file] [--batch <tên>] --apply    → ghi vào DB
 *   ... --apply --replace                                                           → xoá batch cùng tên rồi nạp lại
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const prisma = require('../src/config/database').default;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REPLACE = args.includes('--replace');
const bIdx = args.indexOf('--batch');
const BATCH = bIdx >= 0 ? args[bIdx + 1] : 'technician_task_2016-12_2026-10';
const FILE = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--batch')
  || path.resolve(__dirname, '../backup_data/legacy_service_history.jsonl.gz'));
const CHUNK = 2000;

const STR_FIELDS = ['legacyOrderCode', 'customerName', 'customerPhone', 'address', 'provinceName', 'status', 'workType',
  'serviceType', 'products', 'mainStation', 'techStation', 'ktvName', 'note', 'serialNumber', 'parts'];
const DATE_FIELDS = ['completedAt', 'appointmentTime', 'requestedAt'];

function toRecord(o, lineNo) {
  const r = { importBatch: BATCH };
  for (const k of STR_FIELDS) r[k] = o[k] == null || o[k] === '' ? null : String(o[k]);
  for (const k of DATE_FIELDS) {
    if (o[k] == null) { r[k] = null; continue; }
    const d = new Date(o[k]);
    if (isNaN(d.getTime())) throw new Error(`Dòng ${lineNo}: ${k} không hợp lệ (${o[k]})`);
    r[k] = d;
  }
  r.moneyToCollect = o.moneyToCollect == null ? null : Number(o.moneyToCollect);
  if (!r.status) r.status = 'Hoàn thành';
  return r;
}

async function main() {
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  console.log(`DB: ${dbName} · file: ${FILE} · batch: ${BATCH} · chế độ: ${APPLY ? 'APPLY' : 'DRY-RUN'}${REPLACE ? ' +REPLACE' : ''}`);
  if (!fs.existsSync(FILE)) throw new Error(`Không tìm thấy file ${FILE}`);

  const existing = await prisma.legacyServiceHistory.count({ where: { importBatch: BATCH } });
  const total = await prisma.legacyServiceHistory.count();
  console.log(`Hiện có trong DB: ${total} bản ghi (batch này: ${existing})`);
  if (existing > 0 && APPLY && !REPLACE) throw new Error(`Batch "${BATCH}" đã có ${existing} bản ghi. Dùng --replace để nạp lại.`);

  const input = fs.createReadStream(FILE).pipe(FILE.endsWith('.gz') ? zlib.createGunzip() : new (require('stream').PassThrough)());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  const stats = { rows: 0, noPhone: 0, badPhone: 0, noProvince: 0, noCompletedAt: 0, withSerial: 0 };
  let minDate = null, maxDate = null;
  const records = [];
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (!line.trim()) continue;
    const r = toRecord(JSON.parse(line), lineNo);
    stats.rows++;
    if (!r.customerPhone) stats.noPhone++;
    else if (!/^0\d{9}$/.test(r.customerPhone)) stats.badPhone++;
    if (!r.provinceName) stats.noProvince++;
    if (r.serialNumber) stats.withSerial++;
    if (!r.completedAt) stats.noCompletedAt++;
    else {
      if (!minDate || r.completedAt < minDate) minDate = r.completedAt;
      if (!maxDate || r.completedAt > maxDate) maxDate = r.completedAt;
    }
    records.push(r);
  }
  console.log('Báo cáo:', stats);
  console.log(`Ngày hoàn thành: ${minDate?.toISOString()} → ${maxDate?.toISOString()}`);
  if (stats.badPhone > 0) throw new Error(`${stats.badPhone} SĐT không đúng chuẩn 10 số — dừng.`);

  if (!APPLY) { console.log('DRY-RUN: không ghi gì. Thêm --apply để nạp.'); return; }

  if (existing > 0) {
    const del = await prisma.legacyServiceHistory.deleteMany({ where: { importBatch: BATCH } });
    console.log(`Đã xoá ${del.count} bản ghi cũ của batch "${BATCH}"`);
  }
  let inserted = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const res = await prisma.legacyServiceHistory.createMany({ data: records.slice(i, i + CHUNK) });
    inserted += res.count;
    if ((i / CHUNK) % 10 === 0) console.log(`  ... ${inserted}/${records.length}`);
  }
  const after = await prisma.legacyServiceHistory.count({ where: { importBatch: BATCH } });
  console.log(`Đã nạp ${inserted} bản ghi. Batch "${BATCH}" trong DB: ${after}`);
  if (after !== records.length) { process.exitCode = 1; console.error('❌ Số bản ghi trong DB không khớp file!'); }
}

main()
  .catch(e => { console.error('❌', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
