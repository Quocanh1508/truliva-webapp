// Verify (CÓ GHI DỮ LIỆU, chỉ chạy trên sandbox): webhook Pancake cập nhật cùng một đơn nhiều lần đều được xử lý,
// gửi lại đúng sự kiện thì bị chặn trùng, snapshot cũ hơn bản đã lưu thì bị bỏ qua. Cuối script trả ghi chú đơn về như cũ.
// Chạy trên VPS sandbox: node scripts/verify_webhook_dedupe.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const prisma = require('../dist/config/database').default;

const db = (process.env.DATABASE_URL || '').split('/').pop().split('?')[0];
if (!db.includes('sandbox')) { console.error('Từ chối: script này ghi dữ liệu, chỉ chạy trên sandbox. DB =', db); process.exit(1); }

const PORT = process.env.PORT || 3001;
const secret = (process.env.PANCAKE_WEBHOOK_SECRET || '').split(',')[0].trim();
const pancakeTime = (d) => d.toISOString().slice(0, 23); // Pancake gửi giờ UTC không kèm "Z"
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const post = async (body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/webhooks/pancake?secret=${encodeURIComponent(secret)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Host: 'trulivaofficial.com' }, body: JSON.stringify(body),
  });
  return (await r.json()).status;
};

(async () => {
  console.log('DB:', db);
  const order = await prisma.order.findFirst({
    where: { pancakeOrderId: { gt: 0 }, pancakeUpdatedAt: { not: null } },
    orderBy: { pancakeUpdatedAt: 'desc' },
    select: { id: true, pancakeOrderId: true, note: true, rawData: true, pancakeUpdatedAt: true },
  });
  if (!order?.rawData?.system_id) { console.error('Không tìm thấy đơn có rawData Pancake để thử'); process.exit(1); }
  console.log(`Đơn thử: ${order.pancakeOrderId}`);
  const read = async () => { await sleep(3000); return prisma.order.findUnique({ where: { id: order.id }, select: { note: true, pancakeUpdatedAt: true } }); };
  let fail = 0;
  const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name} → ${got}`); };
  const base = order.rawData;
  const t0 = Date.now();

  const u1 = { ...base, event_type: 'update', note: `[verify] cap nhat 1 ${t0}`, updated_at: pancakeTime(new Date(t0)) };
  check('cập nhật lần 1 được nhận', (await post(u1)) === 'received', 'ok');
  check('cập nhật lần 1 ghi vào đơn', (await read()).note === u1.note, 'note');

  check('gửi lại đúng sự kiện bị chặn trùng', (await post(u1)) === 'already_received', 'ok');

  const u2 = { ...base, event_type: 'update', note: `[verify] cap nhat 2 ${t0}`, updated_at: pancakeTime(new Date(t0 + 1000)) };
  check('cập nhật lần 2 cùng đơn được nhận (trước đây bị coi là trùng)', (await post(u2)) === 'received', 'ok');
  check('cập nhật lần 2 ghi vào đơn', (await read()).note === u2.note, 'note');

  const stale = { ...base, event_type: 'update', note: `[verify] snapshot cu ${t0}`, updated_at: pancakeTime(new Date(t0 - 3600 * 1000)) };
  check('snapshot cũ vẫn được nhận', (await post(stale)) === 'received', 'ok');
  check('snapshot cũ không ghi đè đơn', (await read()).note === u2.note, 'note');

  // Trả đơn về như cũ (ghi chú gốc), mốc mới nhất để không bị coi là snapshot cũ
  const restore = { ...base, event_type: 'update', updated_at: pancakeTime(new Date(t0 + 2000)) };
  await post(restore);
  check('trả ghi chú đơn về như cũ', (await read()).note === order.note, 'note');

  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
