// Verify (chỉ đọc, chỉ GET): mỗi route trả 200 hay 403 đúng theo ma trận quyền của từng role.
// Mong đợi tính bằng checkDynamicPermission (cho qua nếu có ít nhất 1 key). Chạy trên VPS: node scripts/verify_route_permissions.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const prisma = require('../dist/config/database').default;
const { checkDynamicPermission } = require('../dist/middleware/authSession');

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}/api`;
const ROLES = ['ADMIN', 'COORDINATOR', 'HOTLINE', 'STAFF', 'SALE_SUPERVISOR', 'SALER', 'KTV'];

(async () => {
  console.log('DB:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0]);
  const id = async (model) => (await prisma[model].findFirst({ select: { id: true } }))?.id;
  const [order, ticket, report] = [await id('order'), await id('hotlineTicket'), await id('serviceReport')];
  const ROUTES = [
    ['/orders?limit=1', ['ORDER_VIEW', 'REPORT_CREATE']],
    ['/orders/filters-data', ['ORDER_VIEW', 'REPORT_CREATE']],
    ['/orders/customers/search?phone=0900000000', ['ORDER_VIEW', 'ORDER_CREATE']],
    [`/orders/${order}`, ['ORDER_VIEW', 'REPORT_CREATE']],
    [`/orders/${order}/audit`, ['ORDER_AUDIT_LOG']],
    ['/hotlines?limit=1', ['HOTLINE_TICKET_VIEW']],
    ['/hotlines/filter-options', ['HOTLINE_TICKET_VIEW']],
    ['/hotlines/handlers', ['HOTLINE_TICKET_VIEW', 'HOTLINE_TICKET_CREATE']],
    ['/hotlines/search-customer?phone=0900000000', ['HOTLINE_SEARCH_CUSTOMER', 'HOTLINE_TICKET_CREATE', 'HOTLINE_TICKET_VIEW']],
    ['/reports?limit=1', ['REPORT_VIEW', 'REPORT_CREATE']],
    ['/reports/my-stats', ['REPORT_CREATE', 'ORDER_VIEW']],
    ['/reports/filter-options', ['REPORT_VIEW']],
    ['/reports/check-serial?serialNumber=X', ['REPORT_CREATE', 'ORDER_VIEW']],
    ['/inventory/analytics', ['INVENTORY_VIEW'], ['KTV']], // KTV luôn xem được kho của mình
    ['/users/ktvs', ['ORDER_VIEW', 'DASHBOARD_VIEW', 'ORDER_ASSIGN_KTV']],
  ];
  // Chỉ kiểm tra "thiếu quyền → 403" (bị chặn trước handler). Có quyền thì KHÔNG gọi: controller còn lọc theo role,
  // và export dựng cả file trong RAM (gọi liên tục từng làm PM2 restart vì vượt max-memory-restart).
  const EXTRA = [
    [`/hotlines/${ticket}`, ['HOTLINE_TICKET_VIEW']],
    ['/orders/export', ['ORDER_EXPORT_EXCEL']],
    ['/users', ['USER_MANAGE', 'USER_PERMISSIONS_MATRIX']],
    [`/reports/${report}`, ['REPORT_VIEW', 'REPORT_CREATE']],
  ];

  let fail = 0;
  for (const role of ROLES) {
    // KTV phải có kho được gán, nếu không /inventory/analytics trả 403 từ handler (không phải do quyền)
    const u = await prisma.user.findFirst({ where: { role, isActive: true, OR: [{ group: null }, { NOT: { group: 'CUSTOMER' } }], ...(role === 'KTV' ? { warehouseId: { not: null } } : {}) }, select: { id: true, role: true, group: true } });
    if (!u) { console.log(`- ${role}: không có user`); continue; }
    const token = jwt.sign({ id: u.id, role: u.role, group: u.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const line = [];
    for (const [p, keys, alwaysRoles = []] of [...ROUTES, ...EXTRA]) {
      if (p.includes('undefined')) continue;
      let allowed = alwaysRoles.includes(u.role);
      for (const k of keys) if (await checkDynamicPermission(u.role, k, u.group, u.id)) { allowed = true; break; }
      const strict = ROUTES.some(([q]) => q === p);
      if (allowed && !strict) continue;
      const r = await fetch(BASE + p, { headers: { Authorization: `Bearer ${token}` } });
      await r.body?.cancel();
      const ok = allowed ? r.status === 200 : r.status === 403;
      if (!ok) { fail++; line.push(`✗ ${p} ${r.status} (quyền=${allowed})`); }
    }
    console.log(`${line.length ? '✗' : '✓'} ${role}/${u.group || '-'}${line.length ? '\n    ' + line.join('\n    ') : ''}`);
  }
  await prisma.$disconnect();
  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
