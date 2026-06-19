import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const order = await prisma.order.findFirst({
    where: { pancakeOrderId: 3135 }
  });
  console.log('Order 3135 from Database:', JSON.stringify(order, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
