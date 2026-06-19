import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const dateStr = "2026-06-19T08:46:58.222483";
  
  // Test our parsePancakeDate logic
  const parsePancakeDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    let normalized = String(dateStr).trim();
    if (!normalized.includes('Z') && !normalized.includes('+') && !normalized.includes('-')) {
      if (!normalized.includes('T')) {
        normalized = normalized.replace(' ', 'T');
      }
      normalized = normalized + 'Z';
    }
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? new Date(dateStr) : d;
  };

  const parsedDate = parsePancakeDate(dateStr);
  console.log('Original Date String:', dateStr);
  console.log('Parsed Date object:', parsedDate);
  console.log('Parsed Date toISOString():', parsedDate?.toISOString());
  console.log('Parsed Date toString():', parsedDate?.toString());

  // Test upserting a temporary order (or updating our 3135 order)
  const testOrderId = 999999;
  
  console.log('Creating test order in database with parsed date...');
  const order = await prisma.order.upsert({
    where: { pancakeOrderId: testOrderId },
    create: {
      pancakeOrderId: testOrderId,
      pancakeCreatedAt: parsedDate,
      workType: 'Test',
      adminStatus: '0',
      rawData: {}
    },
    update: {
      pancakeCreatedAt: parsedDate
    }
  });

  console.log('Upserted order pancakeCreatedAt returned by Prisma:', order.pancakeCreatedAt);
  
  // Read raw database row using raw query to see exactly what is in PostgreSQL table
  const rawRow = await prisma.$queryRawUnsafe('SELECT pancake_created_at FROM orders WHERE pancake_order_id = $1;', testOrderId) as any[];
  console.log('Raw DB column value for test order:', rawRow[0]?.pancake_created_at);

  // Clean up
  await prisma.order.delete({ where: { pancakeOrderId: testOrderId } });
}

run().catch(console.error).finally(() => prisma.$disconnect());
