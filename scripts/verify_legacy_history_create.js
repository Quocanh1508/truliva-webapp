#!/usr/bin/env node
/**
 * Kiểm thử bảo mật & nghiệp vụ cho POST /api/hotlines/legacy-history
 * CHỈ chạy test ghi trên môi trường SANDBOX (chặn nếu DB là production).
 *
 *   node scripts/verify_legacy_history_create.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('ts-node/register/transpile-only');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/database').default;

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}/api/hotlines`;
let failures = 0;

function check(cond, label) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

async function postJson(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  console.log(`DB: ${dbName} · API: ${BASE}`);

  if (!dbName.toLowerCase().includes('sandbox')) {
    throw new Error(`Từ chối chạy test ghi dữ liệu trên DB không phải sandbox (${dbName}).`);
  }

  const validPayload = {
    customerName: 'Nguyễn Văn Test Bảo Mật',
    customerPhone: '0987654321',
    address: '123 Đường Test Bảo Mật, Phường 1, Quận 1',
    provinceName: 'Hồ Chí Minh',
    products: ['Máy lọc nước Delica UR5840'],
    workType: 'Lắp đặt',
    completedAt: new Date().toISOString(),
    legacyOrderCode: 'TEST-SEC-001',
    status: 'Hoàn thành',
    serviceType: 'Công việc đã bao gồm dịch vụ',
    moneyToCollect: 500000,
    mainStation: 'Trạm Test',
    techStation: 'Trạm KT Test',
    ktvName: 'KTV Test',
    serialNumber: 'TESTSN999888',
    parts: 'Lõi lọc thô',
    note: 'Test xác minh bảo mật và audit log',
    // Cố tình gửi trường nhạy cảm để test chống Mass Assignment
    importBatch: 'hacked_batch_should_be_ignored'
  };

  // 1. Chưa đăng nhập → 401
  const rUnauth = await postJson(`${BASE}/legacy-history`, validPayload, null);
  check(rUnauth.status === 401, `Chưa đăng nhập → 401 (HTTP ${rUnauth.status})`);

  // 2. Token khách hàng Zalo Mini App → 403
  const miniAppTok = jwt.sign(
    { id: '00000000-0000-0000-0000-000000000000', role: 'CUSTOMER', aud: 'truliva-miniapp' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  const rMini = await postJson(`${BASE}/legacy-history`, validPayload, miniAppTok);
  check(rMini.status === 403, `Token Zalo Mini App CUSTOMER → 403 (HTTP ${rMini.status})`);

  // 3. Role không được phép (KTV, STAFF) → 403
  for (const role of ['KTV', 'STAFF']) {
    const u = await prisma.user.findFirst({ where: { role, isActive: true }, select: { id: true, role: true, group: true, tokenVersion: true } });
    if (u) {
      const tok = jwt.sign({ id: u.id, role: u.role, group: u.group, tv: u.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '5m' });
      const r = await postJson(`${BASE}/legacy-history`, validPayload, tok);
      check(r.status === 403, `Role ${role} không có quyền → 403 (HTTP ${r.status})`);
    } else {
      console.log(`   (không có tài khoản ${role} active để test)`);
    }
  }

  // 4. Validation & Injection / Type Confusion checks với tài khoản ADMIN
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, group: true, tokenVersion: true } });
  if (!admin) throw new Error('Không tìm thấy tài khoản ADMIN active');
  const adminTok = jwt.sign({ id: admin.id, role: admin.role, group: admin.group, tv: admin.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const badCases = [
    ['Thiếu tên KH', { ...validPayload, customerName: '' }],
    ['SĐT 9 số', { ...validPayload, customerPhone: '098765432' }],
    ['SĐT không bắt đầu bằng 0', { ...validPayload, customerPhone: '1987654321' }],
    ['SĐT có khoảng trắng', { ...validPayload, customerPhone: '0987 654 321' }],
    ['Tỉnh/TP không hợp lệ', { ...validPayload, provinceName: 'Tỉnh Giả Mạo' }],
    ['Loại công việc ngoài allowlist', { ...validPayload, workType: 'HackWorkType' }],
    ['Trạng thái ngoài allowlist', { ...validPayload, status: 'HackStatus' }],
    ['Ngày hoàn thành sai định dạng', { ...validPayload, completedAt: 'not-a-date' }],
    ['Ngày hoàn thành tương lai xa', { ...validPayload, completedAt: '2099-01-01T00:00:00.000Z' }],
    ['Tiền thu âm', { ...validPayload, moneyToCollect: -100 }],
    ['Type confusion customerName object', { ...validPayload, customerName: { $ne: '' } }],
    ['Type confusion customerPhone array', { ...validPayload, customerPhone: ['0987654321'] }],
    ['Chuỗi quá dài > 200 ký tự', { ...validPayload, customerName: 'A'.repeat(250) }]
  ];

  for (const [label, payload] of badCases) {
    const r = await postJson(`${BASE}/legacy-history`, payload, adminTok);
    check(r.status === 400, `Input không hợp lệ (${label}) → 400 (HTTP ${r.status})`);
  }

  // 5. Tạo thành công với ADMIN
  const rOk = await postJson(`${BASE}/legacy-history`, validPayload, adminTok);
  check(rOk.status === 201 && !!rOk.body?.record?.id, `ADMIN tạo bản ghi hợp lệ → 201 (HTTP ${rOk.status})`);
  const rec = rOk.body?.record;
  if (rec) {
    check(rec.importBatch === 'manual_hotline_input', `Chống Mass Assignment: importBatch = "${rec.importBatch}"`);
    check(rec.customerPhone === '0987654321' && rec.provinceName === 'Hồ Chí Minh', 'Lưu đúng SĐT và Tỉnh/TP chuẩn hóa');

    // 6. Tra cứu lại qua search-customer
    const rSearch = await fetch(`${BASE}/search-customer?q=0987654321`, {
      headers: { Authorization: `Bearer ${adminTok}` }
    });
    const bSearch = await rSearch.json().catch(() => null);
    check(
      rSearch.status === 200 && bSearch?.legacyServiceHistory?.some((h) => h.id === rec.id),
      'Tra cứu GET /search-customer?q=0987654321 trả về bản ghi vừa tạo'
    );

    // 7. Kiểm tra AuditLog đã ghi nhận
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'LegacyServiceHistory', entityId: rec.id, action: 'created' }
    });
    check(!!audit && audit.userId === admin.id, 'AuditLog ghi nhận đầy đủ người tạo bản ghi');
  }
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures ? `\n❌ ${failures} lỗi` : '\n✅ Tất cả kiểm thử bảo mật & API đều PASS');
    process.exit(failures ? 1 : 0);
  });
