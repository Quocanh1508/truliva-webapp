import dotenv from 'dotenv';
dotenv.config();
import prisma from '../src/config/database';

async function test() {
  const sortBy: any = 'createdAt';
  const sortOrder: any = 'desc';

  // Build the sorting conditions exactly like in src/routes/orders.ts
  const orderBy: any = {};
  const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';

  if (sortBy === 'appointmentTime') {
    orderBy.appointmentTime = orderDirection;
  } else if (sortBy === 'updatedAt') {
    orderBy.updatedAt = orderDirection;
  } else {
    orderBy.pancakeCreatedAt = orderDirection;
  }

  console.log('Sending orderBy:', orderBy);

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { statusCode: { not: 0 } },
        { statusCode: null },
        { pancakeOrderId: { lt: 0 } }
      ]
    },
    orderBy,
    take: 10,
    select: {
      id: true,
      pancakeOrderId: true,
      pancakeCreatedAt: true,
      createdAt: true,
      statusCode: true
    }
  });

  console.log('Results:');
  orders.forEach(o => {
    console.log(`pancakeOrderId: ${o.pancakeOrderId}, pancakeCreatedAt: ${o.pancakeCreatedAt}, createdAt: ${o.createdAt}, statusCode: ${o.statusCode}`);
  });
}

test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
