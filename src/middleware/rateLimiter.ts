import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';

// General rate limiter for all API endpoints to protect against data scraping / crawlers
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Limit each IP to 2000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau 15 phút.'
  },
  handler: (req, res, _next, options) => {
    logger.warn('Rate limit exceeded for IP', { ip: req.ip, url: req.originalUrl });
    res.status(options.statusCode).json(options.message);
  }
});

// Endpoint public (không cần đăng nhập): chống spam/đốt quota email, Cloudinary, ZNS và dò mã
const publicLimiter = (windowMs: number, limit: number, error: string) => rateLimit({
  windowMs,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Public endpoint rate limit exceeded', { ip: req.ip, url: req.originalUrl });
    res.status(429).json({ error });
  }
});

export const forgotPasswordLimiter = publicLimiter(60 * 60 * 1000, 5, 'Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau 1 giờ.');
export const publicWriteLimiter = publicLimiter(60 * 60 * 1000, 30, 'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau.');
export const publicReadLimiter = publicLimiter(60 * 1000, 30, 'Quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.');

// Khoá tạm theo username: chặn dò mật khẩu 1 tài khoản từ nhiều IP. Chỉ đếm lần sai (status >= 400).
// Đánh đổi: kẻ xấu biết username có thể cố tình làm khoá tài khoản đó tối đa 15 phút.
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.body?.username,
  keyGenerator: (req) => 'user:' + String(req.body.username).toLowerCase().trim(),
  handler: (req, res) => {
    logger.warn('Login account temporarily locked (too many failed attempts)', { ip: req.ip, username: String(req.body?.username) });
    res.status(429).json({ error: 'Tài khoản tạm bị khoá do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' });
  }
});

// Rate limiter for authentication/login endpoint
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 login requests per 15 minutes to allow smooth testing
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Quá nhiều yêu cầu đăng nhập sai. Vui lòng thử lại sau 15 phút.'
  },
  handler: (req, res, _next, options) => {
    logger.warn('Login brute-force rate limit exceeded for IP', { ip: req.ip });
    res.status(options.statusCode).json(options.message);
  }
});
