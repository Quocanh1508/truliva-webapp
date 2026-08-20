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
import serialRoutes from './routes/serials';
import promoRoutes from './routes/promos';
import salaryRoutes from './routes/salaries';
import zaloMiniAppRoutes from './routes/zaloMiniApp';
import iotRoutes from './routes/iot';
import permissionRoutes from './routes/permissions';
import hotlineRoutes from './routes/hotlines';
import { startOrderSyncScheduler } from './services/orderSyncScheduler';
import { startReportCleanupScheduler } from './services/reportCleanupScheduler';
import { startPancakeRetryScheduler } from './services/pancakeRetryScheduler';
import { startProductSyncScheduler } from './services/productSyncScheduler';
import { initWebSocketServer } from './services/websocketService';
import { startMqttService } from './services/mqttService';
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
  'https://trulivaofficial.com',
  'https://www.trulivaofficial.com',
  'https://h5.zdn.vn',
  'https://zalo.me',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost',
  'capacitor://localhost'
];

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin || 
      allowedOrigins.includes(origin) || 
      origin.endsWith('trulivaofficial.com') || 
      origin.endsWith('zdn.vn') ||
      origin.endsWith('zalo.me') ||
      origin.startsWith('zalo://')
    ) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
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

// Apply rate limiting to secure logins against brute-force
app.use('/api/auth/login', loginLimiter);
app.use('/api/zalo-miniapp/auth', loginLimiter);

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
app.use('/api/serials', serialRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/salaries', salaryRoutes);
app.use('/api/zalo-miniapp', zaloMiniAppRoutes);
app.use('/api/iot', iotRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/hotlines', hotlineRoutes);

// ── Serve uploaded images ──
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

// ── Serve Zalo Domain Verification file ──
app.get('/zalo_verifierUS2Y29_U63HrryaLawT10bIDx0Mu-pPOD38t.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta property="zalo-platform-site-verification" content="US2Y29_U63HrryaLawT10bIDx0Mu-pPOD38t" />
</head>
<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>
</html>`);
});

app.get('/zalo_verifierUlIO8Ft_3I4MzQDvw8esJX2Bcsdy_KmqDZOv.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta property="zalo-platform-site-verification" content="UlIO8Ft_3I4MzQDvw8esJX2Bcsdy_KmqDZOv" />
</head>
<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>
</html>`);
});

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
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path === '/health' || req.path.startsWith('/uploads/') || req.path.startsWith('/zalo_verifier')) {
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
const server = app.listen(PORT, () => {
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
  startOrderSyncScheduler(5); // Chạy định kỳ mỗi 5 phút

  // Khởi động lập lịch dọn dẹp báo cáo KTV cũ hơn 60 ngày
  startReportCleanupScheduler();

  // Khởi động lập lịch tự động đồng bộ lại đơn lỗi sang Pancake POS
  startPancakeRetryScheduler(10); // Chạy định kỳ mỗi 10 phút

  // Khởi động lập lịch đồng bộ sản phẩm & tồn kho từ Pancake POS (mỗi 12 tiếng)
  startProductSyncScheduler(12);

  // Khởi động MQTT service kết nối Mosquitto broker cho IoT
  startMqttService();
});

initWebSocketServer(server);

export default app;
