import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Danh sách domain hợp lệ
const ALLOWED_DOMAINS = [
  'trulivaofficial.com',
  'www.trulivaofficial.com',
  'localhost',
  '127.0.0.1'
];

// Regex phát hiện các thư viện request tự động / bot cào dữ liệu xấu (dành cho production)
const BAD_BOT_USER_AGENTS = /scrapy|python-requests|urllib|playwright|puppeteer|headless|scraper|got|superagent|phantomjs|selenium|go-http-client|libwww-perl|feedfinder|mail.ru|alexa|semrush|dotbot|rogerbot|mj12bot|ahrefsbot|yandex|baidu/i;

/**
 * Middleware bảo mật kiểm soát host & chặn bot xấu
 */
export function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const host = req.headers.host || '';
    const userAgent = req.headers['user-agent'] || '';
    const url = req.originalUrl || req.url;

    // 1. Kiểm tra Host Header (nếu có host)
    const hostName = host.split(':')[0].trim();
    if (hostName) {
      const isDomainAllowed = ALLOWED_DOMAINS.some(domain => hostName === domain || hostName.endsWith('.onrender.com'));
      if (!isDomainAllowed && process.env.NODE_ENV === 'production') {
        logger.warn(`[SECURITY_BLOCKED] IP: ${ip} | Reason: Invalid Host Header (${host}) | URL: ${url}`);
        res.status(400).json({ error: 'Bad Request: Invalid Host header' });
        return;
      }
    }

    // Bypass hoàn toàn cho Webhooks, Uploads, Health Check, Auth APIs
    if (
      url.startsWith('/webhooks/') || 
      url.startsWith('/api/auth/') || 
      url === '/health' || 
      url.startsWith('/uploads/')
    ) {
      return next();
    }

    // 2. Chặn bot cào dữ liệu xấu trong môi trường production
    if (process.env.NODE_ENV === 'production' && BAD_BOT_USER_AGENTS.test(userAgent)) {
      logger.warn(`[SECURITY_BLOCKED] IP: ${ip} | Reason: Known Bot User-Agent (${userAgent}) | URL: ${url}`);
      res.status(403).json({ error: 'Access Denied: Automated requests are not allowed.' });
      return;
    }

    next();
  } catch (error: any) {
    logger.error('Error in securityMiddleware', { error: error.message });
    next(); // Tránh crash ứng dụng nếu middleware lỗi
  }
}
