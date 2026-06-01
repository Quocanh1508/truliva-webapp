import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const allOrders = await prisma.order.findMany({
    select: {
      id: true,
      statusCode: true,
      statusName: true,
      adminStatus: true,
      pancakeCreatedAt: true
    }
  });

  const statusCodeCounts: Record<string, number> = {};
  allOrders.forEach(o => {
    const code = String(o.statusCode);
    statusCodeCounts[code] = (statusCodeCounts[code] || 0) + 1;
  });
  console.log('Status code counts in DB:', statusCodeCounts);

  const statusNameCounts: Record<string, number> = {};
  allOrders.forEach(o => {
    const name = String(o.statusName);
    statusNameCounts[name] = (statusNameCounts[name] || 0) + 1;
  });
  console.log('Status name counts in DB:', statusNameCounts);

  const code0Orders = allOrders.filter(o => o.statusCode === 0);
  console.log('Total orders with statusCode 0:', code0Orders.length);
  console.log('Sample orders with statusCode 0:', code0Orders.slice(0, 5));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
