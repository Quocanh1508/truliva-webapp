import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const startDate = '2025-12-31';
  const endDate = '2026-06-29';

  const total = await prisma.order.count({
    where: {
      pancakeCreatedAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }
  });

  const statuses = await prisma.order.groupBy({
    by: ['adminStatus'],
    where: {
      pancakeCreatedAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    },
    _count: { id: true }
  });

  console.log('Total orders by pancakeCreatedAt:', total);
  console.log('Statuses by pancakeCreatedAt:', statuses);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
