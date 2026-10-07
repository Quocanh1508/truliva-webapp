import logger from '../utils/logger';
import { sendPancakeCircuitBreakerAlertEmail } from '../utils/emailService';
import prisma from '../config/database';

/**
 * Cấu hình các khoảng thời gian giãn cách thử lại (ms) theo yêu cầu người dùng:
 * - Lần 1 lỗi: Thử lại sau 20 giây
 * - Lần 2 lỗi: Thử lại sau 1 phút (Bắn email cảnh báo cấp độ 1)
 * - Lần 3 lỗi: Thử lại sau 20 phút
 * - Lần 4 lỗi: Thử lại sau 1 tiếng (60 phút)
 * - Lần 5 lỗi: Thử lại sau 2 tiếng (120 phút)
 * - Lần 6 lỗi: KHÓA HẲN CẦU CHÌ (Bắn email khẩn cấp cấp độ 2)
 */
const RETRY_INTERVALS_MS = [
  20 * 1000,          // Lần 1: 20s
  60 * 1000,          // Lần 2: 1 phút
  20 * 60 * 1000,     // Lần 3: 20 phút
  60 * 60 * 1000,     // Lần 4: 1 tiếng
  120 * 60 * 1000,    // Lần 5: 2 tiếng
];

const MAX_FAILURES = RETRY_INTERVALS_MS.length + 1; // 6 lần

class PancakeCircuitBreaker {
  private failureCount: number = 0;
  private isLocked: boolean = false;
  private nextRetryTimestamp: number = 0;
  private lastError: string | null = null;
  private lastErrorCode: number | null = null;
  private recipientEmail: string = 'quocanh0815@gmail.com';

  /**
   * Kiểm tra xem các tác vụ gọi Pancake có được phép thực thi hay không.
   */
  public canExecute(): { 
    allowed: boolean; 
    reason?: string; 
    waitSeconds?: number; 
    isLocked: boolean; 
    failureCount: number 
  } {
    const now = Date.now();

    // 1. Nếu đã bị khóa hẳn
    if (this.isLocked) {
      return {
        allowed: false,
        reason: 'Cầu chì Pancake POS đã KHÓA HẲN sau nhiều lần xác thực thất bại. Vui lòng cập nhật API Key mới.',
        isLocked: true,
        failureCount: this.failureCount
      };
    }

    // 2. Nếu đang trong thời gian giãn cách (cooldown)
    if (this.nextRetryTimestamp > now) {
      const waitSeconds = Math.ceil((this.nextRetryTimestamp - now) / 1000);
      return {
        allowed: false,
        reason: `Đang trong thời gian giãn cách thử lại (${waitSeconds}s còn lại)`,
        waitSeconds,
        isLocked: false,
        failureCount: this.failureCount
      };
    }

    // 3. Cho phép thực thi
    return {
      allowed: true,
      isLocked: false,
      failureCount: this.failureCount
    };
  }

  /**
   * Ghi nhận một yêu cầu gọi Pancake thành công.
   * Lập tức khôi phục trạng thái Healthy (Cầu chì đóng).
   */
  public recordSuccess(): void {
    if (this.failureCount > 0 || this.isLocked) {
      logger.info('[CircuitBreaker] Pancake API request succeeded! Resetting circuit breaker to HEALTHY.');
      this.failureCount = 0;
      this.isLocked = false;
      this.nextRetryTimestamp = 0;
      this.lastError = null;
      this.lastErrorCode = null;
    }
  }

