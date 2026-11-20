import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Middleware xác thực webhook từ Pancake.
 *
 * Pancake KHÔNG gửi token trong header hay chữ ký, nên bảo vệ bằng secret trên URL:
 *   /webhooks/pancake?secret=<PANCAKE_WEBHOOK_SECRET>
 *
 * Không có secret mặc định trong source: thiếu cấu hình thì từ chối mọi request.
 * Khi đổi secret, đặt tạm `PANCAKE_WEBHOOK_SECRET=<mới>,<cũ>` cho tới khi Pancake đã dùng secret mới.
 */
export function verifyPancakeToken(req: Request, res: Response, next: NextFunction): void {
  const validSecrets = (process.env.PANCAKE_WEBHOOK_SECRET || '').split(',').map(s => s.trim()).filter(Boolean);
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : '';

  if (!querySecret || !validSecrets.includes(querySecret)) {
    logger.warn('Unauthorized webhook attempt', {
      ip: req.ip,
      hasSecret: !!querySecret,
      configured: validSecrets.length > 0,
    });
    res.status(401).json({ error: 'Unauthorized: Invalid or missing secret' });
    return;
  }

  next();
}
