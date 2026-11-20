// Verify (chỉ đọc): từ 11/2026 mỗi ca lương / đơn hoa hồng chỉ thuộc đúng 1 tháng; tháng cũ giữ nguyên số đã tính.
// Chạy trên VPS: node scripts/verify_salary_month_isolation.js --save <file>     (lấy mốc trước khi deploy)
//                node scripts/verify_salary_month_isolation.js --compare <file>  (sau deploy: tháng cũ phải y hệt mốc)
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const prisma = require('../dist/config/database').default;
const { computeFullSalariesForMonth } = require('../dist/services/salaryService');
const { computeCommissionsForMonth } = require('../dist/services/commissionService');

const MONTHS = Array.from({ length: 11 }, (_, i) => `${i + 1}/2026`);
const STRICT = new Set(['11/2026']);
const key = (y, m) => y * 12 + m;
const monthKey = (s) => {
  const r = String(s || '').trim().match(/^(\d{1,2})\/(\d{4})$|^(\d{4})-(\d{1,2})$/);
  return r ? key(Number(r[2] ?? r[3]), Number(r[1] ?? r[4])) : null;
};
const vnKey = (d) => {
  const s = new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  return key(Number(s.slice(0, 4)), Number(s.slice(5, 7)));
};

(async () => {
  console.log('DB:', (process.env.DATABASE_URL || '').split('/').pop().split('?')[0]);
  const [mode, file] = process.argv.slice(2);
  const snap = {};
  for (const m of MONTHS) {
    const sal = await computeFullSalariesForMonth(m);
    const com = await computeCommissionsForMonth(m);
    snap[m] = {
      salaryTotal: sal.reduce((s, k) => s + k.calculatedCost, 0),
      reportIds: sal.flatMap(k => k.cases.map(c => c.reportId)).sort(),
      commissionTotal: com.stats.totalFinalCommission,
      orderIds: com.commissions.map(c => c.orderId).sort(),
    };
    console.log(`${m}: lương ${snap[m].reportIds.length} ca = ${snap[m].salaryTotal} | hoa hồng ${snap[m].orderIds.length} đơn = ${snap[m].commissionTotal}`);
  }
  if (mode === '--save') { fs.writeFileSync(file, JSON.stringify(snap)); console.log('Đã lưu mốc:', file); process.exit(0); }

  let fail = 0;
  const bad = (msg) => { fail++; console.log('✗', msg); };

  // 1. Tháng strict: ca lương phải có month đúng tháng; đơn hoa hồng phải có tháng nghiệm thu đúng tháng
  for (const m of STRICT) {
    const target = monthKey(m);
    const reports = await prisma.serviceReport.findMany({ where: { id: { in: snap[m].reportIds } }, select: { id: true, month: true } });
    for (const r of reports) if (monthKey(r.month) !== target) bad(`${m} lương có ca ${r.id} month=${r.month}`);
    const orders = await prisma.order.findMany({
      where: { id: { in: snap[m].orderIds } },
      select: { id: true, pancakeOrderId: true, appointmentTime: true, pancakeCreatedAt: true, updatedAt: true,
        serviceReports: { where: { approvalStatus: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { month: true, createdAt: true } } },
    });
    for (const o of orders) {
      const r = o.serviceReports[0];
      const k = r ? (monthKey(r.month) ?? vnKey(r.createdAt)) : vnKey(o.appointmentTime || o.pancakeCreatedAt || o.updatedAt);
      if (k !== target) bad(`${m} hoa hồng có đơn ${o.pancakeOrderId} thuộc tháng khác`);
    }
    console.log(`${m}: đã kiểm ${reports.length} ca lương, ${orders.length} đơn hoa hồng`);
  }

  // 2. Tháng cũ phải y hệt mốc; tháng strict in ra phần bị loại so với mốc
  if (mode === '--compare') {
    const base = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const m of MONTHS) {
      const a = base[m], b = snap[m];
      if (STRICT.has(m)) {
        const gone = (x, y) => x.filter(id => !y.includes(id));
        console.log(`${m}: bớt ${gone(a.reportIds, b.reportIds).length} ca lương, thêm ${gone(b.reportIds, a.reportIds).length}; bớt ${gone(a.orderIds, b.orderIds).length} đơn hoa hồng, thêm ${gone(b.orderIds, a.orderIds).length}`);
        continue;
      }
      if (JSON.stringify(a) !== JSON.stringify(b)) bad(`${m} khác mốc (tháng cũ không được đổi)`);
    }
  }
  console.log(fail ? `FAIL: ${fail}` : 'PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
