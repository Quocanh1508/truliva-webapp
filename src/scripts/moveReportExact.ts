import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const order3050 = await prisma.order.findFirst({
    where: { pancakeOrderId: 3050 }
  });

  const order3068 = await prisma.order.findFirst({
    where: { pancakeOrderId: 3068 }
  });

  if (!order3050 || !order3068) {
    console.error('Order 3050 or 3068 not found!');
    return;
  }

  // Find reports for 3050
  const reports = await prisma.serviceReport.findMany({
    where: { orderId: order3050.id }
  });

  if (reports.length === 0) {
    console.error('No reports found for order 3050!');
    return;
  }

  console.log(`Found ${reports.length} report(s) on order 3050.`);
  console.log('Starting transaction to update database...');

  const result = await prisma.$transaction(async (tx) => {
    // 1. Move the service report(s)
    const reportIds = reports.map(r => r.id);
    const updatedReports = await tx.serviceReport.updateMany({
      where: { id: { in: reportIds } },
      data: { orderId: order3068.id }
    });

    // 2. Update order 3068 assignments
    const updatedOrder = await tx.order.update({
      where: { id: order3068.id },
      data: {
        assignedKtvId: order3068.assignedKtvId || order3050.assignedKtvId,
        workType: order3068.workType || order3050.workType || 'Bảo hành',
        serviceType: order3068.serviceType || order3050.serviceType || 'Thiết bị không hoạt động',
        mainStationId: order3068.mainStationId || order3050.mainStationId,
        techStationId: order3068.techStationId || order3050.techStationId,
      }
    });

    return {
      updatedReportsCount: updatedReports.count,
      updatedOrder
    };
  });

  console.log('Transaction completed successfully!');
  console.log('Result:', JSON.stringify(result, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
