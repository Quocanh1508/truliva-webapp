const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const order = await prisma.order.findFirst({
      where: {
        pancakeOrderId: 3269
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
      where: { entityId: order.id },
      orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(logs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
