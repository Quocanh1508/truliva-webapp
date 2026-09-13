import logger from './logger';

/**
 * Kiểm tra xem tiến trình hiện tại có đang chạy trên môi trường Sandbox / Staging hay không.
 * Điều kiện phát hiện:
 * 1. DATABASE_URL chứa chữ 'sandbox'
 * 2. NODE_ENV là 'staging' hoặc 'sandbox'
 * 3. Biến IS_SANDBOX = 'true'
 */
export function isSandboxEnvironment(): boolean {
  const dbUrl = (process.env.DATABASE_URL || '').toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const isSandboxExplicit = process.env.IS_SANDBOX === 'true';

  return dbUrl.includes('sandbox') || nodeEnv === 'staging' || nodeEnv === 'sandbox' || isSandboxExplicit;
}

/**
 * Ghi log bảo vệ khi một tác vụ ngoại vi bị chặn trên Sandbox.
 */
export function logSandboxBlockedAction(actionName: string, meta?: Record<string, any>): void {
  logger.info(`[SANDBOX GUARD] Blocked external side-effect: ${actionName}`, {
    ...meta,
    environment: 'SANDBOX'
  });
}
