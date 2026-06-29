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
      select: {
        id: true,
        pancakeOrderId: true,
        adminStatus: true,
        pancakeSyncStatus: true,
      }
    });

    console.log('=== ORDER STATUS ===');
    console.log(JSON.stringify(order, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
