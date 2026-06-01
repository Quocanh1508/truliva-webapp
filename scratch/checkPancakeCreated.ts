import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function main() {
  const nullPancakeCreated = await prisma.order.count({
    where: { pancakeCreatedAt: null }
  });
  console.log('Orders with null pancakeCreatedAt:', nullPancakeCreated);

  const nullCreated = await prisma.order.count({
    where: { createdAt: null }
  });
  console.log('Orders with null createdAt:', nullCreated);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
