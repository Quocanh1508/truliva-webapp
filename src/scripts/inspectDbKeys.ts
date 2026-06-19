import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const order = await prisma.order.findFirst({
    where: { pancakeOrderId: 3135 }
  });
  if (order) {
    console.log('Order keys:', Object.keys(order));
    console.log('typeof order.rawData:', typeof order.rawData);
    console.log('order.rawData keys:', order.rawData ? Object.keys(order.rawData as any) : 'null');
    console.log('order.pancakeCreatedAt:', order.pancakeCreatedAt);
  } else {
    console.log('Order 3135 not found');
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
