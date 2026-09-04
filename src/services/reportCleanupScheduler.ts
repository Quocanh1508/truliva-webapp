import logger from '../utils/logger';

/**
 * [VÔ HIỆU HÓA HOÀN TOÀN - TUÂN THỦ RULE 7: ZERO HARD-DELETE POLICY]
 * Báo cáo KTV là tài sản chứng từ nghiệm thu tài chính vĩnh viễn, tuyệt đối không được xóa vật lý.
 */
export async function cleanupOldReports(): Promise<number> {
  logger.info('🛡️ [RULE 7] Tính năng xóa báo cáo KTV cũ đã bị vô hiệu hóa vĩnh viễn để bảo tồn dữ liệu lịch sử.');
  return 0;
}

/**
 * Khởi tạo bộ lập lịch (đã tắt vĩnh viễn)
 */
export function startReportCleanupScheduler(): void {
  logger.info('🛡️ [RULE 7] Report cleanup scheduler is permanently disabled.');
}
