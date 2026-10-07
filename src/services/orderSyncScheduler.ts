import axios from 'axios';
import prisma from '../config/database';
import { processOrderEvent } from './orderProcessor';
import logger from '../utils/logger';
import { PANCAKE_API_BASE } from '../config/pancake';
import pancakeCircuitBreaker from './pancakeCircuitBreaker';
import { isSandboxEnvironment } from '../utils/sandboxGuard';

const SHOP_ID = '1635300067';

let isSyncingRecent = false;
let isReconciling = false;

/**
 * Đồng bộ các đơn hàng gần đây từ Pancake POS API về Database.
 * Trả về số lượng đơn hàng được xử lý.
 */
export async function syncRecentOrders(pageSize: number = 50): Promise<number> {
  if (isSyncingRecent) {
    logger.info('[RecentOrdersSync] Previous sync still in progress, skipping tick');
    return 0;
  }

  // 🛡️ Kiểm tra Cầu chì tự ngắt Circuit Breaker
  const cbCheck = pancakeCircuitBreaker.canExecute();
  if (!cbCheck.allowed) {
    logger.warn(`[RecentOrdersSync] Circuit Breaker blocked sync: ${cbCheck.reason}`);
    return 0;
  }

  isSyncingRecent = true;

  const apiKey = process.env.PANCAKE_API_KEY;
  if (!apiKey) {
    isSyncingRecent = false;
    logger.error('PANCAKE_API_KEY is not defined in env, order sync aborted');
    throw new Error('Chưa cấu hình API Key cho Pancake POS');
  }

  try {
    const maxPages = pageSize > 100 ? Math.ceil(pageSize / 100) : 1;
    const perPage = Math.min(pageSize, 100);

    logger.info('Fetching recent orders from Pancake POS API...', { pageSize, maxPages, perPage });
    let syncCount = 0;

    for (let page = 1; page <= maxPages; page++) {
      const response = await axios.get(`${PANCAKE_API_BASE}/api/v1/shops/${SHOP_ID}/orders`, {
        params: { 
          api_key: apiKey, 
          page_size: perPage, 
          page_number: page 
        },
        timeout: 15000
      });

      if (!response.data || !response.data.success || !Array.isArray(response.data.data)) {
        continue;
      }

      // Ghi nhận thành công để reset Cầu chì
      pancakeCircuitBreaker.recordSuccess();

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
    if (error.response?.status === 403 || error.response?.data?.error_code === 105) {
      await pancakeCircuitBreaker.recordFailure(error);
      logger.error('syncRecentOrders failed: PANCAKE_API_KEY is invalid or expired (code 105)', { error: error.message });
      const customErr: any = new Error('API Key của Pancake POS đã hết hạn hoặc không hợp lệ (mã lỗi 105). Vui lòng cấu hình lại PANCAKE_API_KEY trong file .env trên máy chủ.');
      customErr.response = error.response;
      throw customErr;
    }
    logger.error('syncRecentOrders failed', { error: error.message });
    throw error;
  } finally {
    isSyncingRecent = false;
  }
}

/**
 * Tự động quét và đối soát các đơn hàng đang kẹt ở trạng thái nháp (statusCode = 0) trong DB.
 * Nếu trên POS đã được xác nhận (status != 0), tự động đồng bộ sang đơn chính thức ngay lập tức.
 * Vòng lặp siêu nhẹ (chỉ kiểm tra các đơn tạo trong 7 ngày gần nhất).
 */
export async function reconcileDraftOrders(limit: number = 20): Promise<number> {
  if (isReconciling) {
    return 0; // Đang chạy tick trước, tránh chạy chồng chéo
  }

  // 🛡️ Kiểm tra Cầu chì tự ngắt Circuit Breaker
  const cbCheck = pancakeCircuitBreaker.canExecute();
  if (!cbCheck.allowed) {
    return 0;
  }

  isReconciling = true;

  const apiKey = process.env.PANCAKE_API_KEY;
  if (!apiKey) {
    isReconciling = false;
    return 0;
  }

  try {
    // Chỉ kiểm tra các đơn nháp tạo trong 7 ngày gần nhất để tối ưu hiệu năng
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const draftOrders = await prisma.order.findMany({
      where: {
        statusCode: 0,
        pancakeOrderId: { gt: 0 },
        createdAt: { gte: sevenDaysAgo }
      },
      select: {
        pancakeOrderId: true,
        billFullName: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    if (draftOrders.length === 0) {
      return 0;
    }

    let reconciledCount = 0;

    for (const order of draftOrders) {
      // Dừng ngay nếu cầu chì vừa bị ngắt bởi một request trước đó
      if (!pancakeCircuitBreaker.canExecute().allowed) {
        break;
      }

      try {
        const response = await axios.get(`${PANCAKE_API_BASE}/api/v1/shops/${SHOP_ID}/orders/${order.pancakeOrderId}`, {
          params: { api_key: apiKey },
          timeout: 8000
        });

        if (response.data?.success && response.data?.data) {
          pancakeCircuitBreaker.recordSuccess();
          const payload = response.data.data;
          // Nếu trên POS trạng thái đã khác 0 (đã xác nhận hoặc chuyển trạng thái)
          if (payload.status !== 0) {
            logger.info(`[DraftReconciliation] 🎉 Đơn nháp #${order.pancakeOrderId} đã được xác nhận trên POS (status: ${payload.status} - ${payload.status_name}). Đồng bộ ngay sang Truliva App...`);
            await processOrderEvent(null, payload);
            reconciledCount++;
          }
        }
      } catch (err: any) {
        if (err.response?.status === 403 || err.response?.data?.error_code === 105) {
          await pancakeCircuitBreaker.recordFailure(err);
          logger.error('[DraftReconciliation] PANCAKE_API_KEY is invalid or expired (code 105). Circuit breaker engaged.');
          break;
        }
        logger.warn(`[DraftReconciliation] Failed to check order #${order.pancakeOrderId}`, { error: err.message });
      }
      // Dừng 50ms giữa các request để giữ tải mạng êm dịu
      await new Promise(r => setTimeout(r, 50));
    }

    if (reconciledCount > 0) {
      logger.info(`[DraftReconciliation] Đã đồng bộ thành công ${reconciledCount} đơn vừa xác nhận từ POS sang Truliva.`);
    }
    return reconciledCount;
  } catch (error: any) {
    logger.error('reconcileDraftOrders error', { error: error.message });
    return 0;
  } finally {
    isReconciling = false;
  }
}

/**
 * Khởi tạo bộ lập lịch đồng bộ đơn hàng tự động (chạy ngầm).
 * - Fast Draft Reconciliation: mỗi 45 giây (tự động phát hiện đơn vừa xác nhận trên POS)
 * - Full Orders Sync: mỗi 2 phút (quét đối soát định kỳ toàn diện)
 */
export function startOrderSyncScheduler(intervalMinutes: number = 2): void {
  const isSandbox = isSandboxEnvironment();
  logger.info(`Initializing auto orders sync scheduler: full sync every ${intervalMinutes}m, sandboxMode: ${isSandbox}...`);
  
  // Chạy ngay lập tức khi khởi động server sau 5 giây
  setTimeout(() => {
    logger.info('[OrderSyncScheduler] Running initial startup orders sync...');
    syncRecentOrders(50)
      .then(() => reconcileDraftOrders(20))
      .catch(err => {
        logger.error('[OrderSyncScheduler] Initial auto orders sync failed', { error: err.message });
      });
  }, 5000);

  // 1. Vòng lặp kiểm tra đơn nháp - Tự động phát hiện đơn vừa được xác nhận trên POS
  // 🛡️ Trên Sandbox: Vô hiệu hóa vòng lặp siêu nhanh để bảo vệ uy tín IP VPS
  if (isSandbox) {
    logger.info('[OrderSyncScheduler] 🛡️ Sandbox protection: Fast draft loop disabled. Full sync will run on schedule.');
  } else {
    // Trên Production: Quét mỗi 45 giây (vừa êm ái vừa bảo đảm thời gian thực)
    setInterval(() => {
      reconcileDraftOrders(20).catch(err => {
        logger.error('[OrderSyncScheduler] Fast draft reconciliation loop failed', { error: err.message });
      });
    }, 45 * 1000);
  }

  // 2. Thiết lập interval định kỳ đồng bộ đối soát (mỗi 2 phút)
  setInterval(() => {
    logger.info('[OrderSyncScheduler] Running scheduled full orders sync...');
    syncRecentOrders(50)
      .then(() => reconcileDraftOrders(20))
      .catch(err => {
        logger.error('[OrderSyncScheduler] Scheduled auto orders sync failed', { error: err.message });
      });
  }, intervalMinutes * 60 * 1000);
}
