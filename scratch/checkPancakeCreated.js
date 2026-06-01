const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const all = await prisma.order.findMany({ select: { pancakeCreatedAt: true } });
  const nullCount = all.filter(o => o.pancakeCreatedAt === null).length;
  console.log('pancakeCreatedAt null count:', nullCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
