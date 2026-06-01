import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const allOrders = await prisma.order.findMany({
    select: {
      id: true,
      statusCode: true,
      adminStatus: true
    }
  });

  const combinations: Record<string, number> = {};
  allOrders.forEach(o => {
    const key = `statusCode: ${o.statusCode} | adminStatus: ${o.adminStatus}`;
    combinations[key] = (combinations[key] || 0) + 1;
  });

  console.log('Combinations of statusCode and adminStatus in DB:');
  console.log(combinations);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
