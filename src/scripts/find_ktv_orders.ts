import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  // Find KTV user by name
  const ktv = await prisma.user.findFirst({
    where: { fullName: { contains: 'Phan Duy Minh', mode: 'insensitive' } }
  });

  if (!ktv) {
    console.log('KTV Phan Duy Minh not found');
    return;
  }

  console.log(`KTV found: ${ktv.fullName} (ID: ${ktv.id}, Role: ${ktv.role})`);

  // Query all orders assigned to this KTV
  const allOrders = await prisma.order.findMany({
    where: { assignedKtvId: ktv.id },
    select: {
      id: true,
      pancakeOrderId: true,
      adminStatus: true,
      statusCode: true,
      statusName: true,
      createdAt: true
    }
  });

  console.log(`Total orders assigned to Phan Duy Minh (Admin view): ${allOrders.length}`);
  allOrders.forEach((o, index) => {
    console.log(`${index + 1}. Order #${o.pancakeOrderId} | adminStatus: ${o.adminStatus} | statusCode: ${o.statusCode} | statusName: ${o.statusName} | createdAt: ${o.createdAt}`);
  });

  // Query orders that KTV Phan Duy Minh sees (req.user?.role === 'KTV')
  const ktvVisibleOrders = await prisma.order.findMany({
    where: {
      assignedKtvId: ktv.id,
      OR: [
        { adminStatus: { notIn: ['hoàn thành', 'hủy đơn'] } },
        { adminStatus: null }
      ]
    },
    select: {
      id: true,
      pancakeOrderId: true,
      adminStatus: true,
      statusCode: true,
      statusName: true
    }
  });

  console.log(`\nOrders visible to KTV on dashboard: ${ktvVisibleOrders.length}`);
  ktvVisibleOrders.forEach((o, index) => {
    console.log(`${index + 1}. Order #${o.pancakeOrderId} | adminStatus: ${o.adminStatus} | statusCode: ${o.statusCode}`);
  });
}

run();
