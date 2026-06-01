import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const allOrders = await prisma.order.findMany({
    where: {
      OR: [
        { statusCode: { not: 0 } },
        { statusCode: null }
      ]
    },
    select: {
      id: true,
      pancakeOrderId: true,
      pancakeCreatedAt: true,
      createdAt: true,
      adminStatus: true
    }
  });

  console.log('Total confirmed orders in DB:', allOrders.length);

  const startDate = new Date('2025-12-31T00:00:00.000Z');
  const endDate = new Date('2026-06-29T23:59:59.999Z');

  const outsideRange = allOrders.filter(o => {
    if (!o.pancakeCreatedAt) return true; // if null, check
    const date = new Date(o.pancakeCreatedAt);
    return date < startDate || date > endDate;
  });

  console.log('Confirmed orders outside range 2025-12-31 to 2026-06-29:', outsideRange.length);
  console.log('Outside range orders detail:', outsideRange);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
