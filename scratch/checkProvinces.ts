import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const startDate = '2025-12-31';
  const endDate = '2026-06-29';

  const orders = await prisma.order.findMany({
    where: {
      appointmentTime: {
        not: null,
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    },
    include: {
      customer: true
    }
  });

  console.log('Total orders:', orders.length);

  const provinceCounts: Record<string, number> = {};
  orders.forEach(o => {
    let provName = o.customer?.provinceName || (o.shippingAddress as any)?.province_name || 'Khác';
    provName = provName.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();
    provinceCounts[provName] = (provinceCounts[provName] || 0) + 1;
  });

  console.log('Province counts:', provinceCounts);
  const sum = Object.values(provinceCounts).reduce((a, b) => a + b, 0);
  console.log('Sum of provinces:', sum);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
