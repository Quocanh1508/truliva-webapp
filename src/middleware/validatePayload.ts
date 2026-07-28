import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Middleware kiểm tra payload cơ bản từ Pancake (Step 4)
 * 
 * Đảm bảo request body có ít nhất `event_type`.
 * Nếu thiếu → trả 400 Bad Request.
 */
export function validateWebhookPayload(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  // Kiểm tra body có phải object không
  if (!body || typeof body !== 'object') {
    logger.warn('Invalid payload: body is not an object', {
      ip: req.ip,
      contentType: req.headers['content-type'],
    });
    res.status(400).json({ error: 'Invalid payload: expected JSON object' });
    return;
  }

  // Nếu là request ping / test từ Pancake (không có event_type hoặc payload rỗng) -> Trả về 200 OK
  if (!body.event_type && !body.eventType && !body.type) {
    logger.info('Test/ping webhook received without event_type', {
      ip: req.ip,
      bodyKeys: Object.keys(body),
    });
    res.status(200).json({
      status: 'ok',
      message: 'Pancake webhook endpoint active (ping/test received successfully)'
    });
    return;
  }

  next();
}
