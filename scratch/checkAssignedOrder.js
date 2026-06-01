const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.order.findFirst({
    where: { adminStatus: 'đang thực hiện' }
  });
  console.log('Order with status "đang thực hiện":', order);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
