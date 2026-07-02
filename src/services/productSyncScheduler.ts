import { syncProducts } from '../scripts/syncProducts';
import logger from '../utils/logger';

let isRunning = false;

/**
 * Thực hiện đồng bộ sản phẩm/tồn kho từ Pancake POS.
 */
export async function syncAllProducts(): Promise<void> {
  if (isRunning) {
    logger.info('[ProductSync] Sync process is already running, skipping...');
    return;
  }

  isRunning = true;
  logger.info('[ProductSync] Starting background products and stock sync...');
  try {
    await syncProducts();
    logger.info('[ProductSync] Background products and stock sync completed successfully.');
  } catch (error: any) {
    logger.error('[ProductSync] Background products and stock sync failed', { error: error.message });
  } finally {
    isRunning = false;
  }
}

/**
 * Khởi động bộ lập lịch đồng bộ sản phẩm tự động (chạy ngầm mỗi 12 tiếng - 2 lần/ngày).
 */
export function startProductSyncScheduler(intervalHours: number = 12): void {
  logger.info(`[ProductSync] Initializing auto products sync scheduler every ${intervalHours} hours...`);
  
  // Chạy lần đầu tiên sau khi khởi động server 30 giây
  setTimeout(() => {
    logger.info('[ProductSync] Running initial startup products sync...');
    syncAllProducts().catch(err => {
      logger.error('[ProductSync] Initial auto products sync failed', { error: err.message });
    });
  }, 30 * 1000); 

  // Thiết lập interval chạy định kỳ
  setInterval(() => {
    logger.info('[ProductSync] Running scheduled products sync...');
    syncAllProducts().catch(err => {
      logger.error('[ProductSync] Scheduled auto products sync failed', { error: err.message });
    });
  }, intervalHours * 60 * 60 * 1000);
}
