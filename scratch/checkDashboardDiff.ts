import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const startDate = '2025-12-31';
  const endDate = '2026-06-29';

  // getDashboardStats conditions
  const whereStats: any = {
    appointmentTime: {
      not: null,
      gte: new Date(startDate),
      lte: new Date(endDate)
    }
  };

  const ordersStats = await prisma.order.findMany({
    where: whereStats,
    select: { id: true, pancakeOrderId: true }
  });

  // getDispatchAnalysis conditions
  const whereAnalysis: any = {
    appointmentTime: {
      not: null,
      gte: new Date(startDate),
      lte: new Date(endDate)
    }
  };

  const ordersAnalysis = await prisma.order.findMany({
    where: whereAnalysis,
    select: { id: true, pancakeOrderId: true }
  });

  console.log('Orders stats count:', ordersStats.length);
  console.log('Orders analysis count:', ordersAnalysis.length);

  const statsIds = new Set(ordersStats.map(o => o.id));
  const analysisIds = new Set(ordersAnalysis.map(o => o.id));

  const onlyInStats = ordersStats.filter(o => !analysisIds.has(o.id));
  const onlyInAnalysis = ordersAnalysis.filter(o => !statsIds.has(o.id));

  console.log('Only in stats count:', onlyInStats.length);
  console.log('Only in analysis count:', onlyInAnalysis.length);

  if (onlyInStats.length > 0) {
    console.log('Sample only in stats:', onlyInStats.slice(0, 5));
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
