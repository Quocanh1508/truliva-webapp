import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env explicitly BEFORE requiring prisma
dotenv.config({ path: path.join(__dirname, '../../.env') });

const prisma = require('../config/database').default;
const { processOrderEvent } = require('../services/orderProcessor');
import axios from 'axios';
import logger from '../utils/logger';

const SHOP_ID = '1635300067';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const apiKey = process.env.PANCAKE_API_KEY;
  if (!apiKey) {
    console.error('PANCAKE_API_KEY is not defined in env');
    process.exit(1);
  }

  console.log('=== Starting Full DB Sync with Pancake POS ===');
  
  // 1. Fetch all local orders
  const localOrders = await prisma.order.findMany({
    select: {
      pancakeOrderId: true,
      adminStatus: true
    }
  });

  console.log(`Found ${localOrders.length} orders in local database to sync.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < localOrders.length; i++) {
    const localOrder = localOrders[i];
    const pancakeOrderId = localOrder.pancakeOrderId!;

    console.log(`[${i + 1}/${localOrders.length}] Syncing order #${pancakeOrderId}...`);

    try {
      // Fetch latest order details from Pancake POS API
      const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/orders/${pancakeOrderId}`, {
        params: { api_key: apiKey },
        timeout: 10000
      });

      if (response.data && response.data.success && response.data.data) {
        const orderPayload = response.data.data;
        
        // Update local database using the standard orderProcessor
        await processOrderEvent(null, orderPayload);
        successCount++;
      } else {
        console.warn(`Warning: Pancake POS API returned success=false for order #${pancakeOrderId}`);
        failCount++;
      }
    } catch (err: any) {
      console.error(`Error syncing order #${pancakeOrderId}: ${err.message}`);
      failCount++;
    }

    // Sleep 150ms between requests to avoid hitting rate limits
    await sleep(150);
  }

  console.log('=== Sync Completed ===');
  console.log(`Total processed: ${localOrders.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed/Skipped: ${failCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
