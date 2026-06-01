import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const counts = await prisma.order.groupBy({
    by: ['adminStatus'],
    _count: { id: true }
  });
  console.log('AdminStatus counts:', counts);

  const total = await prisma.order.count();
  console.log('Total orders count:', total);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
