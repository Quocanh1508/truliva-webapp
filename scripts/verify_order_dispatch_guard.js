/**
 * Kiểm tra chốt bảo vệ phân công khi sửa đơn (sự cố đơn #6788: form cũ ghi đè kho/trạm).
 * CÓ GHI DỮ LIỆU -> chỉ chạy trên SANDBOX. Script tự khôi phục đơn test về trạng thái ban đầu.
 *
 *   node scripts/verify_order_dispatch_guard.js            (chọn đơn sandbox có KTV + trạm + kho)
 *   node scripts/verify_order_dispatch_guard.js <orderId>
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const PORT = process.env.PORT || 3001;
const BASE = `http://127.0.0.1:${PORT}/api`;

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const dbName = (await db.query('select current_database() d')).rows[0].d;
  console.log('DB:', dbName, '| API:', BASE);
  if (!dbName.includes('sandbox')) {
    console.error('❌ Script có ghi dữ liệu, chỉ được chạy trên sandbox.');
    process.exit(2);
  }

  const admin = (await db.query(`select id, role, "group" from users where role='ADMIN' limit 1`)).rows[0];
  const token = jwt.sign({ id: admin.id, role: admin.role, group: admin.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const put = async (id, body) => {
    const r = await fetch(`${BASE}/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`PUT ${r.status}: ${JSON.stringify(json)}`);
    return json;
  };
  const cols = `id, pancake_order_id, admin_status, assigned_ktv_id, main_station_id, tech_station_id, warehouse_id, work_type, service_type`;
  const load = async (id) => (await db.query(`select ${cols} from orders where id=$1`, [id])).rows[0];

  const orderId = process.argv[2] || (await db.query(`select id from orders
      where assigned_ktv_id is not null and main_station_id is not null and tech_station_id is not null
        and warehouse_id is not null and admin_status = 'đang thực hiện'
        and work_type is not null and service_type is not null
      order by updated_at desc limit 1`)).rows[0]?.id;
  if (!orderId) { console.error('Không tìm được đơn test phù hợp'); process.exit(1); }

  const before = await load(orderId);
  console.log('Đơn test:', before.pancake_order_id, before);
  let fail = 0;
  const check = (name, cond, extra) => { console.log(cond ? '✅' : '❌', name, extra !== undefined ? JSON.stringify(extra) : ''); if (!cond) fail++; };
  const same = (a, b, keys) => keys.every(k => a[k] === b[k]);
  const DISPATCH = ['assigned_ktv_id', 'main_station_id', 'tech_station_id', 'warehouse_id', 'admin_status'];

  try {
    // 1. Payload kiểu form CŨ của bản frontend trước (gửi trạm/KTV rỗng, không cờ gỡ) -> phải giữ trạm + KTV
    await put(orderId, {
      workType: before.work_type, serviceType: before.service_type,
      mainStationId: null, techStationId: null, assignedKtvId: null, adminStatus: 'chờ xử lý'
    });
    let after = await load(orderId);
    check('Form cũ gửi trạm/KTV rỗng -> giữ nguyên KTV, trạm, trạng thái', same(before, after, DISPATCH), after);

    // 2. Payload kiểu frontend MỚI khi chỉ sửa thông tin dịch vụ (không gửi trường điều phối)
    await put(orderId, { workType: before.work_type, serviceType: before.service_type });
    after = await load(orderId);
    check('Chỉ sửa thông tin dịch vụ -> kho/trạm/KTV không đổi', same(before, after, DISPATCH), after);

    // 3. Người dùng CỐ Ý gỡ KTV (có cờ isExplicitUnassign + gửi trạm rỗng) -> vẫn phải gỡ được
    await put(orderId, { assignedKtvId: null, isExplicitUnassign: true, mainStationId: null, techStationId: null, adminStatus: 'chờ xử lý' });
    after = await load(orderId);
    check('Gỡ KTV có chủ đích -> KTV + trạm được gỡ', !after.assigned_ktv_id && !after.main_station_id && !after.tech_station_id, after);
  } finally {
    // Khôi phục đơn test
    await put(orderId, {
      assignedKtvId: before.assigned_ktv_id, mainStationId: before.main_station_id,
      techStationId: before.tech_station_id, adminStatus: before.admin_status
    });
    const restored = await load(orderId);
    check('Khôi phục đơn test về trạng thái ban đầu', same(before, restored, DISPATCH), restored);
    await db.end();
  }
  console.log(fail ? `\n❌ ${fail} kiểm tra thất bại` : '\n✅ Tất cả kiểm tra đạt');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
