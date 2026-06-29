const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: 3269 },
          { pancakeOrderId: 3269 }
        ]
      },
      include: {
        items: true,
        serviceReports: true
      }
    });

    if (!order) {
      console.log('Order not found.');
      return;
    }

    console.log('=== ORDER INFO ===');
    console.log(JSON.stringify(order, null, 2));

    console.log('\n=== AUDIT LOGS ===');
    const logs = await prisma.auditLog.findMany({
      where: { entityId: order.id.toString() },
      orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(logs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
