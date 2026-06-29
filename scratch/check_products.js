const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const products = await prisma.product.findMany({
      where: {
        name: {
          in: ['Lõi lọc CTO Truliva UR5840', 'Lõi lọc PGP Truliva UR5840']
        }
      }
    });

    console.log('=== PRODUCTS ===');
    console.log(JSON.stringify(products, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
