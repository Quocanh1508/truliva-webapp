import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const ktv = await prisma.user.findFirst({
    where: { fullName: { contains: 'Phan Duy Minh', mode: 'insensitive' } }
  });

  if (!ktv) {
    console.log('KTV not found');
    return;
  }

  const orders = await prisma.order.findMany({
    where: {
      assignedKtvId: ktv.id,
      createdAt: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      }
    },
    include: {
      serviceReports: {
        orderBy: { createdAt: 'asc' },
        take: 1
      }
    }
  });

  const start = new Date('2026-06-01T00:00:00.000Z');
  const end = new Date('2026-06-05T23:59:59.999Z');

  console.log(`Analyzing ${orders.length} orders:`);
  orders.forEach((order, index) => {
    const hasReport = order.serviceReports && order.serviceReports.length > 0;
    const isCompleted = order.adminStatus === 'hoàn thành' || hasReport;
    
    let filterDate: Date;
    let filterSource = '';
    if (isCompleted) {
      if (hasReport) {
        filterDate = order.serviceReports[0].createdAt;
        filterSource = 'Report CreatedAt';
      } else {
        filterDate = order.updatedAt;
        filterSource = 'Order UpdatedAt';
      }
    } else {
      if (order.appointmentTime) {
        filterDate = order.appointmentTime;
        filterSource = 'AppointmentTime';
      } else {
        filterDate = order.createdAt;
        filterSource = 'CreatedAt';
      }
    }

    const inRange = filterDate >= start && filterDate <= end;
    console.log(`${index + 1}. Order #${order.pancakeOrderId}`);
    console.log(`   adminStatus: ${order.adminStatus}`);
    console.log(`   isCompleted: ${isCompleted} | hasReport: ${hasReport}`);
    console.log(`   filterDate: ${filterDate.toISOString()} (from ${filterSource})`);
    console.log(`   In Range (Jun 1 - Jun 5): ${inRange}`);
  });
}

run();
