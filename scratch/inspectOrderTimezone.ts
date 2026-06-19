import dotenv from 'dotenv';
dotenv.config();
import prisma from '../src/config/database';

async function main() {
  const order = await prisma.order.findUnique({
    where: { pancakeOrderId: 3135 },
    select: {
      pancakeOrderId: true,
      pancakeCreatedAt: true,
      rawData: true
    }
  });

  if (!order) {
    console.log('Order 3135 not found');
    return;
  }

  const raw: any = order.rawData;
  console.log('pancakeOrderId:', order.pancakeOrderId);
  console.log('pancakeCreatedAt in DB (UTC):', order.pancakeCreatedAt);
  console.log('raw.inserted_at:', raw?.inserted_at);
  console.log('raw.updated_at:', raw?.updated_at);
  console.log('raw.created_at:', raw?.created_at);
}

main().catch(console.error).finally(() => prisma.$disconnect());
