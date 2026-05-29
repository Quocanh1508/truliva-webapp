import 'dotenv/config';
import prisma from '../src/config/database';

async function main() {
  try {
    const order = await prisma.order.findUnique({
      where: { pancakeOrderId: 2686 },
      include: {
        customer: true
      }
    });
    console.log(JSON.stringify(order, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
