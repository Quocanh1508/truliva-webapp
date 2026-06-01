import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const allOrders = await prisma.order.findMany({
    select: {
      id: true,
      adminStatus: true,
      appointmentTime: true
    }
  });

  const nullAppointmentCount = allOrders.filter(o => o.appointmentTime === null).length;
  const nonNullAppointmentCount = allOrders.filter(o => o.appointmentTime !== null).length;

  console.log('Total orders:', allOrders.length);
  console.log('Orders with null appointmentTime:', nullAppointmentCount);
  console.log('Orders with non-null appointmentTime:', nonNullAppointmentCount);

  // Grouped by adminStatus for null appointments
  const nullGrouped: Record<string, number> = {};
  allOrders.filter(o => o.appointmentTime === null).forEach(o => {
    const status = String(o.adminStatus);
    nullGrouped[status] = (nullGrouped[status] || 0) + 1;
  });
  console.log('AdminStatus for null appointmentTime:', nullGrouped);

  // Grouped by adminStatus for non-null appointments
  const nonNullGrouped: Record<string, number> = {};
  allOrders.filter(o => o.appointmentTime !== null).forEach(o => {
    const status = String(o.adminStatus);
    nonNullGrouped[status] = (nonNullGrouped[status] || 0) + 1;
  });
  console.log('AdminStatus for non-null appointmentTime:', nonNullGrouped);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
