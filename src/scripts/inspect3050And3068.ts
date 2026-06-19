import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const order3050 = await prisma.order.findFirst({
    where: { pancakeOrderId: 3050 },
    include: { items: true, serviceReports: true }
  });

  const order3068 = await prisma.order.findFirst({
    where: { pancakeOrderId: 3068 },
    include: { items: true, serviceReports: true }
  });

  console.log('Order 3050 details:', JSON.stringify({
    id: order3050?.id,
    pancakeOrderId: order3050?.pancakeOrderId,
    adminStatus: order3050?.adminStatus,
    workType: order3050?.workType,
    items: order3050?.items,
    serviceReports: order3050?.serviceReports
  }, null, 2));

  console.log('Order 3068 details:', JSON.stringify({
    id: order3068?.id,
    pancakeOrderId: order3068?.pancakeOrderId,
    adminStatus: order3068?.adminStatus,
    workType: order3068?.workType,
    items: order3068?.items,
    serviceReports: order3068?.serviceReports
  }, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