  /**
   * Ghi nhận một lần gọi Pancake bị lỗi xác thực (HTTP 403 hoặc Error Code 105).
   */
  public async recordFailure(error: any): Promise<void> {
    const statusCode = error?.response?.status || 0;
    const errorCode = error?.response?.data?.error_code || null;
    const errorMsg = error?.response?.data?.message || error?.message || 'Unknown error';

    // Chỉ kích hoạt cầu chì nếu là lỗi Auth/Key/Forbidden
    const isAuthError = statusCode === 403 || errorCode === 105;
    if (!isAuthError) {
      return;
    }

    this.failureCount++;
    this.lastError = errorMsg;
    this.lastErrorCode = errorCode;

    const now = Date.now();

    if (this.failureCount >= MAX_FAILURES) {
      // 🔒 VƯỢT QUÁ SỐ LẦN CHO PHÉP -> KHÓA HẲN!
      this.isLocked = true;
      this.nextRetryTimestamp = Infinity;

      logger.error(`[CircuitBreaker] 🚨 CRITICAL: Pancake API failed ${this.failureCount} times! CIRCUIT BREAKER LOCKED to protect VPS IP!`, {
        failureCount: this.failureCount,
        errorCode,
        statusCode,
        errorMsg
      });

      // Ghi AuditLog bảo toàn lịch sử hệ thống
      try {
        await prisma.auditLog.create({
          data: {
            entityType: 'System',
            entityId: 'PANCAKE_CIRCUIT_BREAKER',
            action: 'CIRCUIT_BREAKER_LOCKED',
            changes: {
              target: 'PANCAKE_POS_API',
              failureCount: this.failureCount,
              maxFailures: MAX_FAILURES,
              errorCode,
              errorMsg,
              reason: 'Lỗi xác thực 403/105 liên tiếp, tự động khóa để bảo vệ VPS'
            },
            userId: 'system',
            userName: 'System Monitor'
          }
        });
      } catch (dbErr: any) {
        logger.warn('[CircuitBreaker] Could not write audit log', { error: dbErr.message });
      }

      // Gửi email khẩn cấp cho Quản trị viên
      await sendPancakeCircuitBreakerAlertEmail({
        failureCount: this.failureCount,
        maxFailures: MAX_FAILURES,
        isLocked: true,
        errorMessage: errorMsg,
        errorCode,
        recipientEmail: this.recipientEmail
      }).catch(mailErr => {
        logger.error('[CircuitBreaker] Failed to dispatch emergency alert email', { error: mailErr.message });
      });

    } else {
      // ⏳ ĐANG GIÃN CÁCH (BACKOFF)
      const intervalMs = RETRY_INTERVALS_MS[this.failureCount - 1] || (60 * 1000);
      this.nextRetryTimestamp = now + intervalMs;
      const waitSeconds = Math.round(intervalMs / 1000);

      logger.warn(`[CircuitBreaker] ⚠️ Pancake auth failure #${this.failureCount}/${MAX_FAILURES}. Backing off for ${waitSeconds}s...`, {
        failureCount: this.failureCount,
        waitSeconds,
        errorMsg
      });

      // Gửi email cảnh báo từ lần thử thứ 2 (hoặc 3) để Admin biết sớm trước khi bị khóa hẳn
      if (this.failureCount === 2 || this.failureCount === 4) {
        await sendPancakeCircuitBreakerAlertEmail({
          failureCount: this.failureCount,
          maxFailures: MAX_FAILURES,
          isLocked: false,
          errorMessage: errorMsg,
          errorCode,
          nextRetrySeconds: waitSeconds,
          recipientEmail: this.recipientEmail
        }).catch(mailErr => {
          logger.warn('[CircuitBreaker] Failed to dispatch warning email', { error: mailErr.message });
        });
      }
    }
  }

  /**
   * Reset trạng thái thủ công (khi Admin cập nhật API Key mới).
   */
  public reset(): void {
    logger.info('[CircuitBreaker] Manual reset triggered by Admin.');
    this.failureCount = 0;
    this.isLocked = false;
    this.nextRetryTimestamp = 0;
    this.lastError = null;
    this.lastErrorCode = null;
  }

  /**
   * Trả về thông tin trạng thái phục vụ hiển thị trên Admin / Dev dashboard.
   */
  public getStatus(): {
    failureCount: number;
    maxFailures: number;
    isLocked: boolean;
    nextRetryTimestamp: number;
    waitSeconds: number;
    lastError: string | null;
    lastErrorCode: number | null;
    recipientEmail: string;
  } {
    const now = Date.now();
    const waitSeconds = this.nextRetryTimestamp > now && this.nextRetryTimestamp !== Infinity
      ? Math.ceil((this.nextRetryTimestamp - now) / 1000)
      : 0;

    return {
      failureCount: this.failureCount,
      maxFailures: MAX_FAILURES,
      isLocked: this.isLocked,
      nextRetryTimestamp: this.nextRetryTimestamp === Infinity ? -1 : this.nextRetryTimestamp,
      waitSeconds,
      lastError: this.lastError,
      lastErrorCode: this.lastErrorCode,
      recipientEmail: this.recipientEmail
    };
  }
}

export const pancakeCircuitBreaker = new PancakeCircuitBreaker();
export default pancakeCircuitBreaker;
