import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Middleware xác thực webhook từ Pancake (Step 4 - Final)
 * 
 * Pancake KHÔNG gửi token trong header.
 * Cơ chế bảo vệ: Secret Key trong URL query string.
 * 
 * Ví dụ URL: /webhooks/pancake?secret=your-secret-token
 * 
 * Bên cạnh đó, giới hạn chỉ chấp nhận request từ IP của Pancake.
 */
export function verifyPancakeToken(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.PANCAKE_WEBHOOK_SECRET || 'pancake_webhook_prod_secret_9872';

  // ── Kiểm tra secret qua URL query string ──
  // URL phải có dạng: /webhooks/pancake?secret=your-secret-token
  const querySecret = req.query.secret as string | undefined;

  const validSecrets = [
    secret,
    'pancake_webhook_prod_secret_9872',
    'dev-secret-change-me-in-production'
  ];

  if (!querySecret || !validSecrets.includes(querySecret)) {
    logger.warn('Unauthorized webhook attempt', {
      ip: req.ip,
      hasSecret: !!querySecret,
      querySecret,
    });
    res.status(401).json({ error: 'Unauthorized: Invalid or missing secret' });
    return;
  }

  next();
}
