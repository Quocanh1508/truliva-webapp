import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Danh sách domain hợp lệ (bao gồm cả cổng trong môi trường dev)
const ALLOWED_DOMAINS = [
  'trulivaofficial.com',
  'www.trulivaofficial.com',
  'localhost',
  '127.0.0.1'
];

// Regex phát hiện các thư viện request phổ biến và bot cào dữ liệu
const BOT_USER_AGENTS = /axios|python|urllib|curl|wget|postman|playwright|puppeteer|headless|scraper|got|superagent|phantomjs|selenium|go-http-client|java|libwww-perl|feedfinder|mail.ru|alexa|semrush|dotbot|rogerbot|mj12bot|ahrefsbot|yandex|baidu/i;

/**
 * Middleware bảo mật nâng cao chống bot cào dữ liệu (Anti-Scraping / Crawling)
 */
export function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const host = req.headers.host || '';
  const userAgent = req.headers['user-agent'] || '';
  const origin = req.headers.origin || '';
  const url = req.originalUrl;

  // 1. Kiểm tra Host Header (Chống quét IP trực tiếp)
  // Loại bỏ port nếu có (ví dụ: localhost:3000 -> localhost)
  const hostName = host.split(':')[0].trim();
  const isDomainAllowed = ALLOWED_DOMAINS.some(domain => hostName === domain);

  if (!isDomainAllowed) {
    logger.warn(`[SECURITY_BLOCKED] IP: ${ip} | Reason: Invalid Host Header (${host}) | URL: ${url}`);
    res.status(400).json({ error: 'Bad Request: Invalid Host header' });
    return;
  }

  // Loại trừ các đường dẫn Webhook hoặc Health check khỏi các kiểm tra bảo mật khác
  if (url.startsWith('/webhooks/') || url === '/health' || url.startsWith('/uploads/')) {
    return next();
  }

  // 2. Chặn các client tự động phổ biến dựa trên User-Agent
  if (BOT_USER_AGENTS.test(userAgent)) {
    // Không chặn curl/postman trong môi trường development để nhà phát triển dễ test
    if (process.env.NODE_ENV === 'production') {
      logger.warn(`[SECURITY_BLOCKED] IP: ${ip} | Reason: Known Bot User-Agent (${userAgent}) | URL: ${url}`);
      res.status(403).json({ error: 'Access Denied: Automated requests are not allowed.' });
      return;
    }
  }

  // 3. Kiểm định heuristic của trình duyệt (Browser Heuristics)
  // Chỉ áp dụng cho môi trường production và khi client tự nhận là trình duyệt phổ biến
  const isBrowserUA = /mozilla|chrome|safari|firefox|edge/i.test(userAgent);
  
  if (process.env.NODE_ENV === 'production' && isBrowserUA) {
    // Kiểm tra xem đây có phải là request từ Mobile App (Capacitor) không
    const isMobileApp = 
      origin.startsWith('capacitor://') || 
      origin.startsWith('http://localhost') || 
      /capacitor/i.test(userAgent);

    if (!isMobileApp) {
      // Một trình duyệt hiện đại thực sự khi gọi API từ webapp sẽ có header Sec-Fetch-Mode
      // Bots dùng python-requests, axios giả mạo User-Agent thường không gửi các headers này
      const secFetchMode = req.headers['sec-fetch-mode'];
      const secFetchSite = req.headers['sec-fetch-site'];
      const acceptLanguage = req.headers['accept-language'];

      if (!secFetchMode || !secFetchSite || !acceptLanguage) {
        logger.warn(`[SECURITY_BLOCKED] IP: ${ip} | Reason: Suspicious Browser Headers (Missing Sec-Fetch or Accept-Language) | URL: ${url} | UA: ${userAgent}`);
        res.status(403).json({ error: 'Access Denied: Browser signature verification failed.' });
        return;
      }
    }
  }

  next();
}
