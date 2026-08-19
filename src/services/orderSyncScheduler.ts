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
 * Tự động quét và đối soát các đơn hàng đang kẹt ở trạng thái nháp (statusCode = 0) trong DB.
 * Nếu trên POS đã được xác nhận (status != 0), tự động đồng bộ sang đơn chính thức.
 */
export async function reconcileDraftOrders(): Promise<number> {
  const apiKey = process.env.PANCAKE_API_KEY;
  if (!apiKey) return 0;

  try {
    const draftOrders = await prisma.order.findMany({
      where: {
        statusCode: 0,
        pancakeOrderId: { gt: 0 }
      },
      select: {
        pancakeOrderId: true,
        billFullName: true
      },
      take: 50
    });

    if (draftOrders.length === 0) return 0;

    logger.info(`[DraftReconciliation] Checking ${draftOrders.length} draft orders for status changes...`);
    let reconciledCount = 0;

    for (const order of draftOrders) {
      try {
        const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/orders/${order.pancakeOrderId}`, {
          params: { api_key: apiKey },
          timeout: 8000
        });

        if (response.data?.success && response.data?.data) {
          const payload = response.data.data;
          if (payload.status !== 0) {
            logger.info(`[DraftReconciliation] Draft order #${order.pancakeOrderId} confirmed on POS (status: ${payload.status}). Reconciling...`);
            await processOrderEvent(null, payload);
            reconciledCount++;
          }
        }
      } catch (err: any) {
        logger.warn(`[DraftReconciliation] Failed to check order #${order.pancakeOrderId}`, { error: err.message });
      }
      // Small pause to avoid rate limits
      await new Promise(r => setTimeout(r, 100));
    }

    if (reconciledCount > 0) {
      logger.info(`[DraftReconciliation] Successfully reconciled ${reconciledCount} draft orders to active orders.`);
    }
    return reconciledCount;
  } catch (error: any) {
    logger.error('reconcileDraftOrders error', { error: error.message });
    return 0;
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
    syncRecentOrders(50)
      .then(() => reconcileDraftOrders())
      .catch(err => {
        logger.error('Initial auto orders sync failed', { error: err.message });
      });
  }, 5000); // Đợi 5 giây sau khi server start

  // Thiết lập interval
  setInterval(() => {
    logger.info('Running scheduled orders sync...');
    syncRecentOrders(50)
      .then(() => reconcileDraftOrders())
      .catch(err => {
        logger.error('Scheduled auto orders sync failed', { error: err.message });
      });
  }, intervalMinutes * 60 * 1000);
}
