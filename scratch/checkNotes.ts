import { config } from 'dotenv';
config();
import prisma from '../src/config/database';

async function checkNotes() {
  const events = await prisma.webhookRawEvent.findMany({
    where: { source: 'pancake' },
    orderBy: { receivedAt: 'desc' },
    take: 10
  });

  for (const event of events) {
    const payload = event.payload as any;
    console.log(`Event ID: ${event.id}`);
    console.log(`Note:`, payload.note);
    console.log(`Customer Note:`, payload.customer_note);
    console.log(`Seller Note:`, payload.seller_note);
    console.log(`Notes array:`, payload.notes);
    console.log(`Internal Note:`, payload.internal_note);
    console.log('---');
  }
}

checkNotes().catch(console.error).finally(() => prisma.$disconnect());
