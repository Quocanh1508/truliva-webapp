import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

// Robust parsing logic
const parsePancakeDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  let normalized = String(dateStr).trim();
  
  if (!normalized.includes('T')) {
    normalized = normalized.replace(' ', 'T');
  }
  
  const dotIndex = normalized.indexOf('.');
  if (dotIndex !== -1) {
    let tzStart = normalized.length;
    for (let i = dotIndex + 1; i < normalized.length; i++) {
      const char = normalized[i];
      if (char === 'Z' || char === '+' || char === '-') {
        tzStart = i;
        break;
      }
    }
    const msPart = normalized.substring(dotIndex + 1, tzStart);
    const msNormalized = msPart.substring(0, 3).padEnd(3, '0');
    const tzPart = tzStart < normalized.length ? normalized.substring(tzStart) : 'Z';
    normalized = normalized.substring(0, dotIndex + 1) + msNormalized + tzPart;
  } else {
    if (!normalized.includes('Z') && !normalized.includes('+') && !normalized.includes('-')) {
      normalized = normalized + 'Z';
    }
  }
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? new Date(dateStr) : d;
};

async function run() {
  console.log('Fetching all orders with pancakeOrderId...');
  const orders = await prisma.order.findMany({
    where: {
      pancakeOrderId: {
        gt: 0
      }
    },
    select: {
      id: true,
      pancakeOrderId: true,
      pancakeCreatedAt: true,
      pancakeUpdatedAt: true,
      rawData: true
    }
  });

  console.log(`Found ${orders.length} orders. Comparing dates...`);
  
  let updateCount = 0;
  for (const order of orders) {
    const raw = order.rawData as any;
    if (!raw || !raw.inserted_at) {
      continue;
    }

    const correctCreatedAt = parsePancakeDate(raw.inserted_at);
    const correctUpdatedAt = parsePancakeDate(raw.updated_at);

    let needsUpdate = false;
    const updateData: any = {};

    if (correctCreatedAt && order.pancakeCreatedAt) {
      const diffMs = Math.abs(correctCreatedAt.getTime() - order.pancakeCreatedAt.getTime());
      if (diffMs > 1000) { // Difference greater than 1 second
        updateData.pancakeCreatedAt = correctCreatedAt;
        needsUpdate = true;
      }
    } else if (correctCreatedAt && !order.pancakeCreatedAt) {
      updateData.pancakeCreatedAt = correctCreatedAt;
      needsUpdate = true;
    }

    if (correctUpdatedAt && order.pancakeUpdatedAt) {
      const diffMs = Math.abs(correctUpdatedAt.getTime() - order.pancakeUpdatedAt.getTime());
      if (diffMs > 1000) {
        updateData.pancakeUpdatedAt = correctUpdatedAt;
        needsUpdate = true;
      }
    } else if (correctUpdatedAt && !order.pancakeUpdatedAt) {
      updateData.pancakeUpdatedAt = correctUpdatedAt;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await prisma.order.update({
        where: { id: order.id },
        data: updateData
      });
      updateCount++;
      if (updateCount % 100 === 0 || updateCount < 10) {
        console.log(`Updated Order #${order.pancakeOrderId}:`);
        console.log(`  CreatedAt: ${order.pancakeCreatedAt?.toISOString()} -> ${correctCreatedAt?.toISOString()}`);
        console.log(`  UpdatedAt: ${order.pancakeUpdatedAt?.toISOString()} -> ${correctUpdatedAt?.toISOString()}`);
      }
    }
  }

  console.log(`Successfully completed! Total updated orders: ${updateCount}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
