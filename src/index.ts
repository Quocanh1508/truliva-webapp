import dotenv from 'dotenv';
// ── Load biến môi trường ──
dotenv.config(); // Load environment variables

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import compression from 'compression';
import logger from './utils/logger';
import webhookRoutes from './routes/webhooks';
import authRoutes from './routes/auth';
import reportRoutes from './routes/reports';
import userRoutes from './routes/users';
import uploadRoutes from './routes/upload';
import orderRoutes from './routes/orders';
import stationRoutes from './routes/stations';
import dashboardRoutes from './routes/dashboard';
import sampleImageRoutes from './routes/sampleImages';
import feedbackRoutes from './routes/feedbacks';
import devRoutes from './routes/dev';
import notificationRoutes from './routes/notifications';
import inventoryRoutes from './routes/inventory';
import { startOrderSyncScheduler } from './services/orderSyncScheduler';
import { startReportCleanupScheduler } from './services/reportCleanupScheduler';
import { apiLimiter, loginLimiter } from './middleware/rateLimiter';
import { securityMiddleware } from './middleware/security';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Render dùng reverse proxy HTTPS)
app.set('trust proxy', 1);

// Enable gzip/deflate compression
app.use(compression());

// ── Security middleware ──
app.use(helmet({
  contentSecurityPolicy: false, // Cho phép load ảnh từ Cloudinary/Local
}));
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost',
  'capacitor://localhost'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ── Cookie parser ──
app.use(cookieParser());

// ── Parse JSON body (giới hạn 1MB để tránh payload quá lớn) ──
app.use(express.json({ limit: '1mb' }));

// ── Anti-bot & Host verification middleware ──
app.use(securityMiddleware);

// ── Honeypot trap routes for scanner bots ──
const honeypots = [
  '/wp-login.php',
  '/wp-admin',
  '/.git/config',
  '/api/admin/config',
  '/api/v1/users',
  '/phpmyadmin'
];

honeypots.forEach(path => {
  app.all(path, (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    logger.warn(`[SECURITY_BLOCKED] IP: ${ip} | Reason: Honeypot Trap Triggered (${path}) | URL: ${req.originalUrl}`);
    res.status(403).json({ error: 'Access Denied.' });
  });
});

// ── Request logging middleware (Step 6) ──
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
});

// ══════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════

// ── GET /health - Kiểm tra server còn sống (Step 2) ──
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ── Webhook routes (Step 2) ──
app.use('/webhooks', webhookRoutes);

// Apply rate limiting to secure APIs and logins against scrapers/brute-force
app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

// ── KTV Webapp API routes ──
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/sample-images', sampleImageRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/dev', devRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/inventory', inventoryRoutes);

// ── Serve uploaded images ──
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

// ── Serve webapp static files (production) ──
const webappPath = path.join(__dirname, '..', 'webapp', 'dist');
app.use(express.static(webappPath, {
  maxAge: '1y',
  setHeaders: (res, filepath) => {
    if (filepath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// ── SPA fallback: mọi route không match API/webhook → index.html ──
app.use((req, res, next) => {
  // Nếu request là API hoặc webhook thì bỏ qua (next)
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path === '/health' || req.path.startsWith('/uploads/')) {
    return next();
  }
  res.sendFile(path.join(webappPath, 'index.html'));
});

// ── Global error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// ══════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════
app.listen(PORT, () => {
  logger.info(`🚀 Truliva Webhook Server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    endpoints: [
      'GET  /health',
      'POST /webhooks/pancake',
      'POST /api/auth/login',
      'GET  /api/reports',
      'GET  /uploads',
    ],
  });

  // Khởi động lập lịch đồng bộ đơn hàng tự động từ Pancake POS
  startOrderSyncScheduler(1); // Chạy định kỳ mỗi 1 phút

  // Khởi động lập lịch dọn dẹp báo cáo KTV cũ hơn 60 ngày
  startReportCleanupScheduler();
});

export default app;
