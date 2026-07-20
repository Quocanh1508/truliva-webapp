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
