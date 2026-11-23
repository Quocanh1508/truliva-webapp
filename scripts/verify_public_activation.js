#!/usr/bin/env node
/**
 * Kiểm tra chốt chặn của POST /api/serials/public/activate (khách tự kích hoạt bảo hành). CHỈ CHẠY TRÊN SANDBOX:
 * tạo 4 serial TRUTESTACT*, upload ảnh thật lên Cloudinary, kích hoạt, rồi xoá hết (serial, thông báo, log ZNS giả, ảnh).
 *  - ảnh hoá đơn phải là ảnh vừa upload qua /public/upload-invoice và có thật; không dùng lại ảnh của serial khác
 *  - SĐT 10 chữ số; mỗi SĐT tối đa 3 lần tự kích hoạt / 24h
 * Dùng khoảng 13/30 quota publicWriteLimiter của 127.0.0.1 trong 1 giờ.
 *
 *   node scripts/verify_public_activation.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const { v2: cloudinary } = require('cloudinary');
const prisma = require('../src/config/database').default;
const { isSandboxEnvironment } = require('../src/utils/sandboxGuard');

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}/api/serials/public`;
const SERIALS = ['TRUTESTACT1', 'TRUTESTACT2', 'TRUTESTACT3', 'TRUTESTACT4'];
const PHONE = '0900000917';
// JPEG 1x1 px
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

const uploadedPublicIds = [];
async function upload() {
  const form = new FormData();
  form.append('image', new Blob([JPEG], { type: 'image/jpeg' }), 'invoice.jpg');
  const r = await fetch(`${BASE}/upload-invoice`, { method: 'POST', body: form });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.url) throw new Error(`upload-invoice lỗi ${r.status}: ${JSON.stringify(body)}`);
  uploadedPublicIds.push(body.publicId);
  return body.url;
}

async function activate(serialNumber, invoiceImageUrl, customerPhone = PHONE) {
  const r = await fetch(`${BASE}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serialNumber, customerName: 'Test Kích Hoạt', customerPhone, address: '1 Test', province: 'Hồ Chí Minh', invoiceImageUrl })
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { title: 'Khách hàng kích hoạt bảo hành', content: { contains: 'TRUTESTACT' } } });
  await prisma.znsMessageLog.deleteMany({ where: { phone: { contains: PHONE.slice(1) } } }).catch(() => {});
  await prisma.serial.deleteMany({ where: { serialNumber: { in: SERIALS } } });
  for (const id of uploadedPublicIds) await cloudinary.uploader.destroy(id).catch(() => {});
}

async function main() {
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  console.log(`DB: ${dbName} · API: ${BASE}`);
  if (!isSandboxEnvironment() || !/sandbox/.test(dbName)) throw new Error('Script này ghi dữ liệu: chỉ chạy trên sandbox');
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });

  await cleanup();
  await prisma.serial.createMany({ data: SERIALS.map(serialNumber => ({ serialNumber, model: 'GU-Q5112', status: 'Chưa kích hoạt' })) });

  try {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const fakeUrl = `https://res.cloudinary.com/${cloud}/image/upload/v1/truliva_invoices/${Date.now()}-123456789.jpg`;
    const r1 = await activate(SERIALS[0], fakeUrl);
    check(r1.status === 400, `URL đúng định dạng nhưng ảnh không có thật → 400 (${r1.status})`);
    const r2 = await activate(SERIALS[0], 'https://example.com/invoice.jpg');
    check(r2.status === 400, `Ảnh ở domain khác → 400 (${r2.status})`);

    const old = await prisma.serial.findFirst({ where: { invoiceImageUrl: { contains: '/truliva_invoices/' }, serialNumber: { notIn: SERIALS } }, select: { invoiceImageUrl: true } });
    if (old) {
      const r3 = await activate(SERIALS[0], old.invoiceImageUrl);
      check(r3.status === 400, `Ảnh hoá đơn cũ của serial khác → 400 (${r3.status})`);
    }

    const u1 = await upload();
    const r4 = await activate(SERIALS[0], u1, '12345');
    check(r4.status === 400, `SĐT không đủ 10 số → 400 (${r4.status})`);

    const ok1 = await activate(SERIALS[0], u1);
    check(ok1.status === 200 && ok1.body?.success, `Khách thật: ảnh vừa upload + SĐT hợp lệ → 200 (${ok1.status} ${ok1.body?.error || ''})`);
    const s1 = await prisma.serial.findUnique({ where: { serialNumber: SERIALS[0] }, select: { status: true, activatedBy: true } });
    check(s1?.status === 'Đã kích hoạt' && s1?.activatedBy === 'CUSTOMER', `  serial chuyển "Đã kích hoạt", activatedBy=CUSTOMER (${s1?.status})`);

    const r5 = await activate(SERIALS[1], u1);
    check(r5.status === 400, `Dùng lại ảnh vừa kích hoạt cho serial khác → 400 (${r5.status})`);

    const ok2 = await activate(SERIALS[1], await upload());
    const ok3 = await activate(SERIALS[2], await upload());
    check(ok2.status === 200 && ok3.status === 200, `Lần 2, 3 cùng SĐT trong 24h → 200 (${ok2.status}, ${ok3.status})`);
    const r6 = await activate(SERIALS[3], await upload());
    check(r6.status === 429 && /24 giờ/.test(r6.body?.error || ''), `Lần 4 cùng SĐT trong 24h → 429 theo SĐT (${r6.status} ${r6.body?.error || ''})`);
  } finally {
    await cleanup();
    const left = await prisma.serial.count({ where: { serialNumber: { in: SERIALS } } });
    check(left === 0, `Đã dọn dữ liệu test (${uploadedPublicIds.length} ảnh Cloudinary, serial còn lại: ${left})`);
  }

  console.log(failures ? `\n❌ ${failures} kiểm tra lỗi` : '\n✅ Tất cả đạt');
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
