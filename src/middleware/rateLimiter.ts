import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';

// General rate limiter for all API endpoints to protect against data scraping / crawlers
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau 15 phút.'
  },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded for IP', { ip: req.ip, url: req.originalUrl });
    res.status(options.statusCode).send(options.message);
  }
});

// Strict rate limiter for authentication/login endpoint to prevent brute-force attacks
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Quá nhiều yêu cầu đăng nhập sai. Vui lòng thử lại sau 15 phút.'
  },
  handler: (req, res, next, options) => {
    logger.warn('Login brute-force rate limit exceeded for IP', { ip: req.ip });
    res.status(options.statusCode).send(options.message);
  }
});
