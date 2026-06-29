import axios from 'axios';
import prisma from '../config/database';
import { syncOrderStatusToPancake } from './orderProcessor';
import logger from '../utils/logger';

const SHOP_ID = '1635300067';

/**
 * Đồng bộ lại một đơn hàng sang Pancake POS.
 */
export async function retryPancakeSync(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!order) {
    throw new Error(`Không tìm thấy đơn hàng trong DB: ${orderId}`);
  }

  if (order.pancakeOrderId <= 0) {
    logger.info(`[RetrySync] Bypassed manual order with no Pancake ID: ${order.id}`);
    return;
  }

  const apiKey = process.env.PANCAKE_API_KEY;
  if (!apiKey) {
    throw new Error('PANCAKE_API_KEY is not defined in env');
  }

  // 1. Đồng bộ sản phẩm & kho hàng nếu trạng thái là 'hoàn thành' hoặc 'chờ duyệt'
  if (['hoàn thành', 'chờ duyệt'].includes(order.adminStatus || '') && order.items.length > 0) {
    const itemNames = order.items.map(i => i.productName).filter(Boolean) as string[];
    const matchedProducts = await prisma.product.findMany({
      where: {
        name: { in: itemNames },
        isActive: true
      }
    });

    const isWarranty = (order.workType || '').toLowerCase() === 'bảo hành';
    const pancakeProducts = order.items.map(item => {
      const prod = matchedProducts.find(p => p.name === item.productName);
      return {
        variation_id: prod?.pancakeProductId || null,
        quantity: item.quantity || 1,
        price: isWarranty ? 0 : (prod?.sellingPrice || 0)
      };
    }).filter(p => p.variation_id);

    if (pancakeProducts.length > 0) {
      logger.info(`[RetrySync] Syncing products and warehouse to Pancake POS for order ${order.pancakeOrderId}`);
      const updateResponse = await axios.patch(
        `https://pos.pages.fm/api/v1/shops/${SHOP_ID}/orders/${order.pancakeOrderId}`,
        {
          products: pancakeProducts,
          warehouse_id: order.warehouseId || undefined
        },
        {
          params: { api_key: apiKey },
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      );

      if (!updateResponse.data || !updateResponse.data.success) {
        throw new Error(updateResponse.data?.message || 'Yêu cầu cập nhật sản phẩm thất bại trên Pancake POS');
      }
    }
  }

  // 2. Đồng bộ trạng thái đơn hàng
  logger.info(`[RetrySync] Syncing status to Pancake for order ${order.pancakeOrderId} -> status: ${order.adminStatus}`);
  await syncOrderStatusToPancake(order.pancakeOrderId, order.adminStatus || '');

  // 3. Cập nhật trạng thái SUCCESS trong database
  await prisma.order.update({
    where: { id: order.id },
    data: { pancakeSyncStatus: 'SUCCESS' }
  });

  logger.info(`[RetrySync] Sync success for order ${order.pancakeOrderId}`);
}

/**
 * Thực hiện quét và đồng bộ lại tất cả các đơn hàng lỗi.
 */
export async function runPancakeRetrySync(): Promise<number> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  
  // Quét các đơn hàng lỗi đồng bộ trong vòng 3 ngày qua
  const failedOrders = await prisma.order.findMany({
    where: {
      pancakeOrderId: { gt: 0 },
      pancakeSyncStatus: 'FAILED',
      updatedAt: { gte: threeDaysAgo }
    },
    select: { id: true, pancakeOrderId: true }
  });

  if (failedOrders.length === 0) {
    return 0;
  }

  logger.info(`[RetrySync] Found ${failedOrders.length} failed Pancake sync orders. Retrying...`);
  let successCount = 0;

  for (const fOrder of failedOrders) {
    try {
      await retryPancakeSync(fOrder.id);
      successCount++;
    } catch (err: any) {
      logger.error(`[RetrySync] Failed to sync order ${fOrder.pancakeOrderId}`, { error: err.message });
    }
  }

  logger.info(`[RetrySync] Completed retrying sync. Success: ${successCount}/${failedOrders.length}`);
  return successCount;
}

/**
 * Khởi tạo scheduler chạy ngầm tự động quét và đồng bộ lại các đơn lỗi.
 */
export function startPancakeRetryScheduler(intervalMinutes: number = 10): void {
  logger.info(`[RetrySync] Initializing auto Pancake retry sync scheduler every ${intervalMinutes} minutes...`);

  // Chạy lần đầu sau 15 giây để tránh làm nghẽn khởi động ứng dụng
  setTimeout(() => {
    logger.info('[RetrySync] Running initial startup Pancake retry sync...');
    runPancakeRetrySync().catch(err => {
      logger.error('[RetrySync] Initial startup Pancake retry sync failed', { error: err.message });
    });
  }, 15000);

  // Thiết lập lặp lại định kỳ
  setInterval(() => {
    logger.info('[RetrySync] Running scheduled Pancake retry sync...');
    runPancakeRetrySync().catch(err => {
      logger.error('[RetrySync] Scheduled Pancake retry sync failed', { error: err.message });
    });
  }, intervalMinutes * 60 * 1000);
}
