// Verify (chỉ đọc): đơn shop Mini App chỉ chủ đơn xem được, webhook thanh toán không nhận secret mặc định.
// Không gửi request nào có thể ghi dữ liệu: các lệnh POST chỉ gửi khi chắc chắn bị chặn trước handler.
// Chạy trên VPS trong thư mục dự án: node scripts/verify_shop_security.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const prisma = require('../dist/config/database').default;

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}/api/zalo-miniapp`;
const SECRET = process.env.ZALO_MINIAPP_JWT_SECRET || process.env.JWT_SECRET;
let fail = 0;
const expect = (label, got, want) => { const ok = Array.isArray(want) ? want.includes(got) : got === want; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${label}: ${got} (mong đợi ${want})`); };
const call = async (p, token, opt = {}) => {
  const r = await fetch(BASE + p, { ...opt, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opt.headers || {}) } });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const digits = (p) => (p || '').replace(/\D/g, '').replace(/^84/, '0');

(async () => {
  console.log('DB:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0]);
  const order = await prisma.shopOrder.findFirst({ orderBy: { createdAt: 'desc' }, select: { orderCode: true, customerPhone: true, zaloUserId: true } });

  expect('my-orders?phone= không đăng nhập', (await call('/shop/my-orders?phone=0')).s, 401);
  if (order) {
    expect('chi tiết đơn không đăng nhập', (await call(`/shop/orders/${order.orderCode}`)).s, 401);
    expect('đổi COD không đăng nhập', (await call(`/shop/orders/${order.orderCode}/switch-to-cod`, null, { method: 'POST' })).s, 401);
    // Sandbox cho chủ đơn tự giả lập thanh toán → người khác nhận 404; production chỉ admin → 401/403
    const isSandbox = String(process.env.PORT || '3000') === '3001' || process.env.IS_SANDBOX === 'true';
    expect('xác nhận thanh toán không phải admin/chủ đơn', (await call(`/shop/orders/${order.orderCode}/confirm-payment`, null, { method: 'POST' })).s, isSandbox ? 404 : [401, 403]);

    // Một khách Mini App khác (không phải chủ đơn): chỉ gọi GET
    const stranger = (await prisma.user.findMany({ where: { group: 'CUSTOMER', isActive: true, phoneNumber: { not: null } }, select: { id: true, phoneNumber: true }, take: 50 }))
      .find(u => u.id !== order.zaloUserId && digits(u.phoneNumber) !== digits(order.customerPhone));
    if (stranger) {
      const t = jwt.sign({ id: stranger.id, role: 'CUSTOMER', group: 'CUSTOMER' }, SECRET, { audience: 'truliva-miniapp', expiresIn: '5m' });
      expect('khách khác xem chi tiết đơn', (await call(`/shop/orders/${order.orderCode}`, t)).s, 404);
      const mine = await call('/shop/my-orders?phone=' + digits(order.customerPhone), t);
      expect('khách khác truyền ?phone= của chủ đơn', mine.s === 200 && !(mine.j.orders || []).some(o => o.orderCode === order.orderCode), true);
    }
  }

  // Webhook: secret mặc định cũ (trong lịch sử git) và secret qua query đều phải bị từ chối, body rỗng nên không ghi gì
  const configured = !!(process.env.PAYMENT_WEBHOOK_SECRET || process.env.SEPAY_WEBHOOK_KEY);
  const wh = await call('/shop/payment/webhook?secret=truliva_secure_pay_2026', null, { method: 'POST', body: '{}' });
  expect('webhook với secret mặc định cũ', wh.s, configured ? 401 : 503);
  const wh2 = await call('/shop/payment/webhook', null, { method: 'POST', body: '{}', headers: { 'secure-token': 'truliva_secure_pay_2026' } });
  expect('webhook với secret mặc định cũ qua header', wh2.s, configured ? 401 : 503);

  await prisma.$disconnect();
  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
