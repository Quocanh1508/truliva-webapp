import axios from 'axios';
import prisma from '../config/database';
import { processOrderEvent } from './orderProcessor';
import logger from '../utils/logger';

const SHOP_ID = '1635300067';

/**
 * Đồng bộ các đơn hàng gần đây từ Pancake POS API về Database.
 * Trả về số lượng đơn hàng được xử lý.
 */
export async function syncRecentOrders(pageSize: number = 200): Promise<number> {
  const apiKey = process.env.PANCAKE_API_KEY;
  if (!apiKey) {
    logger.error('PANCAKE_API_KEY is not defined in env, order sync aborted');
    throw new Error('Chưa cấu hình API Key cho Pancake POS');
  }

  try {
    logger.info('Fetching recent orders from Pancake POS API...', { pageSize });
    // Fetch top 2 pages (200 orders)
    let syncCount = 0;
    for (let page = 1; page <= 2; page++) {
      const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/orders`, {
        params: { 
          api_key: apiKey, 
          page_size: 100, 
          page_number: page 
        },
        timeout: 15000
      });

      if (!response.data || !response.data.success || !Array.isArray(response.data.data)) {
        continue;
      }

      const orders = response.data.data;
      for (const orderPayload of orders) {
        if (!orderPayload.system_id) continue;
        try {
          await processOrderEvent(null, orderPayload);
          syncCount++;
        } catch (err: any) {
          logger.error('Error syncing individual order from API', {
            orderId: orderPayload.system_id,
            error: err.message
          });
        }
      }
    }

    logger.info(`Completed sync of ${syncCount} recent orders.`);
    return syncCount;
  } catch (error: any) {
    logger.error('syncRecentOrders failed', { error: error.message });
    throw error;
  }
}

/**
 * Khởi tạo bộ lập lịch đồng bộ đơn hàng tự động (chạy ngầm).
 */
export function startOrderSyncScheduler(intervalMinutes: number = 5): void {
  logger.info(`Initializing auto orders sync scheduler every ${intervalMinutes} minutes...`);
  
  // Chạy ngay lập tức khi khởi động server
  setTimeout(() => {
    logger.info('Running initial startup orders sync...');
    syncRecentOrders(50).catch(err => {
      logger.error('Initial auto orders sync failed', { error: err.message });
    });
  }, 5000); // Đợi 5 giây sau khi server start

  // Thiết lập interval
  setInterval(() => {
    logger.info('Running scheduled orders sync...');
    syncRecentOrders(50).catch(err => {
      logger.error('Scheduled auto orders sync failed', { error: err.message });
    });
  }, intervalMinutes * 60 * 1000);
}
