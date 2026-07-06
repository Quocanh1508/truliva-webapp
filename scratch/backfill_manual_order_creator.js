/**
 * Backfill rawData.creator cho các đơn thủ công đã tạo trước đó.
 * Lấy thông tin người tạo từ auditLog (action: 'created_manual').
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Tìm tất cả auditLog action 'created_manual'
  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: 'Order',
      action: 'created_manual'
    },
    select: {
      entityId: true,
      userId: true,
      userName: true
    }
  });

  console.log(`Found ${logs.length} manual order creation logs`);

  let updated = 0;
  for (const log of logs) {
    const order = await prisma.order.findUnique({
      where: { id: log.entityId },
      select: { id: true, rawData: true, pancakeOrderId: true }
    });

    if (!order) continue;

    // Nếu rawData đã có creator thì bỏ qua
    const existing = typeof order.rawData === 'object' && order.rawData !== null ? order.rawData : {};
    if (existing.creator) {
      console.log(`  Order ${order.pancakeOrderId}: already has creator, skip`);
      continue;
    }

    // Lấy thêm role từ User table
    const user = await prisma.user.findUnique({
      where: { id: log.userId },
      select: { role: true }
    });

    const newRawData = {
      ...existing,
      creator: {
        id: log.userId,
        name: log.userName,
        role: user?.role || 'UNKNOWN'
      }
    };

    await prisma.order.update({
      where: { id: order.id },
      data: { rawData: newRawData }
    });

    updated++;
    console.log(`  ✅ Order M${Math.abs(order.pancakeOrderId)}: set creator = ${log.userName}`);
  }

  console.log(`\nDone! Updated ${updated}/${logs.length} orders.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
