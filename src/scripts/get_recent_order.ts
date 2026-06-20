import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const order = await prisma.order.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log('Recent order:', order ? { id: order.id, pancakeOrderId: order.pancakeOrderId, workType: order.workType, warehouseId: order.warehouseId } : 'none');
}

run();
