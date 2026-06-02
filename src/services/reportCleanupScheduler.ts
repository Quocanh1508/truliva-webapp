import prisma from '../config/database';
import logger from '../utils/logger';

/**
 * Tự động xóa các báo cáo KTV (ServiceReport) cũ hơn 60 ngày kể từ ngày hoàn thành (createdAt).
 */
export async function cleanupOldReports(): Promise<number> {
  try {
    const cutOffDate = new Date();
    cutOffDate.setDate(cutOffDate.getDate() - 60);

    logger.info('🧹 Running database cleanup for reports older than 60 days...', { cutOff: cutOffDate.toISOString() });
    
    const deleteResult = await prisma.serviceReport.deleteMany({
      where: {
        createdAt: {
          lt: cutOffDate
        }
      }
    });

    if (deleteResult.count > 0) {
      logger.info(`🗑️ Đã xóa thành công ${deleteResult.count} báo cáo KTV cũ hơn 60 ngày.`);
    } else {
      logger.info('✅ Không có báo cáo KTV nào cũ hơn 60 ngày cần xóa.');
    }

    return deleteResult.count;
  } catch (error: any) {
    logger.error('Failed to cleanup old reports', { error: error.message });
    return 0;
  }
}

/**
 * Khởi tạo bộ lập lịch tự động dọn dẹp báo cáo KTV cũ (chạy ngầm).
 */
export function startReportCleanupScheduler(): void {
  logger.info('Initializing auto reports cleanup scheduler (runs every 24 hours)...');

  // Chạy ngay lập tức khi khởi động server
  setTimeout(() => {
    cleanupOldReports().catch(err => {
      logger.error('Initial reports cleanup failed', { error: err.message });
    });
  }, 10000); // Đợi 10 giây sau khi server start

  // Chạy định kỳ mỗi 24 giờ (86400000 ms)
  setInterval(() => {
    cleanupOldReports().catch(err => {
      logger.error('Scheduled reports cleanup failed', { error: err.message });
    });
  }, 24 * 60 * 60 * 1000);
}
