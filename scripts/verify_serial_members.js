// Verify tính năng "người dùng chung máy" của Zalo Mini App.
// Mặc định CHỈ ĐỌC (chạy được trên production): route có mặt, chặn khi không đăng nhập, đường tắt SĐT thô đã đóng.
// --write: CHỈ SANDBOX. Tạo khách/serial tạm, chạy luồng chủ máy thêm → người nhà xem → người lạ bị chặn → rời máy, rồi xoá dữ liệu tạm.
// Chạy trên VPS trong thư mục dự án: node scripts/verify_serial_members.js [--write]
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const prisma = require('../dist/config/database').default;

const DB = (process.env.DATABASE_URL || '').split('/').pop().split('?')[0];
const BASE = `http://127.0.0.1:${process.env.PORT || 3000}/api/zalo-miniapp`;
const SECRET = process.env.ZALO_MINIAPP_JWT_SECRET || process.env.JWT_SECRET;
let fail = 0;
const expect = (label, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${label}: ${got} (mong đợi ${want})`); };
const call = async (p, token, opt = {}) => {
  const r = await fetch(BASE + p, { ...opt, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const tokenFor = (u) => jwt.sign({ id: u.id, role: 'CUSTOMER', group: 'CUSTOMER' }, SECRET, { audience: 'truliva-miniapp', expiresIn: '5m' });

(async () => {
  console.log('DB:', DB);
  expect('thêm người khi chưa đăng nhập', (await call('/serial-members', null, { method: 'POST', body: '{}' })).s, 401);
  // Số thô không còn được chấp nhận: Zalo trả lỗi giải mã → 400/401/500, không bao giờ 200
  const raw = await call('/auth', null, { method: 'POST', body: JSON.stringify({ phoneToken: '0900000001' }) });
  expect('đăng nhập bằng SĐT thô bị từ chối', raw.s !== 200, true);

  if (process.argv.includes('--write')) {
    if (!DB.includes('sandbox')) { console.error('Từ chối --write: DB không phải sandbox'); process.exit(2); }
    const tag = `zz_share_${Date.now()}`;
    const mk = (n, phone) => prisma.user.create({ data: { username: `${tag}_${n}`, passwordHash: 'x', fullName: `ZZ ${n}`, role: 'KTV', group: 'CUSTOMER', phoneNumber: phone } });
    const [owner, family, stranger] = [await mk('owner', '0399000101'), await mk('family', '0399000102'), await mk('stranger', '0399000103')];
    const serial = await prisma.serial.create({ data: { serialNumber: `${tag}_SN`, model: 'Máy lọc nước ZZ TEST', status: 'Đã kích hoạt', customerPhone: '0399000101', customerName: 'ZZ CHỦ MÁY', address: 'ĐỊA CHỈ RIÊNG' } });
    try {
      const [tOwner, tFamily, tStranger] = [owner, family, stranger].map(tokenFor);
      let mine = (await call('/my-serials', tOwner)).j.serials || [];
      const own = mine.find(s => s.id === serial.id);
      expect('chủ máy thấy canShare', own?.canShare, true);
      expect('người nhà chưa thấy máy', ((await call('/my-serials', tFamily)).j.serials || []).some(s => s.id === serial.id), false);

      expect('SĐT sai định dạng', (await call('/serial-members', tOwner, { method: 'POST', body: JSON.stringify({ serialId: serial.id, phone: '12345' }) })).s, 400);
      expect('thêm chính số chủ máy', (await call('/serial-members', tOwner, { method: 'POST', body: JSON.stringify({ serialId: serial.id, phone: '84399000101' }) })).s, 400);
      expect('người lạ thêm vào máy người khác', (await call('/serial-members', tStranger, { method: 'POST', body: JSON.stringify({ serialId: serial.id, phone: '0399000103' }) })).s, 403);
      const add = await call('/serial-members', tOwner, { method: 'POST', body: JSON.stringify({ serialId: serial.id, phone: '0399 000 102' }) });
      expect('chủ máy thêm người nhà', add.s, 200);
      expect('thêm trùng', (await call('/serial-members', tOwner, { method: 'POST', body: JSON.stringify({ serialId: serial.id, phone: '0399000102' }) })).s, 409);

      mine = (await call('/my-serials', tOwner)).j.serials || [];
      const m = mine.find(s => s.id === serial.id)?.members || [];
      expect('chủ máy thấy người nhà (kèm tên)', m.length === 1 && m[0].name === 'ZZ family', true);

      const fam = ((await call('/my-serials', tFamily)).j.serials || []).find(s => s.id === serial.id);
      expect('người nhà thấy máy (isShared)', fam?.isShared, true);
      expect('người nhà không thấy tên/SĐT/địa chỉ chủ máy', !!fam && !('customerName' in fam) && !('customerPhone' in fam) && !('address' in fam) && !('members' in fam), true);
      expect('SĐT chủ máy bị che', fam?.ownerPhoneMasked, '039••••101');
      expect('người nhà không thêm được người khác', (await call('/serial-members', tFamily, { method: 'POST', body: JSON.stringify({ serialId: serial.id, phone: '0399000103' }) })).s, 403);
      expect('người lạ không gỡ được', (await call(`/serial-members/${add.j.member.id}`, tStranger, { method: 'DELETE' })).s, 403);
      expect('người nhà tự rời máy', (await call(`/serial-members/${fam.membershipId}`, tFamily, { method: 'DELETE' })).s, 200);
      expect('người nhà không còn thấy máy', ((await call('/my-serials', tFamily)).j.serials || []).some(s => s.id === serial.id), false);

      // Thu hồi token Mini App cấp trước MINIAPP_TOKEN_NOT_BEFORE
      const nb = Number(process.env.MINIAPP_TOKEN_NOT_BEFORE || 0);
      if (nb > 0) {
        const old = jwt.sign({ id: owner.id, role: 'CUSTOMER', group: 'CUSTOMER', iat: nb - 60 }, SECRET, { audience: 'truliva-miniapp', expiresIn: '5m' });
        expect('token Mini App cấp trước mốc thu hồi', (await call('/my-serials', old)).s, 401);
      }
    } finally {
      await prisma.serialMember.deleteMany({ where: { serialId: serial.id } });
      await prisma.serial.delete({ where: { id: serial.id } });
      await prisma.user.deleteMany({ where: { username: { startsWith: tag } } });
      console.log('Dữ liệu tạm còn lại:', await prisma.user.count({ where: { username: { startsWith: 'zz_share_' } } }));
    }
  }
  await prisma.$disconnect();
  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
