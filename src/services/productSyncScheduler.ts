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
 * Lấy giờ hiện tại theo múi giờ Việt Nam (UTC+7)
 */
export function getVietnamHour(): number {
  const now = new Date();
  return (now.getUTCHours() + 7) % 24;
}

/**
 * Kiểm tra xem hiện tại có thuộc khung giờ hành chính (08:00 - 18:00) không
 */
export function isWorkingHours(): boolean {
  const vnHour = getVietnamHour();
  return vnHour >= 8 && vnHour < 18;
}

/**
 * Khởi động bộ lập lịch đồng bộ sản phẩm tự động:
 * - Trong giờ hành chính (08:00 - 18:00): Chạy mỗi 30 phút để số liệu tồn kho luôn mới.
 * - Ngoài giờ hành chính: Chạy mỗi 2 tiếng (120 phút) để tiết kiệm tài nguyên.
 */
export function startProductSyncScheduler(workingIntervalMinutes: number = 30, offHoursIntervalMinutes: number = 120): void {
  logger.info(`[ProductSync] Initializing auto products sync scheduler (${workingIntervalMinutes} mins during 08:00-18:00, ${offHoursIntervalMinutes} mins off-hours)...`);
  
  // Chạy lần đầu tiên sau khi khởi động server 30 giây
  setTimeout(() => {
    logger.info('[ProductSync] Running initial startup products sync...');
    syncAllProducts().catch(err => {
      logger.error('[ProductSync] Initial auto products sync failed', { error: err.message });
    });
  }, 30 * 1000); 

  // Bộ định thời kiểm tra mỗi workingIntervalMinutes (mặc định 30 phút)
  const checkIntervalMs = workingIntervalMinutes * 60 * 1000;
  const offHoursMultiplier = Math.max(1, Math.round(offHoursIntervalMinutes / workingIntervalMinutes));
  let offHoursTickCount = 0;

  setInterval(() => {
    const vnHour = getVietnamHour();
    const inWorkHours = isWorkingHours();

    if (inWorkHours) {
      logger.info(`[ProductSync] [WorkHours ${vnHour}h] Running scheduled products sync...`);
      syncAllProducts().catch(err => {
        logger.error('[ProductSync] Scheduled work-hours products sync failed', { error: err.message });
      });
      offHoursTickCount = 0;
    } else {
      offHoursTickCount++;
      if (offHoursTickCount >= offHoursMultiplier) {
        logger.info(`[ProductSync] [OffHours ${vnHour}h] Running scheduled products sync (${offHoursIntervalMinutes}m interval)...`);
        syncAllProducts().catch(err => {
          logger.error('[ProductSync] Scheduled off-hours products sync failed', { error: err.message });
        });
        offHoursTickCount = 0;
      } else {
        const remainingMins = (offHoursMultiplier - offHoursTickCount) * workingIntervalMinutes;
        logger.info(`[ProductSync] [OffHours ${vnHour}h] Skipping sync. Next off-hours sync in ~${remainingMins} minutes.`);
      }
    }
  }, checkIntervalMs);
}
